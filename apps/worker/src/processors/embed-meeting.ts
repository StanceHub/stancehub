import { and, desc, eq, sql } from "drizzle-orm";
import type { Job } from "bullmq";
import {
  chunkCues,
  chunkText,
  createEmbeddingClient,
  parseTranscript,
} from "@stancehub/ai";
import {
  assertEmbedding,
  attachMeetingSearchStats,
  chunks,
  DEFAULT_EMBEDDING_DIMENSIONS,
  meetings,
  orgSearchStatsLockSql,
  removeMeetingChunksAndStats,
  transcripts,
} from "@stancehub/db";
import { embedMeetingPayloadSchema } from "@stancehub/shared";
import { readEmbeddingConfig } from "../embed-config";
import { getWorkerDb } from "../db";
import { markEmbedFailed } from "./embed-status";
import { scheduleMeetingSummary } from "./summarize-status";
import { getSummarizeQueue } from "../summarize-queue";

const BATCH = 16;

export function isLastEmbedAttempt(job: { attemptsMade: number; opts: { attempts?: number } }) {
  const maxAttempts = job.opts.attempts ?? 1;
  return job.attemptsMade + 1 >= maxAttempts;
}

export function embedClaimDisposition(currentGeneration: number | null, payloadGeneration: number) {
  if (currentGeneration == null || currentGeneration > payloadGeneration) return "stale" as const;
  if (currentGeneration < payloadGeneration) return "wait" as const;
  return "claim" as const;
}

export async function processEmbedMeeting(job: Job) {
  const payload = embedMeetingPayloadSchema.parse(job.data);
  try {
    const config = readEmbeddingConfig();
    if (config.dimensions !== DEFAULT_EMBEDDING_DIMENSIONS) {
      throw new Error(`EMBEDDING_DIMENSIONS must be ${DEFAULT_EMBEDDING_DIMENSIONS}`);
    }

    const db = getWorkerDb();
    const [transcript] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.meetingId, payload.meetingId))
      .orderBy(desc(transcripts.version))
      .limit(1);

    if (!transcript || transcript.organizationId !== payload.organizationId) {
      return { ok: true as const, meetingId: payload.meetingId, stale: true };
    }

    const claimed = await db
      .update(meetings)
      .set({ pipelineStatus: "embedding", pipelineError: null, updatedAt: new Date() })
      .where(and(eq(meetings.id, payload.meetingId), eq(meetings.embedGeneration, payload.generation)))
      .returning({ id: meetings.id });
    if (claimed.length === 0) {
      const [current] = await db
        .select({ generation: meetings.embedGeneration })
        .from(meetings)
        .where(eq(meetings.id, payload.meetingId))
        .limit(1);
      const disposition = embedClaimDisposition(current?.generation ?? null, payload.generation);
      if (disposition === "wait") {
        throw new Error("Embed generation is not committed yet");
      }
      return { ok: true as const, meetingId: payload.meetingId, stale: true };
    }
    const parsed = parseTranscript(transcript.rawText, transcript.format);
    const pieces =
      parsed.cues.length > 0
        ? chunkCues(parsed.cues, config.chunkMaxChars)
        : chunkText(parsed.text, config.chunkMaxChars);
    if (pieces.length === 0) throw new Error("Transcript produced no chunks");

    const client = createEmbeddingClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      dimensions: config.dimensions,
    });

    const vectors: number[][] = [];
    for (let i = 0; i < pieces.length; i += BATCH) {
      const embedded = await client.embed(pieces.slice(i, i + BATCH).map((piece) => piece.content));
      for (const vector of embedded) {
        assertEmbedding(vector);
        vectors.push(vector);
      }
    }
    if (vectors.length !== pieces.length) {
      throw new Error(`Embedding count ${vectors.length} does not match chunks ${pieces.length}`);
    }

    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${payload.meetingId}))`);
      await tx.execute(orgSearchStatsLockSql(payload.organizationId));
      const [current] = await tx
        .select({ version: transcripts.version })
        .from(transcripts)
        .where(eq(transcripts.id, transcript.id))
        .limit(1);
      if (!current || current.version !== transcript.version) {
        throw new Error("Transcript changed while embedding");
      }

      await removeMeetingChunksAndStats(tx, {
        organizationId: payload.organizationId,
        meetingId: payload.meetingId,
      });
      await tx.insert(chunks).values(
        pieces.map((piece, index) => ({
          id: crypto.randomUUID(),
          organizationId: payload.organizationId,
          meetingId: payload.meetingId,
          transcriptId: transcript.id,
          content: piece.content,
          chunkIndex: index,
          startOffset: piece.startOffset,
          endOffset: piece.endOffset,
          startMs: piece.startMs,
          endMs: piece.endMs,
          embedding: vectors[index]!,
          tokenCount: 0,
        })),
      );
      await attachMeetingSearchStats(tx, {
        organizationId: payload.organizationId,
        meetingId: payload.meetingId,
      });
      const ready = await tx
        .update(meetings)
        .set({ pipelineStatus: "ready", pipelineError: null, updatedAt: new Date() })
        .where(and(eq(meetings.id, payload.meetingId), eq(meetings.embedGeneration, payload.generation)))
        .returning({ id: meetings.id });
      if (ready.length === 0) {
        throw new Error("Embed attempt was superseded");
      }
    });

    const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
    const summarizeQueue = getSummarizeQueue(redisUrl);
    try {
      await scheduleMeetingSummary({
        organizationId: payload.organizationId,
        meetingId: payload.meetingId,
        queue: summarizeQueue,
      });
    } catch (summaryError) {
      console.error("[worker] summarize schedule failed after embed ready", summaryError);
    } finally {
      try {
        await summarizeQueue.close();
      } catch (closeError) {
        console.error("[worker] summarize queue close failed", closeError);
      }
    }

    return { ok: true as const, meetingId: payload.meetingId, chunks: pieces.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "embed failed";
    if (message === "Embed attempt was superseded") {
      return { ok: true as const, meetingId: payload.meetingId, stale: true };
    }
    if (isLastEmbedAttempt(job)) {
      await markEmbedFailed(payload.meetingId, payload.generation, message);
    }
    throw error;
  }
}
