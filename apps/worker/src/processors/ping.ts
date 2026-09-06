import type { Job } from "bullmq";
import { JOB_NAMES, pingJobPayloadSchema } from "@stancehub/shared";

export async function processPing(job: Job) {
  const payload = pingJobPayloadSchema.parse(job.data);
  console.log(`[worker] ${JOB_NAMES.ping}`, payload);
  return { ok: true as const, echoedAt: new Date().toISOString(), ...payload };
}
