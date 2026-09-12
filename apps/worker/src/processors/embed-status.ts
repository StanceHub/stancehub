import { and, eq, inArray } from "drizzle-orm";
import { meetings } from "@stancehub/db";
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
    .where(
      and(
        eq(meetings.id, meetingId),
        eq(meetings.embedGeneration, generation),
        inArray(meetings.pipelineStatus, [...OPEN_PIPELINE]),
      ),
    );
}
