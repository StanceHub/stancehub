import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Job } from "bullmq";
import {
  ChatCompletionTruncatedError,
  createChatClient,
  isChatCompletionTruncatedError,
  type ChatClient,
  type ChatMessage,
} from "@stancehub/ai";
import { meetingArtifacts, meetings, tasks, transcripts } from "@stancehub/db";
import {
  parseMeetingSummaryPayload,
  summarizeMeetingPayloadSchema,
  type MeetingAction,
} from "@stancehub/shared";
import {
  MAX_SUMMARIZE_MAX_TOKENS,
  readChatConfig,
  readSummarizeMaxTokens,
} from "../chat-config";
import { getWorkerDb } from "../db";
import { embedOrgMismatchMessage, isLastEmbedAttempt } from "./embed-meeting";
import { markSummaryFailed } from "./summarize-status";

export const SUMMARY_PROMPT_VERSION = "v1";

const CLAIMABLE_SUMMARY = ["pending", "running"] as const;

export function summarizeOrgMismatchMessage() {
  return embedOrgMismatchMessage();
}

export function summarizeClaimDisposition(
  currentGeneration: number | null,
  payloadGeneration: number,
) {
  if (currentGeneration == null || currentGeneration > payloadGeneration) return "stale" as const;
  if (currentGeneration < payloadGeneration) return "wait" as const;
  return "claim" as const;
}

/** After a missed claim when generations match: ready is idempotent; open statuses must retry. */
export function summarizeMissedClaimAction(status: string | null | undefined) {
  if (status === "ready") return "already_ready" as const;
  if (status === "pending" || status === "running") return "retry_claim" as const;
  return "stale" as const;
}

export function nextSummarizeTokenBudget(current: number) {
  const bumped = Math.min(current * 2, MAX_SUMMARIZE_MAX_TOKENS);
  return bumped > current ? bumped : null;
}

function isSummaryParseFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (error.name === "ZodError") return true;
  return error.message === "Model response did not contain JSON";
}

function buildSummarizeMessages(title: string, transcript: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You extract meeting memory for an organization vault. Reply with JSON only: " +
        '{"summary":"...", "actions":[{"title":"...","assigneeHint":"..."}]}. ' +
        "Use only the transcript. If there are no actions, return an empty actions array. " +
        "assigneeHint is optional.",
    },
    {
      role: "user",
      content: `Meeting title: ${title}\n\nTranscript:\n${transcript.slice(0, 120_000)}`,
    },
  ];
}

export async function summarizeWithChat(input: {
  client: ChatClient;
  messages: ChatMessage[];
  maxTokens: number;
  meetingId: string;
  generation: number;
}) {
  const run = async (maxTokens: number, jsonObject: boolean) => {
    const result = await input.client.chat({
      messages: input.messages,
      temperature: 0.2,
      maxTokens,
      jsonObject,
    });
    if (result.finishReason === "length") {
      throw new ChatCompletionTruncatedError("length", result.content);
    }
    return parseMeetingSummaryPayload(result.content);
  };

  const attemptBudget = async (maxTokens: number) => {
    try {
      return await run(maxTokens, true);
    } catch (error) {
      if (isChatCompletionTruncatedError(error)) throw error;
      if (!isSummaryParseFailure(error)) throw error;
      // JSON shape/format failure only: plain completion at the same budget.
      return await run(maxTokens, false);
    }
  };

  try {
    return await attemptBudget(input.maxTokens);
  } catch (error) {
    if (!isChatCompletionTruncatedError(error)) throw error;
    const bumped = nextSummarizeTokenBudget(input.maxTokens);
    if (bumped == null) throw error;
    console.warn(
      JSON.stringify({
        event: "vault.summarize.truncate_retry",
        meetingId: input.meetingId,
        generation: input.generation,
        fromMaxTokens: input.maxTokens,
        toMaxTokens: bumped,
        finishReason: error.finishReason,
      }),
    );
    return await attemptBudget(bumped);
  }
}

export async function processSummarizeMeeting(job: Job) {
  const payload = summarizeMeetingPayloadSchema.parse(job.data);
  const db = getWorkerDb();

  try {
    const claimed = await db
      .update(meetings)
      .set({ summaryStatus: "running", summaryError: null, updatedAt: new Date() })
      .where(
        and(
          eq(meetings.id, payload.meetingId),
          eq(meetings.organizationId, payload.organizationId),
          eq(meetings.summaryGeneration, payload.generation),
          inArray(meetings.summaryStatus, [...CLAIMABLE_SUMMARY]),
        ),
      )
      .returning({
        id: meetings.id,
        title: meetings.title,
        embedGeneration: meetings.embedGeneration,
      });

    if (claimed.length === 0) {
      const [current] = await db
        .select({
          generation: meetings.summaryGeneration,
          status: meetings.summaryStatus,
          organizationId: meetings.organizationId,
        })
        .from(meetings)
        .where(eq(meetings.id, payload.meetingId))
        .limit(1);
      if (current && current.organizationId !== payload.organizationId) {
        await markSummaryFailed(
          payload.meetingId,
          payload.generation,
          payload.organizationId,
          summarizeOrgMismatchMessage(),
        );
        throw new Error(summarizeOrgMismatchMessage());
      }
      const disposition = summarizeClaimDisposition(current?.generation ?? null, payload.generation);
      if (disposition === "wait") {
        throw new Error("Summary generation is not committed yet");
      }
      if (disposition === "stale") {
        return { ok: true as const, meetingId: payload.meetingId, stale: true };
      }
      const missed = summarizeMissedClaimAction(current?.status);
      if (missed === "already_ready") {
        return { ok: true as const, meetingId: payload.meetingId, alreadyReady: true };
      }
      if (missed === "retry_claim") {
        throw new Error("Summarize claim race");
      }
      return { ok: true as const, meetingId: payload.meetingId, stale: true };
    }

    const meeting = claimed[0]!;
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(
        and(
          eq(transcripts.meetingId, payload.meetingId),
          eq(transcripts.organizationId, payload.organizationId),
        ),
      )
      .orderBy(desc(transcripts.version))
      .limit(1);
    if (!transcript) {
      throw new Error("Transcript not found for meeting");
    }

    const config = readChatConfig();
    const maxTokens = readSummarizeMaxTokens();
    const client = createChatClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      timeoutMs: config.timeoutMs,
    });
    const messages = buildSummarizeMessages(meeting.title, transcript.rawText);
    const parsed = await summarizeWithChat({
      client,
      messages,
      maxTokens,
      meetingId: payload.meetingId,
      generation: payload.generation,
    });

    const actions: MeetingAction[] = parsed.actions;

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`summarize:${payload.meetingId}`}))`);
      const [still] = await tx
        .select({ generation: meetings.summaryGeneration, status: meetings.summaryStatus })
        .from(meetings)
        .where(
          and(
            eq(meetings.id, payload.meetingId),
            eq(meetings.organizationId, payload.organizationId),
            eq(meetings.summaryGeneration, payload.generation),
            eq(meetings.summaryStatus, "running"),
          ),
        )
        .limit(1);
      if (!still) {
        throw new Error("Summarize attempt was superseded");
      }

      await tx
        .delete(meetingArtifacts)
        .where(
          and(
            eq(meetingArtifacts.meetingId, payload.meetingId),
            eq(meetingArtifacts.organizationId, payload.organizationId),
          ),
        );
      await tx.insert(meetingArtifacts).values([
        {
          id: crypto.randomUUID(),
          organizationId: payload.organizationId,
          meetingId: payload.meetingId,
          kind: "summary",
          contentText: parsed.summary,
          contentJson: null,
          model: config.model,
          promptVersion: SUMMARY_PROMPT_VERSION,
          embedGeneration: meeting.embedGeneration,
          summaryGeneration: payload.generation,
        },
        {
          id: crypto.randomUUID(),
          organizationId: payload.organizationId,
          meetingId: payload.meetingId,
          kind: "actions",
          contentText: null,
          contentJson: actions,
          model: config.model,
          promptVersion: SUMMARY_PROMPT_VERSION,
          embedGeneration: meeting.embedGeneration,
          summaryGeneration: payload.generation,
        },
      ]);

      await tx
        .delete(tasks)
        .where(
          and(eq(tasks.meetingId, payload.meetingId), eq(tasks.organizationId, payload.organizationId)),
        );
      if (actions.length > 0) {
        await tx.insert(tasks).values(
          actions.map((action, index) => ({
            id: crypto.randomUUID(),
            organizationId: payload.organizationId,
            meetingId: payload.meetingId,
            title: action.title.slice(0, 500),
            status: "open",
            assigneeHint: action.assigneeHint?.slice(0, 200) ?? null,
            sourceActionIndex: index,
          })),
        );
      }

      const ready = await tx
        .update(meetings)
        .set({ summaryStatus: "ready", summaryError: null, updatedAt: new Date() })
        .where(
          and(
            eq(meetings.id, payload.meetingId),
            eq(meetings.organizationId, payload.organizationId),
            eq(meetings.summaryGeneration, payload.generation),
          ),
        )
        .returning({ id: meetings.id });
      if (ready.length === 0) {
        throw new Error("Summarize attempt was superseded");
      }
    });

    return {
      ok: true as const,
      meetingId: payload.meetingId,
      actions: actions.length,
      summaryGeneration: payload.generation,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "summarize failed";
    if (message === "Summarize attempt was superseded") {
      return { ok: true as const, meetingId: payload.meetingId, stale: true };
    }
    if (isLastEmbedAttempt(job) || message === summarizeOrgMismatchMessage()) {
      await markSummaryFailed(
        payload.meetingId,
        payload.generation,
        payload.organizationId,
        message,
      );
    }
    throw error;
  }
}
