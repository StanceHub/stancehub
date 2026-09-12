import { describe, expect, it } from "vitest";
import {
  askRateLimitEnabled,
  askRateLimitKey,
  consumeAskRateLimit,
  readAskRateLimitConfig,
  retryAfterSec,
  withinRateLimit,
  windowBucket,
  type RateLimitRedis,
} from "./ask-rate-limit";

describe("readAskRateLimitConfig", () => {
  it("defaults to disabled limits and 60s window", () => {
    expect(readAskRateLimitConfig({})).toEqual({
      userPerWindow: 0,
      orgPerWindow: 0,
      windowSec: 60,
    });
    expect(askRateLimitEnabled(readAskRateLimitConfig({}))).toBe(false);
  });

  it("parses configured limits", () => {
    const config = readAskRateLimitConfig({
      ASK_RATE_LIMIT_USER_PER_MINUTE: "10",
      ASK_RATE_LIMIT_ORG_PER_MINUTE: "100",
      ASK_RATE_LIMIT_WINDOW_SEC: "30",
    });
    expect(config).toEqual({ userPerWindow: 10, orgPerWindow: 100, windowSec: 30 });
    expect(askRateLimitEnabled(config)).toBe(true);
  });

  it("rejects invalid env when limits are enabled", () => {
    expect(() =>
      readAskRateLimitConfig({
        ASK_RATE_LIMIT_USER_PER_MINUTE: "10",
        ASK_RATE_LIMIT_WINDOW_SEC: "0",
      }),
    ).toThrow(/WINDOW_SEC/);
    expect(() => readAskRateLimitConfig({ ASK_RATE_LIMIT_USER_PER_MINUTE: "-1" })).toThrow(/ASK_RATE_LIMIT/);
  });

  it("ignores invalid window when limits are disabled", () => {
    expect(
      readAskRateLimitConfig({
        ASK_RATE_LIMIT_WINDOW_SEC: "0",
      }),
    ).toEqual({ userPerWindow: 0, orgPerWindow: 0, windowSec: 60 });
  });
});

describe("fixed window helpers", () => {
  it("computes bucket and retry-after", () => {
    // 1000s → bucket 16 for 60s window; window ends at 1020 → retry 20
    expect(windowBucket(1_000_000, 60)).toBe(16);
    expect(retryAfterSec(1_000_000, 60)).toBe(20);
    expect(retryAfterSec(1_019_000, 60)).toBe(1);
  });

  it("encodes window size in redis keys", () => {
    expect(askRateLimitKey("user", "u1", 60, 16)).toBe("ask:rl:user:u1:60:16");
    expect(askRateLimitKey("org", "o1", 30, 2)).toBe("ask:rl:org:o1:30:2");
  });

  it("withinRateLimit includes the counting request", () => {
    expect(withinRateLimit(10, 10)).toBe(true);
    expect(withinRateLimit(11, 10)).toBe(false);
  });
});

describe("consumeAskRateLimit", () => {
  it("skips redis when limits are disabled", async () => {
    const evalFn = async () => {
      throw new Error("should not call redis");
    };
    const decision = await consumeAskRateLimit({
      userId: "u",
      organizationId: "o",
      config: { userPerWindow: 0, orgPerWindow: 0, windowSec: 60 },
      redis: { eval: evalFn } as unknown as RateLimitRedis,
    });
    expect(decision).toEqual({ allowed: true, skipped: true });
  });

  it("increments both keys when both limits are set", async () => {
    const keys: string[] = [];
    let n = 0;
    const decision = await consumeAskRateLimit({
      userId: "u1",
      organizationId: "o1",
      config: { userPerWindow: 10, orgPerWindow: 100, windowSec: 60 },
      nowMs: 1_000_000,
      redis: {
        eval: async (_script: string, _num: number, key: string) => {
          keys.push(String(key));
          n += 1;
          return n;
        },
      } as unknown as RateLimitRedis,
    });
    expect(decision.allowed).toBe(true);
    expect(keys).toEqual(["ask:rl:user:u1:60:16", "ask:rl:org:o1:60:16"]);
  });

  it("increments both keys and denies on user limit without org incr", async () => {
    const keys: string[] = [];
    const second = await consumeAskRateLimit({
      userId: "u1",
      organizationId: "o1",
      config: { userPerWindow: 1, orgPerWindow: 100, windowSec: 60 },
      nowMs: 1_000_000,
      redis: {
        eval: async (_script: string, _num: number, key: string) => {
          keys.push(String(key));
          return 2; // user exceeds; org must not be called
        },
      } as unknown as RateLimitRedis,
    });
    expect(second.allowed).toBe(false);
    if (!second.allowed) {
      expect(second.scope).toBe("user");
      expect(second.retryAfterSec).toBe(20);
      expect(second.orgCount).toBeNull();
    }
    expect(keys).toEqual(["ask:rl:user:u1:60:16"]);
  });

  it("denies on org limit after a successful user incr", async () => {
    let i = 0;
    const decision = await consumeAskRateLimit({
      userId: "u1",
      organizationId: "o1",
      config: { userPerWindow: 50, orgPerWindow: 2, windowSec: 60 },
      nowMs: 1_000_000,
      redis: {
        eval: async () => {
          i += 1;
          return i === 1 ? 1 : 3; // user ok, org exceeds
        },
      } as unknown as RateLimitRedis,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.scope).toBe("org");
      expect(decision.count).toBe(3);
      expect(decision.userCount).toBe(1);
    }
  });

  it("propagates redis failures for fail-closed callers", async () => {
    await expect(
      consumeAskRateLimit({
        userId: "u1",
        organizationId: "o1",
        config: { userPerWindow: 5, orgPerWindow: 0, windowSec: 60 },
        redis: {
          eval: async () => {
            throw new Error("redis down");
          },
        } as unknown as RateLimitRedis,
      }),
    ).rejects.toThrow(/redis down/);
  });
});
