/** Outbox drain / failure thresholds (Sprint 3 #43). */
export const OUTBOX_DRAIN_INTERVAL_MS = 15_000;
export const OUTBOX_DRAIN_BATCH = 50;
export const OUTBOX_MAX_ATTEMPTS = 20;
export const OUTBOX_MAX_AGE_MS = 60 * 60 * 1000;

export const OUTBOX_STATUS = {
  pending: "pending",
  published: "published",
  failed: "failed",
  superseded: "superseded",
} as const;

export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];
