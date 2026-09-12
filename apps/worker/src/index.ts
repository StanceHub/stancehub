import { Queue, Worker } from "bullmq";
import {
  drainOutbox,
  reconcileOpenJobsWithOutbox,
} from "@stancehub/db";
import {
  embedMeetingPayloadSchema,
  JOB_NAMES,
  OUTBOX_DRAIN_INTERVAL_MS,
  QUEUE_NAME,
  summarizeMeetingPayloadSchema,
} from "@stancehub/shared";
import { createRedisConnection } from "./connection";
import { processPing } from "./processors/ping";
import { closeWorkerDb, getWorkerDb } from "./db";
import { processEmbedMeeting } from "./processors/embed-meeting";
import { markEmbedFailed } from "./processors/embed-status";
import { processSummarizeMeeting } from "./processors/summarize-meeting";
import { markSummaryFailed } from "./processors/summarize-status";
import { createWorkerOutboxQueue } from "./outbox-queue";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

async function drainAndReconcile(queue: Queue) {
  const db = getWorkerDb();
  const outboxQueue = createWorkerOutboxQueue(queue);
  await drainOutbox(db, outboxQueue);
  await reconcileOpenJobsWithOutbox(db, outboxQueue);
}

async function main() {
  const connection = createRedisConnection(redisUrl);
  const reconcileConnection = createRedisConnection(redisUrl);
  const queue = new Queue(QUEUE_NAME, { connection: reconcileConnection });
  await drainAndReconcile(queue);

  let drainInFlight: Promise<void> | null = null;
  const outboxTimer = setInterval(() => {
    if (drainInFlight) return;
    drainInFlight = drainOutbox(getWorkerDb(), createWorkerOutboxQueue(queue))
      .then(() => undefined)
      .catch((err) => {
        console.error("[worker] outbox drain failed", err);
      })
      .finally(() => {
        drainInFlight = null;
      });
  }, OUTBOX_DRAIN_INTERVAL_MS);
  outboxTimer.unref?.();

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
    if (!job) return;
    if (job.name === JOB_NAMES.embedMeeting) {
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
      return;
    }
    if (job.name === JOB_NAMES.summarizeMeeting) {
      const parsed = summarizeMeetingPayloadSchema.safeParse(job.data);
      if (!parsed.success) return;
      void job
        .getState()
        .then((state) => {
          if (state !== "failed") return;
          return markSummaryFailed(parsed.data.meetingId, parsed.data.generation, err.message);
        })
        .catch((recordError) => {
          console.error("[worker] could not record summarize failure", recordError);
        });
    }
  });

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    clearInterval(outboxTimer);
    await worker.close();
    await queue.close();
    reconcileConnection.disconnect();
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
