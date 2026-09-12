import { describe, expect, it } from "vitest";
import { reciprocalRankFusion, retrievalPoolSize, type SearchHit } from "@stancehub/db";

function hit(chunkId: string, score: number): SearchHit {
  return {
    chunkId,
    meetingId: "meeting",
    organizationId: "org1",
    meetingTitle: "Weekly",
    content: chunkId,
    score,
    startMs: null,
    endMs: null,
  };
}

describe("retrievalPoolSize", () => {
  it("over-fetches a bounded candidate pool for fusion", () => {
    expect(retrievalPoolSize(8)).toBe(32);
    expect(retrievalPoolSize(1)).toBe(20);
    expect(retrievalPoolSize(40)).toBe(50);
  });
});

describe("reciprocalRankFusion", () => {
  it("promotes a chunk that both lists rank, using RRF k=60", () => {
    const keyword = [hit("a", 9), hit("b", 4)];
    const vector = [hit("b", 0.9), hit("c", 0.8)];

    const fused = reciprocalRankFusion([keyword, vector], { limit: 3 });

    expect(fused.map((item) => item.chunkId)).toEqual(["b", "a", "c"]);
    expect(fused[0]?.score).toBeCloseTo(1 / 62 + 1 / 61, 10);
    expect(fused[1]?.score).toBeCloseTo(1 / 61, 10);
    expect(fused[2]?.score).toBeCloseTo(1 / 62, 10);
  });

  it("breaks equal RRF scores by chunk id and ignores a missing list", () => {
    const fused = reciprocalRankFusion([[hit("z", 3)], [hit("a", 0.2)], []], { limit: 2 });
    expect(fused.map((item) => item.chunkId)).toEqual(["a", "z"]);
    expect(fused[0]?.score).toBeCloseTo(fused[1]?.score ?? 0, 10);
  });
});
