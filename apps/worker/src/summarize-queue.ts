import { Queue } from "bullmq";
import {
  isLiveJobState,
  JOB_NAMES,
  QUEUE_NAME,
  summarizeJobId,
  type SummarizeMeetingPayload,
} from "@stancehub/shared";

export function getSummarizeQueue(connectionUrl: string) {
  return new Queue(QUEUE_NAME, { connection: { url: connectionUrl } });
}

export async function enqueueSummarizeMeeting(
  queue: Queue,
  input: SummarizeMeetingPayload,
) {
  const jobId = summarizeJobId(input.meetingId, input.generation);
  const existing = await queue.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (isLiveJobState(state)) return { job: existing, alreadyRunning: true as const };
    await existing.remove();
  }
  const job = await queue.add(JOB_NAMES.summarizeMeeting, input, {
    jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
  return { job, alreadyRunning: false as const };
}
