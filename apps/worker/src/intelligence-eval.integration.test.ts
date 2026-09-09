import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import {
  createChatClient,
  createEmbeddingClient,
  resolveChatEndpoint,
  resolveEmbeddingEndpoint,
} from "@stancehub/ai";
import {
  citationsFromAnswer,
  parseMeetingSummaryPayload,
} from "@stancehub/shared";
import {
  chunks,
  createDb,
  meetingArtifacts,
  meetings,
  organization,
  searchChunksByKeyword,
  searchChunksByVector,
  reciprocalRankFusion,
  tasks,
  transcripts,
} from "@stancehub/db";
import { closeWorkerDb } from "./db";
import { processEmbedMeeting } from "./processors/embed-meeting";
import { processSummarizeMeeting } from "./processors/summarize-meeting";

/**
 * Intelligence eval (Sprint 2 / #30 / #37).
 * - Always-safe unit checks run with the default test suite.
 * - Live path: RUN_LLM_EVAL=1 with DATABASE_URL + embed/chat endpoints.
 */

const live = process.env.RUN_LLM_EVAL === "1";
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "../fixtures");
const goldens = JSON.parse(
  readFileSync(join(fixturesDir, "intelligence-goldens.json"), "utf8"),
) as {
  fixture: string;
  title: string;
  summarize: { summaryNeedles: string[]; minActions: number };
  ask: Array<{ query: string; answerNeedle: string; requireCitation: boolean }>;
};

describe("intelligence goldens (offline)", () => {
  it("requires citation markers before listing citations", () => {
    const hits = [
      {
        chunkId: "c1",
        meetingId: "m1",
        meetingTitle: "Kickoff",
        content: "Share links stay out of this sprint.",
        startMs: 0,
        endMs: 1000,
      },
    ];
    expect(citationsFromAnswer("I cannot find that in the vault.", hits)).toEqual([]);
    expect(citationsFromAnswer("Share links are out [1].", hits)[0]?.chunkId).toBe("c1");
  });

  it("parses summarize JSON shaped like the greeting fixture decisions", () => {
    const parsed = parseMeetingSummaryPayload(
      JSON.stringify({
        summary:
          "Priya decided to ship a short welcome transcript for dogfood and keep share links out of this sprint.",
        actions: [
          { title: "Upload sample to vault and verify search", assigneeHint: "Sam" },
          { title: "Draft welcome message after signup", assigneeHint: "Alex" },
        ],
      }),
    );
    for (const needle of goldens.summarize.summaryNeedles) {
      expect(parsed.summary.toLowerCase()).toContain(needle.toLowerCase());
    }
    expect(parsed.actions.length).toBeGreaterThanOrEqual(goldens.summarize.minActions);
  });
});

describe.skipIf(!live)("intelligence live eval", () => {
  const organizationId = `org_intel_${Date.now()}`;
  const meetingId = `mtg_intel_${Date.now()}`;
  const db = createDb(process.env.DATABASE_URL ?? "");

  afterAll(async () => {
    await db.delete(organization).where(eq(organization.id, organizationId));
    await closeWorkerDb();
  });

  it("embeds, summarizes, and answers greeting goldens with citations-capable ask", async () => {
    const rawText = readFileSync(join(fixturesDir, goldens.fixture), "utf8");
    await db.insert(organization).values({
      id: organizationId,
      name: "Intel eval",
      slug: organizationId,
    });
    await db.insert(meetings).values({
      id: meetingId,
      organizationId,
      title: goldens.title,
      source: "upload",
      pipelineStatus: "pending",
      embedGeneration: 1,
      summaryGeneration: 0,
      summaryStatus: "idle",
    });
    await db.insert(transcripts).values({
      id: crypto.randomUUID(),
      organizationId,
      meetingId,
      rawText,
      format: "vtt",
      version: 1,
    });

    await processEmbedMeeting({
      data: { organizationId, meetingId, generation: 1 },
      attemptsMade: 0,
      opts: { attempts: 1 },
    } as Job);

    const [embedded] = await db
      .select({
        status: meetings.pipelineStatus,
        summaryStatus: meetings.summaryStatus,
        summaryGeneration: meetings.summaryGeneration,
      })
      .from(meetings)
      .where(eq(meetings.id, meetingId));
    expect(embedded?.status).toBe("ready");

    if (embedded?.summaryStatus !== "ready") {
      const generation = embedded?.summaryGeneration && embedded.summaryGeneration > 0 ? embedded.summaryGeneration : 1;
      if (embedded?.summaryStatus === "failed" || embedded?.summaryStatus === "idle") {
        await db
          .update(meetings)
          .set({
            summaryGeneration: generation,
            summaryStatus: "pending",
            summaryError: null,
          })
          .where(eq(meetings.id, meetingId));
      }
      await processSummarizeMeeting({
        data: { organizationId, meetingId, generation },
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as Job);
    }

    const [summarized] = await db
      .select({ status: meetings.summaryStatus })
      .from(meetings)
      .where(eq(meetings.id, meetingId));
    expect(summarized?.status).toBe("ready");

    const [summary] = await db
      .select()
      .from(meetingArtifacts)
      .where(and(eq(meetingArtifacts.meetingId, meetingId), eq(meetingArtifacts.kind, "summary")));
    expect(summary?.contentText).toBeTruthy();
    for (const needle of goldens.summarize.summaryNeedles) {
      expect(summary!.contentText!.toLowerCase()).toContain(needle.toLowerCase());
    }
    const taskRows = await db.select().from(tasks).where(eq(tasks.meetingId, meetingId));
    expect(taskRows.length).toBeGreaterThanOrEqual(goldens.summarize.minActions);

    const embed = resolveEmbeddingEndpoint(process.env as Record<string, string | undefined>);
    const chat = resolveChatEndpoint(process.env as Record<string, string | undefined>);
    const embedClient = createEmbeddingClient({
      baseUrl: embed.baseUrl,
      apiKey: embed.apiKey,
      model: embed.model,
      dimensions: embed.dimensions,
      timeoutMs: 8000,
    });
    const chatClient = createChatClient({
      baseUrl: chat.baseUrl,
      apiKey: chat.apiKey,
      model: chat.model,
      timeoutMs: chat.timeoutMs,
    });

    for (const ask of goldens.ask) {
      const [embedding] = await embedClient.embed([ask.query]);
      const vector = await searchChunksByVector(db, {
        organizationId,
        embedding: embedding ?? [],
        limit: 8,
      });
      const keyword = await searchChunksByKeyword(db, {
        organizationId,
        query: ask.query,
        limit: 8,
      });
      const fused = reciprocalRankFusion([keyword, vector], { limit: 8 });
      expect(fused.length).toBeGreaterThan(0);

      const context = fused
        .map((hit, index) => `[${index + 1}] ${hit.content}`)
        .join("\n\n");
      const { content, finishReason } = await chatClient.chat({
        messages: [
          {
            role: "system",
            content:
              "Answer using only the numbered excerpts. Cite as [n]. If insufficient, say you cannot find that in the vault.",
          },
          { role: "user", content: `Question: ${ask.query}\n\nExcerpts:\n${context}` },
        ],
        temperature: 0.2,
        maxTokens: 2048,
      });
      if (finishReason === "length") {
        throw new Error(`ask golden truncated for query: ${ask.query}`);
      }
      expect(content.toLowerCase()).toContain(ask.answerNeedle.toLowerCase());
      const cites = citationsFromAnswer(
        content,
        fused.map((hit) => ({
          chunkId: hit.chunkId,
          meetingId: hit.meetingId,
          meetingTitle: hit.meetingTitle,
          content: hit.content,
          startMs: hit.startMs,
          endMs: hit.endMs,
        })),
      );
      if (ask.requireCitation) {
        expect(cites.length).toBeGreaterThan(0);
      }
      const stored = await db.select().from(chunks).where(eq(chunks.organizationId, organizationId));
      expect(stored.length).toBeGreaterThan(0);
    }
  }, 300_000);
});
