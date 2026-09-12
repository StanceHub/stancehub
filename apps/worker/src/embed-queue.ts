import type { Queue } from "bullmq";
import {
  embedJobId,
  isLiveEmbedJobState,
  JOB_NAMES,
  type EmbedMeetingPayload,
} from "@stancehub/shared";

/** Worker-side embed enqueue (mirrors web queue helper). */
export async function enqueueEmbedMeetingOnQueue(queue: Queue, input: EmbedMeetingPayload) {
  const generation = input.generation ?? 1;
  const payload = { ...input, generation };
  const jobId = embedJobId(input.meetingId, generation);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (isLiveEmbedJobState(state)) return { job: existing, alreadyRunning: true as const };
    await existing.remove();
  }
  const job = await queue.add(JOB_NAMES.embedMeeting, payload, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
  return { job, alreadyRunning: false as const };
}
