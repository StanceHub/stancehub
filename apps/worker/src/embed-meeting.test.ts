import { describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import { embedClaimDisposition, isLastEmbedAttempt, processEmbedMeeting } from "./processors/embed-meeting";
import { readEmbeddingConfig } from "./embed-config";

function fakeJob(data: unknown): Job {
  return { data } as Job;
}

describe("readEmbeddingConfig", () => {
  it("requires endpoint settings", () => {
    expect(() => readEmbeddingConfig({})).toThrow(/EMBEDDING_MODEL/);
  });

  it("reads compatible endpoint settings", () => {
    const config = readEmbeddingConfig({
      LLM_BASE_URL: "http://127.0.0.1:8080/v1",
      LLM_API_KEY: "key",
      EMBEDDING_MODEL: "embed",
      EMBEDDING_DIMENSIONS: "768",
    });
    expect(config.dimensions).toBe(768);
    expect(config.model).toBe("embed");
  });
});

describe("isLastEmbedAttempt", () => {
  it("waits until the configured attempt count is exhausted", () => {
    expect(isLastEmbedAttempt({ attemptsMade: 0, opts: { attempts: 3 } })).toBe(false);
    expect(isLastEmbedAttempt({ attemptsMade: 2, opts: { attempts: 3 } })).toBe(true);
  });
});

describe("embedClaimDisposition", () => {
  it("waits for an uncommitted generation and ignores a superseded attempt", () => {
    expect(embedClaimDisposition(1, 2)).toBe("wait");
    expect(embedClaimDisposition(3, 2)).toBe("stale");
    expect(embedClaimDisposition(2, 2)).toBe("claim");
    expect(embedClaimDisposition(null, 1)).toBe("stale");
  });
});

describe("processEmbedMeeting", () => {
  it("rejects an invalid payload before calling the database", async () => {
    await expect(processEmbedMeeting(fakeJob({ meetingId: "x" }))).rejects.toThrow();
  });
});
