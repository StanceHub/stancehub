import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import {
  insertJobOutbox,
  meetings,
  publishOutboxForMeetingGeneration,
  supersedePendingOutbox,
} from "@stancehub/db";
import { JOB_NAMES } from "@stancehub/shared";
import { getWorkerDb } from "../db";
import { createWorkerOutboxQueue } from "../outbox-queue";

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
 * Bump summary generation + insert outbox in one txn; best-effort publish after commit.
 * On Redis publish failure, leave pending outbox — worker drain recovers.
 */
export async function scheduleMeetingSummary(input: {
  organizationId: string;
  meetingId: string;
  queue: Queue;
}) {
  const db = getWorkerDb();
  const scheduled = await db.transaction(async (tx) => {
    const [bumped] = await tx
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
    if (!bumped) return null;

    await supersedePendingOutbox(tx, {
      jobName: JOB_NAMES.summarizeMeeting,
      meetingId: input.meetingId,
      exceptGeneration: bumped.generation,
    });

    const payload = {
      organizationId: bumped.organizationId,
      meetingId: input.meetingId,
      generation: bumped.generation,
    };
    const outboxId = await insertJobOutbox(tx, {
      jobName: JOB_NAMES.summarizeMeeting,
      organizationId: bumped.organizationId,
      meetingId: input.meetingId,
      generation: bumped.generation,
      payload,
    });

    return { generation: bumped.generation, outboxId };
  });

  if (!scheduled) return { ok: false as const, reason: "meeting_missing" };

  const published = await publishOutboxForMeetingGeneration(
    db,
    createWorkerOutboxQueue(input.queue),
    {
      jobName: JOB_NAMES.summarizeMeeting,
      meetingId: input.meetingId,
      generation: scheduled.generation,
    },
  );

  return {
    ok: true as const,
    generation: scheduled.generation,
    outboxId: scheduled.outboxId,
    enqueue: published.enqueue,
  };
}
