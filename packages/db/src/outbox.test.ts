import { describe, expect, it } from "vitest";
import {
  OUTBOX_MAX_AGE_MS,
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_STATUS,
} from "@stancehub/shared";
import { outboxDrainDecision, outboxExhausted, outboxReconcileDecision } from "./outbox";

describe("outboxDrainDecision", () => {
  it("supersedes missing or gen mismatch", () => {
    expect(outboxDrainDecision("missing")).toBe("supersede");
    expect(outboxDrainDecision("gen_mismatch")).toBe("supersede");
  });

  it("publishes without re-add when meeting already terminal", () => {
    expect(outboxDrainDecision("terminal")).toBe("publish_terminal");
  });

  it("enqueues when meeting still open", () => {
    expect(outboxDrainDecision("open")).toBe("enqueue");
  });
});

describe("outboxReconcileDecision", () => {
  it("skips while outbox still pending", () => {
    expect(
      outboxReconcileDecision({ outboxStatus: OUTBOX_STATUS.pending, reconcileReaddAt: null }),
    ).toBe("skip_pending");
  });

  it("allows exactly one reconcile re-add for published rows", () => {
    expect(
      outboxReconcileDecision({ outboxStatus: OUTBOX_STATUS.published, reconcileReaddAt: null }),
    ).toBe("readd_once");
    expect(
      outboxReconcileDecision({
        outboxStatus: OUTBOX_STATUS.published,
        reconcileReaddAt: new Date(),
      }),
    ).toBe("fail_after_readd");
  });

  it("fails when outbox failed or legacy missing", () => {
    expect(
      outboxReconcileDecision({ outboxStatus: OUTBOX_STATUS.failed, reconcileReaddAt: null }),
    ).toBe("fail_outbox");
    expect(outboxReconcileDecision({ outboxStatus: null, reconcileReaddAt: null })).toBe(
      "fail_legacy",
    );
  });
});

describe("outboxExhausted", () => {
  it("trips on attempt and age thresholds", () => {
    const now = new Date("2026-01-01T02:00:00.000Z");
    expect(
      outboxExhausted(
        { attempts: OUTBOX_MAX_ATTEMPTS, createdAt: new Date("2026-01-01T01:30:00.000Z") },
        now,
      ),
    ).toBe(true);
    expect(
      outboxExhausted(
        {
          attempts: 1,
          createdAt: new Date(now.getTime() - OUTBOX_MAX_AGE_MS - 1),
        },
        now,
      ),
    ).toBe(true);
    expect(
      outboxExhausted(
        { attempts: 1, createdAt: new Date("2026-01-01T01:30:00.000Z") },
        now,
      ),
    ).toBe(false);
  });
});
