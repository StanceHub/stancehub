import type { Job } from "bullmq";
import { JOB_NAMES, embedMeetingPayloadSchema } from "@stancehub/shared";

/** Sprint 1: chunk + embed. Stub for Sprint 0. */
export async function processEmbedMeeting(job: Job) {
  const payload = embedMeetingPayloadSchema.parse(job.data);
  console.log(`[worker] ${JOB_NAMES.embedMeeting} stub`, payload);
  return { ok: true as const, stub: true, ...payload };
}
