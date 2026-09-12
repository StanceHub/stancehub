import { and, eq, sql } from "drizzle-orm";
import {
  insertJobOutbox,
  meetings,
  publishOutboxForMeetingGeneration,
  supersedePendingOutbox,
} from "@stancehub/db";
import { JOB_NAMES, isLiveEmbedJobState } from "@stancehub/shared";
import { ensureAppDbRole, withOrgScope } from "@/server/db";
import { getEmbedJob, getQueue } from "@/server/queue";
import { createWebOutboxQueue } from "@/server/outbox-queue";

export type PrepareEmbedRetryResult =
  | { status: "not_found" }
  | { status: "already_running"; jobId: string }
  | { status: "queued"; generation: number; outboxId: string };

/**
 * Bump embed generation, mark pending, and insert outbox under the retry advisory lock.
 * Caller must best-effort publish after commit (do not mark meeting failed if Redis is down).
 *
 * Note: `getEmbedJob` runs inside the xact advisory lock intentionally (live-job race).
 */
export async function prepareMeetingEmbedRetry(input: {
  organizationId: string;
  meetingId: string;
}): Promise<PrepareEmbedRetryResult> {
  return withOrgScope(input.organizationId, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`embed-retry:${input.meetingId}`}))`);

    const [current] = await tx
      .select({ generation: meetings.embedGeneration })
      .from(meetings)
      .where(and(eq(meetings.id, input.meetingId), eq(meetings.organizationId, input.organizationId)))
      .limit(1);
    if (!current) return { status: "not_found" as const };

    const running = await getEmbedJob(input.meetingId, current.generation);
    if (running && isLiveEmbedJobState(running.state)) {
      return { status: "already_running" as const, jobId: running.job.id ?? "" };
    }

    const [bumped] = await tx
      .update(meetings)
      .set({
        embedGeneration: sql`${meetings.embedGeneration} + 1`,
        pipelineStatus: "pending",
        pipelineError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(meetings.id, input.meetingId), eq(meetings.organizationId, input.organizationId)))
      .returning({ generation: meetings.embedGeneration });
    if (!bumped) return { status: "not_found" as const };

    await supersedePendingOutbox(tx, {
      jobName: JOB_NAMES.embedMeeting,
      meetingId: input.meetingId,
      exceptGeneration: bumped.generation,
    });

    const payload = {
      organizationId: input.organizationId,
      meetingId: input.meetingId,
      generation: bumped.generation,
    };
    const outboxId = await insertJobOutbox(tx, {
      jobName: JOB_NAMES.embedMeeting,
      organizationId: input.organizationId,
      meetingId: input.meetingId,
      generation: bumped.generation,
      payload,
    });

    return { status: "queued" as const, generation: bumped.generation, outboxId };
  });
}

/** Best-effort Redis publish after outbox commit. Never marks meeting failed. */
export async function publishPreparedMeetingEmbed(input: {
  organizationId: string;
  meetingId: string;
  generation: number;
}) {
  const queue = createWebOutboxQueue(getQueue());
  const db = await ensureAppDbRole();
  return publishOutboxForMeetingGeneration(db, queue, {
    jobName: JOB_NAMES.embedMeeting,
    meetingId: input.meetingId,
    generation: input.generation,
    organizationId: input.organizationId,
  });
}
