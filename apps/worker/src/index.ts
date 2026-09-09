import { Queue, Worker } from "bullmq";
import { embedMeetingPayloadSchema, JOB_NAMES, QUEUE_NAME } from "@stancehub/shared";
import { createRedisConnection } from "./connection";
import { processPing } from "./processors/ping";
import { closeWorkerDb } from "./db";
import { processEmbedMeeting } from "./processors/embed-meeting";
import { markEmbedFailed, reconcileOpenEmbeds } from "./processors/embed-status";
import { processSummarizeMeeting } from "./processors/summarize-meeting";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

async function main() {
  const connection = createRedisConnection(redisUrl);
  const reconcileConnection = createRedisConnection(redisUrl);
  const queue = new Queue(QUEUE_NAME, { connection: reconcileConnection });
  try {
    await reconcileOpenEmbeds(queue);
  } finally {
    await queue.close();
    reconcileConnection.disconnect();
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      switch (job.name) {
        case JOB_NAMES.ping:
          return processPing(job);
        case JOB_NAMES.embedMeeting:
          return processEmbedMeeting(job);
        case JOB_NAMES.summarizeMeeting:
          return processSummarizeMeeting(job);
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    },
    { connection, concurrency: 2 },
  );

  worker.on("ready", () => {
    console.log(`[worker] listening on queue "${QUEUE_NAME}"`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[worker] job failed`, job?.id, job?.name, err);
    if (!job || job.name !== JOB_NAMES.embedMeeting) return;
    const parsed = embedMeetingPayloadSchema.safeParse(job.data);
    if (!parsed.success) return;
    void job
      .getState()
      .then((state) => {
        if (state !== "failed") return;
        return markEmbedFailed(parsed.data.meetingId, parsed.data.generation, err.message);
      })
      .catch((recordError) => {
        console.error("[worker] could not record embed failure", recordError);
      });
  });

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await worker.close();
    await closeWorkerDb();
    connection.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
