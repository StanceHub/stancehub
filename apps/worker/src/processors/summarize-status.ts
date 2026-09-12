import { and, eq, inArray, sql } from "drizzle-orm";
import type { Queue } from "bullmq";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_OUTCOMES,
  insertAuditEvent,
  insertJobOutbox,
  meetings,
  publishOutboxForMeetingGeneration,
  supersedePendingOutbox,
  truncateAuditReason,
} from "@stancehub/db";
import { JOB_NAMES } from "@stancehub/shared";
import { getWorkerDb } from "../db";
import { createWorkerOutboxQueue } from "../outbox-queue";

const OPEN_SUMMARY = ["pending", "running"] as const;

export async function markSummaryFailed(
  meetingId: string,
  generation: number,
  organizationId: string,
  message: string,
) {
  const db = getWorkerDb();
  await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({ organizationId: meetings.organizationId })
      .from(meetings)
      .where(eq(meetings.id, meetingId))
      .limit(1);
    if (!meeting) return;

    const orgId = meeting.organizationId;
    const orgMismatch = orgId !== organizationId;
    const updated = await tx
      .update(meetings)
      .set({
        summaryStatus: "failed",
        summaryError: message.slice(0, 500),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(meetings.id, meetingId),
          eq(meetings.organizationId, orgId),
          eq(meetings.summaryGeneration, generation),
          inArray(meetings.summaryStatus, [...OPEN_SUMMARY]),
        ),
      )
      .returning({ id: meetings.id });

    // Org-mismatch attempts must still audit even if the row was already terminal.
    if (updated.length === 0 && !orgMismatch) return;

    await insertAuditEvent(tx, {
      organizationId: orgId,
      actorType: AUDIT_ACTOR_TYPES.worker,
      action: AUDIT_ACTIONS.summarizeFailed,
      resourceType: "meeting",
      resourceId: meetingId,
      outcome: AUDIT_OUTCOMES.failure,
      metadata: {
        meetingId,
        summaryGeneration: generation,
        requestedOrganizationId: organizationId,
        orgMismatch,
        statusUpdated: updated.length > 0,
        errorClass: orgMismatch ? "org_mismatch" : "summarize_failed",
        reason: truncateAuditReason(message),
      },
    });
  });
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
