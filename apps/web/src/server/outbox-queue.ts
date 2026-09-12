import type { Queue } from "bullmq";
import {
  JOB_NAMES,
  isLiveJobState,
  type EmbedMeetingPayload,
  type SummarizeMeetingPayload,
} from "@stancehub/shared";
import type { OutboxJobQueue } from "@stancehub/db";
import { enqueueEmbedMeeting } from "@/server/queue";

async function ensureQueuedOnQueue(
  queue: Queue,
  input: {
    jobName: string;
    jobId: string;
    payload: EmbedMeetingPayload | SummarizeMeetingPayload;
  },
): Promise<"live" | "added"> {
  const existing = await queue.getJob(input.jobId);
  if (existing) {
    const state = await existing.getState();
    if (isLiveJobState(state)) return "live";
    await existing.remove();
  }
  await queue.add(input.jobName, input.payload, {
    jobId: input.jobId,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: false,
  });
  return "added";
}

/** Web adapter: embed uses existing enqueue helper; summarize uses generic add (rare on web). */
export function createWebOutboxQueue(queue: Queue): OutboxJobQueue {
  return {
    async ensureQueued(input) {
      if (input.jobName === JOB_NAMES.embedMeeting) {
        const queued = await enqueueEmbedMeeting(input.payload as EmbedMeetingPayload);
        return queued.alreadyRunning ? "live" : "added";
      }
      return ensureQueuedOnQueue(queue, input);
    },
    async getJobState(jobId) {
      const job = await queue.getJob(jobId);
      if (!job) return null;
      return job.getState();
    },
    isLiveState: isLiveJobState,
  };
}
