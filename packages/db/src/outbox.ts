import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  JOB_NAMES,
  OUTBOX_MAX_AGE_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_STATUS,
  type EmbedMeetingPayload,
  type SummarizeMeetingPayload,
} from "@stancehub/shared";
import type { Database } from "./client";
import { meetings } from "./schema/meetings";
import { jobOutbox, type JobOutboxRow } from "./schema/outbox";
import type { DbOrTx } from "./tenancy-rls";

export type OutboxJobName = typeof JOB_NAMES.embedMeeting | typeof JOB_NAMES.summarizeMeeting;

function newOutboxId() {
  return crypto.randomUUID();
}

/** Mark older unpublished outbox rows for this job+meeting as superseded. */
export async function supersedePendingOutbox(
  db: DbOrTx,
  input: { jobName: OutboxJobName; meetingId: string; exceptGeneration?: number },
) {
  const conditions = [
    eq(jobOutbox.jobName, input.jobName),
    eq(jobOutbox.meetingId, input.meetingId),
    eq(jobOutbox.status, OUTBOX_STATUS.pending),
  ];
  if (input.exceptGeneration != null) {
    conditions.push(sql`${jobOutbox.generation} <> ${input.exceptGeneration}`);
  }
  await db
    .update(jobOutbox)
    .set({ status: OUTBOX_STATUS.superseded, updatedAt: new Date() })
    .where(and(...conditions));
}

export async function insertJobOutbox(
  db: DbOrTx,
  input: {
    jobName: OutboxJobName;
    organizationId: string;
    meetingId: string;
    generation: number;
    payload: EmbedMeetingPayload | SummarizeMeetingPayload;
  },
) {
  const id = newOutboxId();
  await db.insert(jobOutbox).values({
    id,
    jobName: input.jobName,
    organizationId: input.organizationId,
    meetingId: input.meetingId,
    generation: input.generation,
    payload: input.payload,
    status: OUTBOX_STATUS.pending,
  });
  return id;
}

export async function listPendingOutbox(db: Database, limit: number) {
  return db
    .select()
    .from(jobOutbox)
    .where(eq(jobOutbox.status, OUTBOX_STATUS.pending))
    .orderBy(asc(jobOutbox.createdAt))
    .limit(limit);
}

export async function findOutboxForMeetingGeneration(
  db: DbOrTx,
  input: { jobName: OutboxJobName; meetingId: string; generation: number },
) {
  const [row] = await db
    .select()
    .from(jobOutbox)
    .where(
      and(
        eq(jobOutbox.jobName, input.jobName),
        eq(jobOutbox.meetingId, input.meetingId),
        eq(jobOutbox.generation, input.generation),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function markOutboxPublished(db: DbOrTx, outboxId: string) {
  const now = new Date();
  await db
    .update(jobOutbox)
    .set({
      status: OUTBOX_STATUS.published,
      publishedAt: now,
      updatedAt: now,
      lastError: null,
    })
    .where(and(eq(jobOutbox.id, outboxId), eq(jobOutbox.status, OUTBOX_STATUS.pending)));
}

export async function markOutboxSuperseded(db: DbOrTx, outboxId: string) {
  await db
    .update(jobOutbox)
    .set({ status: OUTBOX_STATUS.superseded, updatedAt: new Date() })
    .where(and(eq(jobOutbox.id, outboxId), eq(jobOutbox.status, OUTBOX_STATUS.pending)));
}

export async function markOutboxPublishAttemptFailed(
  db: DbOrTx,
  outboxId: string,
  message: string,
) {
  await db
    .update(jobOutbox)
    .set({
      attempts: sql`${jobOutbox.attempts} + 1`,
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(and(eq(jobOutbox.id, outboxId), eq(jobOutbox.status, OUTBOX_STATUS.pending)));
}

export async function markOutboxFailed(db: DbOrTx, outboxId: string, message: string) {
  const updated = await db
    .update(jobOutbox)
    .set({
      status: OUTBOX_STATUS.failed,
      lastError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(and(eq(jobOutbox.id, outboxId), eq(jobOutbox.status, OUTBOX_STATUS.pending)))
    .returning({ id: jobOutbox.id });
  return updated.length > 0;
}

export async function markOutboxReconcileReadd(db: DbOrTx, outboxId: string) {
  await db
    .update(jobOutbox)
    .set({ reconcileReaddAt: new Date(), updatedAt: new Date() })
    .where(and(eq(jobOutbox.id, outboxId), isNull(jobOutbox.reconcileReaddAt)));
}

export function outboxExhausted(row: Pick<JobOutboxRow, "attempts" | "createdAt">, now = new Date()) {
  if (row.attempts >= OUTBOX_MAX_ATTEMPTS) return true;
  return now.getTime() - row.createdAt.getTime() >= OUTBOX_MAX_AGE_MS;
}

/** Pure drain matrix decision (tested). */
export function outboxDrainDecision(
  openKind: "missing" | "gen_mismatch" | "terminal" | "open",
): "supersede" | "publish_terminal" | "enqueue" {
  if (openKind === "missing" || openKind === "gen_mismatch") return "supersede";
  if (openKind === "terminal") return "publish_terminal";
  return "enqueue";
}

/**
 * Pure reconcile decision for an open meeting with no live BullMQ job.
 */
export function outboxReconcileDecision(input: {
  outboxStatus: string | null;
  reconcileReaddAt: Date | null;
}): "skip_pending" | "fail_outbox" | "readd_once" | "fail_after_readd" | "fail_legacy" {
  if (input.outboxStatus === OUTBOX_STATUS.pending) return "skip_pending";
  if (input.outboxStatus === OUTBOX_STATUS.failed) return "fail_outbox";
  if (input.outboxStatus === OUTBOX_STATUS.published) {
    return input.reconcileReaddAt ? "fail_after_readd" : "readd_once";
  }
  return "fail_legacy";
}

const OPEN_PIPELINE = ["pending", "embedding"] as const;
const OPEN_SUMMARY = ["pending", "running"] as const;

export async function meetingOpenForOutbox(
  db: DbOrTx,
  row: Pick<JobOutboxRow, "jobName" | "meetingId" | "generation" | "organizationId">,
) {
  const [meeting] = await db
    .select({
      embedGeneration: meetings.embedGeneration,
      pipelineStatus: meetings.pipelineStatus,
      summaryGeneration: meetings.summaryGeneration,
      summaryStatus: meetings.summaryStatus,
    })
    .from(meetings)
    .where(and(eq(meetings.id, row.meetingId), eq(meetings.organizationId, row.organizationId)))
    .limit(1);
  if (!meeting) return { kind: "missing" as const };

  if (row.jobName === JOB_NAMES.embedMeeting) {
    if (meeting.embedGeneration !== row.generation) return { kind: "gen_mismatch" as const };
    if ((OPEN_PIPELINE as readonly string[]).includes(meeting.pipelineStatus)) {
      return { kind: "open" as const, meeting };
    }
    return { kind: "terminal" as const, meeting };
  }

  if (meeting.summaryGeneration !== row.generation) return { kind: "gen_mismatch" as const };
  if ((OPEN_SUMMARY as readonly string[]).includes(meeting.summaryStatus)) {
    return { kind: "open" as const, meeting };
  }
  return { kind: "terminal" as const, meeting };
}

export async function failMeetingForOutbox(
  db: DbOrTx,
  row: Pick<JobOutboxRow, "jobName" | "meetingId" | "generation" | "organizationId">,
  message: string,
) {
  if (row.jobName === JOB_NAMES.embedMeeting) {
    await db
      .update(meetings)
      .set({
        pipelineStatus: "failed",
        pipelineError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(meetings.id, row.meetingId),
          eq(meetings.organizationId, row.organizationId),
          eq(meetings.embedGeneration, row.generation),
          inArray(meetings.pipelineStatus, [...OPEN_PIPELINE]),
        ),
      );
    return;
  }
  await db
    .update(meetings)
    .set({
      summaryStatus: "failed",
      summaryError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(meetings.id, row.meetingId),
        eq(meetings.organizationId, row.organizationId),
        eq(meetings.summaryGeneration, row.generation),
        inArray(meetings.summaryStatus, [...OPEN_SUMMARY]),
      ),
    );
}

export { jobOutbox };
export type { JobOutboxRow };
