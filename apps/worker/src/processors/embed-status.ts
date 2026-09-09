import { and, eq, inArray } from "drizzle-orm";
import type { Queue } from "bullmq";
import { meetings } from "@stancehub/db";
import { embedJobId, isLiveEmbedJobState } from "@stancehub/shared";
import { getWorkerDb } from "../db";

const OPEN_PIPELINE = ["pending", "embedding"] as const;

export async function markEmbedFailed(meetingId: string, generation: number, message: string) {
  const db = getWorkerDb();
  await db
    .update(meetings)
    .set({
      pipelineStatus: "failed",
      pipelineError: message.slice(0, 500),
      updatedAt: new Date(),
    })
    .where(and(eq(meetings.id, meetingId), eq(meetings.embedGeneration, generation)));
}

export async function reconcileOpenEmbeds(queue: Queue) {
  const db = getWorkerDb();
  const rows = await db
    .select({
      id: meetings.id,
      generation: meetings.embedGeneration,
    })
    .from(meetings)
    .where(inArray(meetings.pipelineStatus, [...OPEN_PIPELINE]));

  for (const row of rows) {
    const job = await queue.getJob(embedJobId(row.id, row.generation));
    const state = job ? await job.getState() : "missing";
    if (isLiveEmbedJobState(state)) continue;
    await db
      .update(meetings)
      .set({
        pipelineStatus: "failed",
        pipelineError: "Embed job is no longer running".slice(0, 500),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(meetings.id, row.id),
          eq(meetings.embedGeneration, row.generation),
          inArray(meetings.pipelineStatus, [...OPEN_PIPELINE]),
        ),
      );
  }
}
