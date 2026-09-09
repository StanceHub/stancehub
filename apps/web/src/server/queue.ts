import { Queue } from "bullmq";
import {
  embedJobId,
  isLiveEmbedJobState,
  JOB_NAMES,
  QUEUE_NAME,
  type EmbedMeetingPayload,
  type PingJobPayload,
} from "@stancehub/shared";
import { getServerEnv } from "@/env";

const globalForQueue = globalThis as unknown as { __stancehubQueue?: Queue };

export function getQueue() {
  if (!globalForQueue.__stancehubQueue) {
    globalForQueue.__stancehubQueue = new Queue(QUEUE_NAME, {
      connection: { url: getServerEnv().REDIS_URL },
    });
  }
  return globalForQueue.__stancehubQueue;
}

export async function enqueuePing(note?: string) {
  const payload: PingJobPayload = {
    requestedAt: new Date().toISOString(),
    note,
  };
  return getQueue().add(JOB_NAMES.ping, payload, {
    removeOnComplete: 100,
    removeOnFail: 50,
  });
}

export async function getEmbedJob(meetingId: string, generation: number) {
  const job = await getQueue().getJob(embedJobId(meetingId, generation));
  if (!job) return null;
  const state = await job.getState();
  return { job, state };
}

export async function enqueueEmbedMeeting(input: EmbedMeetingPayload) {
  const queue = getQueue();
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
