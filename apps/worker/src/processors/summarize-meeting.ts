import type { Job } from "bullmq";
import { JOB_NAMES, summarizeMeetingPayloadSchema } from "@stancehub/shared";

/** Sprint 2: summarize + actions. Stub for Sprint 0. */
export async function processSummarizeMeeting(job: Job) {
  const payload = summarizeMeetingPayloadSchema.parse(job.data);
  console.log(`[worker] ${JOB_NAMES.summarizeMeeting} stub`, payload);
  return { ok: true as const, stub: true, ...payload };
}
