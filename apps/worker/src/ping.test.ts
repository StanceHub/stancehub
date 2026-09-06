import { describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import { processPing } from "./processors/ping";

function fakeJob(data: unknown): Job {
  return { data } as Job;
}

describe("processPing", () => {
  it("echoes a valid ping payload", async () => {
    const result = await processPing(
      fakeJob({
        requestedAt: "2026-09-06T07:00:00.000Z",
        note: "test",
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.note).toBe("test");
    expect(result.echoedAt).toMatch(/^\d{4}-/);
  });

  it("rejects invalid payloads", async () => {
    await expect(processPing(fakeJob({ requestedAt: "not-a-date" }))).rejects.toThrow();
  });
});
