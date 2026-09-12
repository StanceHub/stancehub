import { beforeEach, describe, expect, it, vi } from "vitest";
import { JOB_NAMES, OUTBOX_STATUS } from "@stancehub/shared";
import type { JobOutboxRow } from "./outbox";
import type { OutboxJobQueue } from "./outbox-publish";

const meetingOpenForOutbox = vi.fn();
const markOutboxPublished = vi.fn();
const markOutboxSuperseded = vi.fn();
const markOutboxPublishAttemptFailed = vi.fn();
const markOutboxFailed = vi.fn();
const failMeetingForOutbox = vi.fn();
const outboxExhausted = vi.fn();

const findOutboxForMeetingGeneration = vi.fn();
const markOutboxReconcileReadd = vi.fn();

vi.mock("./outbox", async () => {
  const actual = await vi.importActual<typeof import("./outbox")>("./outbox");
  return {
    ...actual,
    meetingOpenForOutbox: (...args: unknown[]) => meetingOpenForOutbox(...args),
    markOutboxPublished: (...args: unknown[]) => markOutboxPublished(...args),
    markOutboxSuperseded: (...args: unknown[]) => markOutboxSuperseded(...args),
    markOutboxPublishAttemptFailed: (...args: unknown[]) => markOutboxPublishAttemptFailed(...args),
    markOutboxFailed: (...args: unknown[]) => markOutboxFailed(...args),
    failMeetingForOutbox: (...args: unknown[]) => failMeetingForOutbox(...args),
    outboxExhausted: (...args: unknown[]) => outboxExhausted(...args),
    findOutboxForMeetingGeneration: (...args: unknown[]) => findOutboxForMeetingGeneration(...args),
    markOutboxReconcileReadd: (...args: unknown[]) => markOutboxReconcileReadd(...args),
  };
});

const { publishOutboxRow, reconcileOpenOutboxJob } = await import("./outbox-publish");

function pendingRow(overrides: Partial<JobOutboxRow> = {}): JobOutboxRow {
  return {
    id: "ob1",
    jobName: JOB_NAMES.embedMeeting,
    organizationId: "org1",
    meetingId: "m1",
    generation: 1,
    payload: { organizationId: "org1", meetingId: "m1", generation: 1 },
    status: OUTBOX_STATUS.pending,
    attempts: 0,
    lastError: null,
    reconcileReaddAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    publishedAt: null,
    ...overrides,
  };
}

describe("publishOutboxRow crash-gap / drain matrix", () => {
  const db = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    markOutboxFailed.mockResolvedValue(true);
    outboxExhausted.mockReturnValue(false);
  });

  it("does not re-add when meeting already terminal (removeOnComplete race)", async () => {
    meetingOpenForOutbox.mockResolvedValue({ kind: "terminal" });
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn(),
      getJobState: vi.fn(),
      isLiveState: () => false,
    };
    const result = await publishOutboxRow(db, queue, pendingRow());
    expect(result).toBe("published");
    expect(markOutboxPublished).toHaveBeenCalledWith(db, "ob1");
    expect(queue.ensureQueued).not.toHaveBeenCalled();
  });

  it("supersedes on generation mismatch", async () => {
    meetingOpenForOutbox.mockResolvedValue({ kind: "gen_mismatch" });
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn(),
      getJobState: vi.fn(),
      isLiveState: () => false,
    };
    const result = await publishOutboxRow(db, queue, pendingRow());
    expect(result).toBe("superseded");
    expect(markOutboxSuperseded).toHaveBeenCalled();
    expect(queue.ensureQueued).not.toHaveBeenCalled();
  });

  it("keeps pending when publish throws (crash gap — later drain recovers)", async () => {
    meetingOpenForOutbox.mockResolvedValue({ kind: "open", meeting: {} });
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn().mockRejectedValue(new Error("redis down")),
      getJobState: vi.fn(),
      isLiveState: () => false,
    };
    const result = await publishOutboxRow(db, queue, pendingRow());
    expect(result).toBe("retry");
    expect(markOutboxPublishAttemptFailed).toHaveBeenCalled();
    expect(markOutboxFailed).not.toHaveBeenCalled();
    expect(failMeetingForOutbox).not.toHaveBeenCalled();
    expect(markOutboxPublished).not.toHaveBeenCalled();
  });

  it("publishes when ensureQueued succeeds", async () => {
    meetingOpenForOutbox.mockResolvedValue({ kind: "open", meeting: {} });
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn().mockResolvedValue("added"),
      getJobState: vi.fn(),
      isLiveState: () => false,
    };
    const result = await publishOutboxRow(db, queue, pendingRow());
    expect(result).toBe("published");
    expect(queue.ensureQueued).toHaveBeenCalled();
    expect(markOutboxPublished).toHaveBeenCalledWith(db, "ob1");
  });

  it("marks published for already-live job without treating as failure", async () => {
    meetingOpenForOutbox.mockResolvedValue({ kind: "open", meeting: {} });
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn().mockResolvedValue("live"),
      getJobState: vi.fn(),
      isLiveState: () => true,
    };
    const result = await publishOutboxRow(db, queue, pendingRow());
    expect(result).toBe("published");
  });

  it("on exhaust, only fails meeting if outbox still pending (dual-publisher safe)", async () => {
    meetingOpenForOutbox.mockResolvedValue({ kind: "open", meeting: {} });
    outboxExhausted.mockReturnValue(true);
    markOutboxFailed.mockResolvedValue(false); // already published by peer
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn().mockRejectedValue(new Error("redis down")),
      getJobState: vi.fn(),
      isLiveState: () => false,
    };
    const result = await publishOutboxRow(db, queue, pendingRow({ attempts: 19 }));
    expect(result).toBe("skipped");
    expect(failMeetingForOutbox).not.toHaveBeenCalled();
  });

  it("on exhaust with pending win, fails meeting generation", async () => {
    meetingOpenForOutbox.mockResolvedValue({ kind: "open", meeting: {} });
    outboxExhausted.mockReturnValue(true);
    markOutboxFailed.mockResolvedValue(true);
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn().mockRejectedValue(new Error("redis down")),
      getJobState: vi.fn(),
      isLiveState: () => false,
    };
    const result = await publishOutboxRow(db, queue, pendingRow({ attempts: 19 }));
    expect(result).toBe("failed");
    expect(failMeetingForOutbox).toHaveBeenCalled();
  });
});

describe("reconcileOpenOutboxJob", () => {
  const db = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips fail when unpublished outbox exists", async () => {
    findOutboxForMeetingGeneration.mockResolvedValue(
      pendingRow({ status: OUTBOX_STATUS.pending }),
    );
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn(),
      getJobState: vi.fn().mockResolvedValue(null),
      isLiveState: () => false,
    };
    await reconcileOpenOutboxJob(db, queue, {
      jobName: JOB_NAMES.embedMeeting,
      meetingId: "m1",
      organizationId: "org1",
      generation: 1,
    });
    expect(failMeetingForOutbox).not.toHaveBeenCalled();
    expect(queue.ensureQueued).not.toHaveBeenCalled();
  });

  it("does not burn reconcile_readd_at when re-add throws", async () => {
    findOutboxForMeetingGeneration.mockResolvedValue(
      pendingRow({ status: OUTBOX_STATUS.published, reconcileReaddAt: null }),
    );
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn().mockRejectedValue(new Error("redis blip")),
      getJobState: vi.fn().mockResolvedValue(null),
      isLiveState: () => false,
    };
    await reconcileOpenOutboxJob(db, queue, {
      jobName: JOB_NAMES.embedMeeting,
      meetingId: "m1",
      organizationId: "org1",
      generation: 1,
    });
    expect(markOutboxReconcileReadd).not.toHaveBeenCalled();
    expect(failMeetingForOutbox).not.toHaveBeenCalled();
  });

  it("sets reconcile_readd_at only after successful re-add", async () => {
    findOutboxForMeetingGeneration.mockResolvedValue(
      pendingRow({ status: OUTBOX_STATUS.published, reconcileReaddAt: null }),
    );
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn().mockResolvedValue("added"),
      getJobState: vi.fn().mockResolvedValue(null),
      isLiveState: () => false,
    };
    await reconcileOpenOutboxJob(db, queue, {
      jobName: JOB_NAMES.embedMeeting,
      meetingId: "m1",
      organizationId: "org1",
      generation: 1,
    });
    expect(markOutboxReconcileReadd).toHaveBeenCalledWith(db, "ob1");
    expect(failMeetingForOutbox).not.toHaveBeenCalled();
  });

  it("fails after reconcile_readd_at already set and job still missing", async () => {
    findOutboxForMeetingGeneration.mockResolvedValue(
      pendingRow({
        status: OUTBOX_STATUS.published,
        reconcileReaddAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    );
    const queue: OutboxJobQueue = {
      ensureQueued: vi.fn(),
      getJobState: vi.fn().mockResolvedValue(null),
      isLiveState: () => false,
    };
    await reconcileOpenOutboxJob(db, queue, {
      jobName: JOB_NAMES.embedMeeting,
      meetingId: "m1",
      organizationId: "org1",
      generation: 1,
    });
    expect(failMeetingForOutbox).toHaveBeenCalled();
    expect(queue.ensureQueued).not.toHaveBeenCalled();
  });
});
