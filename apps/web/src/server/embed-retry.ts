import { and, eq, inArray, sql } from "drizzle-orm";
import { meetings } from "@stancehub/db";
import { isLiveEmbedJobState } from "@stancehub/shared";
import { getDb } from "@/server/db";
import { enqueueEmbedMeeting, getEmbedJob } from "@/server/queue";

const OPEN_PIPELINE = ["pending", "embedding"] as const;

export type PrepareEmbedRetryResult =
  | { status: "not_found" }
  | { status: "already_running"; jobId: string }
  | { status: "queued"; generation: number };

/**
 * Bump embed generation and mark pending under the retry advisory lock.
 * Caller must enqueue after a successful "queued" result, and fail the generation if enqueue throws.
 */
export async function prepareMeetingEmbedRetry(input: {
  organizationId: string;
  meetingId: string;
}): Promise<PrepareEmbedRetryResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
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

    return { status: "queued" as const, generation: bumped.generation };
  });
}

export async function markEmbedEnqueueFailed(input: {
  organizationId: string;
  meetingId: string;
  generation: number;
  message: string;
}) {
  const db = getDb();
  await db
    .update(meetings)
    .set({
      pipelineStatus: "failed",
      pipelineError: input.message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(meetings.id, input.meetingId),
        eq(meetings.organizationId, input.organizationId),
        eq(meetings.embedGeneration, input.generation),
        inArray(meetings.pipelineStatus, [...OPEN_PIPELINE]),
      ),
    );
}

export async function enqueuePreparedMeetingEmbed(input: {
  organizationId: string;
  meetingId: string;
  generation: number;
}) {
  return enqueueEmbedMeeting({
    organizationId: input.organizationId,
    meetingId: input.meetingId,
    generation: input.generation,
  });
}
