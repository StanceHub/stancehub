import { inArray } from "drizzle-orm";
import {
  embedJobId,
  JOB_NAMES,
  OUTBOX_DRAIN_BATCH,
  OUTBOX_STATUS,
  summarizeJobId,
  type EmbedMeetingPayload,
  type SummarizeMeetingPayload,
} from "@stancehub/shared";
import type { Database } from "./client";
import {
  failMeetingForOutbox,
  findOutboxForMeetingGeneration,
  listPendingOutbox,
  markOutboxFailed,
  markOutboxPublishAttemptFailed,
  markOutboxPublished,
  markOutboxReconcileReadd,
  markOutboxSuperseded,
  meetingOpenForOutbox,
  outboxDrainDecision,
  outboxExhausted,
  outboxReconcileDecision,
  type JobOutboxRow,
  type OutboxJobName,
} from "./outbox";
import { meetings } from "./schema/meetings";

/** BullMQ-facing port — apps adapt Queue without putting bullmq in @stancehub/db. */
export type OutboxJobQueue = {
  ensureQueued(input: {
    jobName: OutboxJobName;
    jobId: string;
    payload: EmbedMeetingPayload | SummarizeMeetingPayload;
  }): Promise<"live" | "added">;
  getJobState(jobId: string): Promise<string | null>;
  isLiveState(state: string): boolean;
};

function jobIdFor(row: Pick<JobOutboxRow, "jobName" | "meetingId" | "generation">) {
  return row.jobName === JOB_NAMES.embedMeeting
    ? embedJobId(row.meetingId, row.generation)
    : summarizeJobId(row.meetingId, row.generation);
}

function logOutbox(event: string, fields: Record<string, unknown>) {
  console.info(JSON.stringify({ event, ...fields }));
}

/**
 * Publish one pending outbox row.
 * Drain matrix:
 * - gen mismatch → superseded
 * - gen match + terminal meeting → published (no re-add; covers removeOnComplete race)
 * - gen match + open → ensureQueued → published; else attempts++/exhaust→failed
 */
export async function publishOutboxRow(
  db: Database,
  queue: OutboxJobQueue,
  row: JobOutboxRow,
): Promise<"published" | "superseded" | "failed" | "retry" | "skipped"> {
  if (row.status !== OUTBOX_STATUS.pending) return "skipped";

  const open = await meetingOpenForOutbox(db, row);
  const decision = outboxDrainDecision(open.kind);
  if (decision === "supersede") {
    await markOutboxSuperseded(db, row.id);
    logOutbox("vault.outbox.superseded", {
      outboxId: row.id,
      jobName: row.jobName,
      meetingId: row.meetingId,
      generation: row.generation,
      reason: open.kind,
    });
    return "superseded";
  }
  if (decision === "publish_terminal") {
    await markOutboxPublished(db, row.id);
    logOutbox("vault.outbox.published", {
      outboxId: row.id,
      jobName: row.jobName,
      meetingId: row.meetingId,
      generation: row.generation,
      reason: "meeting_terminal",
    });
    return "published";
  }

  const jobId = jobIdFor(row);
  try {
    const result = await queue.ensureQueued({
      jobName: row.jobName as OutboxJobName,
      jobId,
      payload: row.payload as EmbedMeetingPayload | SummarizeMeetingPayload,
    });
    await markOutboxPublished(db, row.id);
    logOutbox("vault.outbox.published", {
      outboxId: row.id,
      jobName: row.jobName,
      meetingId: row.meetingId,
      generation: row.generation,
      reason: result === "live" ? "already_live" : "added",
      attempts: row.attempts,
    });
    return "published";
  } catch (error) {
    const message = error instanceof Error ? error.message : "outbox publish failed";
    await markOutboxPublishAttemptFailed(db, row.id, message);
    const attempts = row.attempts + 1;
    const exhausted = outboxExhausted({ attempts, createdAt: row.createdAt });
    logOutbox("vault.outbox.publish_failed", {
      outboxId: row.id,
      jobName: row.jobName,
      meetingId: row.meetingId,
      generation: row.generation,
      attempts,
      message,
      exhausted,
    });
    if (exhausted) {
      const failed = await markOutboxFailed(db, row.id, message);
      if (failed) {
        await failMeetingForOutbox(db, row, `Outbox publish exhausted: ${message}`);
        return "failed";
      }
      // Another publisher already moved the row (e.g. published) — do not fail closed.
      return "skipped";
    }
    return "retry";
  }
}

export async function drainOutbox(
  db: Database,
  queue: OutboxJobQueue,
  limit = OUTBOX_DRAIN_BATCH,
) {
  const rows = await listPendingOutbox(db, limit);
  const summary = { published: 0, superseded: 0, failed: 0, retry: 0, skipped: 0 };
  for (const row of rows) {
    const result = await publishOutboxRow(db, queue, row);
    summary[result] += 1;
  }
  logOutbox("vault.outbox.drain", { ...summary, considered: rows.length });
  return summary;
}

const OPEN_PIPELINE = ["pending", "embedding"] as const;
const OPEN_SUMMARY = ["pending", "running"] as const;

/**
 * Safety-net reconcile after drain.
 * - unpublished outbox → skip (drain owns it)
 * - published + open + no live job → one durable re-add (reconcile_readd_at); second time → fail
 * - outbox failed → fail meeting if still open
 * - no outbox (legacy) → fail
 */
export async function reconcileOpenJobsWithOutbox(db: Database, queue: OutboxJobQueue) {
  const embedOpen = await db
    .select({
      meetingId: meetings.id,
      organizationId: meetings.organizationId,
      generation: meetings.embedGeneration,
    })
    .from(meetings)
    .where(inArray(meetings.pipelineStatus, [...OPEN_PIPELINE]));

  for (const row of embedOpen) {
    await reconcileOpenOutboxJob(db, queue, {
      jobName: JOB_NAMES.embedMeeting,
      meetingId: row.meetingId,
      organizationId: row.organizationId,
      generation: row.generation,
    });
  }

  const summaryOpen = await db
    .select({
      meetingId: meetings.id,
      organizationId: meetings.organizationId,
      generation: meetings.summaryGeneration,
    })
    .from(meetings)
    .where(inArray(meetings.summaryStatus, [...OPEN_SUMMARY]));

  for (const row of summaryOpen) {
    await reconcileOpenOutboxJob(db, queue, {
      jobName: JOB_NAMES.summarizeMeeting,
      meetingId: row.meetingId,
      organizationId: row.organizationId,
      generation: row.generation,
    });
  }
}

/** Exported for tests — safety-net reconcile for one open meeting generation. */
export async function reconcileOpenOutboxJob(
  db: Database,
  queue: OutboxJobQueue,
  input: {
    jobName: OutboxJobName;
    meetingId: string;
    organizationId: string;
    generation: number;
  },
) {
  const jobId = jobIdFor(input);
  const state = await queue.getJobState(jobId);
  if (state && queue.isLiveState(state)) return;

  const outbox = await findOutboxForMeetingGeneration(db, input);
  const decision = outboxReconcileDecision({
    outboxStatus: outbox?.status ?? null,
    reconcileReaddAt: outbox?.reconcileReaddAt ?? null,
  });

  if (decision === "skip_pending") {
    return;
  }

  if (decision === "fail_outbox") {
    await failMeetingForOutbox(
      db,
      { ...input, jobName: input.jobName },
      outbox?.lastError ?? "Outbox failed",
    );
    return;
  }

  if (decision === "readd_once" && outbox) {
    try {
      await queue.ensureQueued({
        jobName: input.jobName,
        jobId,
        payload: outbox.payload as EmbedMeetingPayload | SummarizeMeetingPayload,
      });
      await markOutboxReconcileReadd(db, outbox.id);
      logOutbox("vault.outbox.reconcile_readd", {
        outboxId: outbox.id,
        jobName: input.jobName,
        meetingId: input.meetingId,
        generation: input.generation,
      });
      return;
    } catch (error) {
      // Transient Redis failure: do NOT burn reconcile_readd_at; retry on next boot/drain.
      const message = error instanceof Error ? error.message : "reconcile re-add failed";
      logOutbox("vault.outbox.reconcile_readd_failed", {
        outboxId: outbox.id,
        jobName: input.jobName,
        meetingId: input.meetingId,
        generation: input.generation,
        message,
      });
      return;
    }
  }

  if (decision === "fail_after_readd") {
    await failMeetingForOutbox(db, input, "Job is no longer running after outbox reconcile re-add");
    return;
  }

  await failMeetingForOutbox(db, input, "Job is no longer running");
}

/** Best-effort publish for a specific meeting generation after commit. */
export async function publishOutboxForMeetingGeneration(
  db: Database,
  queue: OutboxJobQueue,
  input: { jobName: OutboxJobName; meetingId: string; generation: number },
) {
  const row = await findOutboxForMeetingGeneration(db, input);
  if (!row || row.status !== OUTBOX_STATUS.pending) {
    return { enqueue: "none" as const };
  }
  const result = await publishOutboxRow(db, queue, row);
  if (result === "published") return { enqueue: "redis" as const, outboxId: row.id };
  return { enqueue: "outbox" as const, outboxId: row.id, result };
}
