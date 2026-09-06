import { Queue } from "bullmq";
import { JOB_NAMES, QUEUE_NAME, type PingJobPayload } from "@stancehub/shared";
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
