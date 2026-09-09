import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import { meetings } from "@stancehub/db";
import { isLiveJobState, summarizeJobId } from "@stancehub/shared";
import { getWorkerDb } from "../db";
import { enqueueSummarizeMeeting } from "../summarize-queue";

const OPEN_SUMMARY = ["pending", "running"] as const;

export async function markSummaryFailed(meetingId: string, generation: number, message: string) {
  const db = getWorkerDb();
  await db
    .update(meetings)
    .set({
      summaryStatus: "failed",
      summaryError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(meetings.id, meetingId),
        eq(meetings.summaryGeneration, generation),
        inArray(meetings.summaryStatus, [...OPEN_SUMMARY]),
      ),
    );
}

/**
 * Bump summary generation and enqueue summarize. Called after embed becomes ready.
 * On enqueue failure, marks this generation failed without touching embed status.
 */
export async function scheduleMeetingSummary(input: {
  organizationId: string;
  meetingId: string;
  queue: Queue;
}) {
  const db = getWorkerDb();
  const [bumped] = await db
    .update(meetings)
    .set({
      summaryGeneration: sql`${meetings.summaryGeneration} + 1`,
      summaryStatus: "pending",
      summaryError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(meetings.id, input.meetingId), eq(meetings.organizationId, input.organizationId)))
    .returning({
      generation: meetings.summaryGeneration,
      organizationId: meetings.organizationId,
    });
  if (!bumped) return { ok: false as const, reason: "meeting_missing" };

  try {
    const queued = await enqueueSummarizeMeeting(input.queue, {
      organizationId: bumped.organizationId,
      meetingId: input.meetingId,
      generation: bumped.generation,
    });
    return { ok: true as const, generation: bumped.generation, alreadyRunning: queued.alreadyRunning };
  } catch (error) {
    const message = error instanceof Error ? error.message : "summarize enqueue failed";
    await markSummaryFailed(input.meetingId, bumped.generation, message);
    return { ok: false as const, reason: "enqueue_failed", message };
  }
}

export async function reconcileOpenSummaries(queue: Queue) {
  const db = getWorkerDb();
  const rows = await db
    .select({
      id: meetings.id,
      generation: meetings.summaryGeneration,
    })
    .from(meetings)
    .where(inArray(meetings.summaryStatus, [...OPEN_SUMMARY]));

  for (const row of rows) {
    const job = await queue.getJob(summarizeJobId(row.id, row.generation));
    const state = job ? await job.getState() : "missing";
    if (isLiveJobState(state)) continue;
    await markSummaryFailed(row.id, row.generation, "Summarize job is no longer running");
  }
}
