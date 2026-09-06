import { Worker } from "bullmq";
import { JOB_NAMES, QUEUE_NAME } from "@stancehub/shared";
import { createRedisConnection } from "./connection";
import { processPing } from "./processors/ping";
import { processEmbedMeeting } from "./processors/embed-meeting";
import { processSummarizeMeeting } from "./processors/summarize-meeting";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

async function main() {
  const connection = createRedisConnection(redisUrl);

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
  });

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await worker.close();
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
