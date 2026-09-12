import Redis from "ioredis";
import { getServerEnv } from "../env";

export const DEFAULT_ASK_RATE_LIMIT_WINDOW_SEC = 60;

export type AskRateLimitConfig = {
  userPerWindow: number;
  orgPerWindow: number;
  windowSec: number;
};

export type AskRateLimitDecision =
  | { allowed: true; skipped: true }
  | {
      allowed: true;
      skipped: false;
      userCount: number | null;
      orgCount: number | null;
    }
  | {
      allowed: false;
      skipped: false;
      scope: "user" | "org";
      limit: number;
      count: number;
      retryAfterSec: number;
      windowSec: number;
      userCount: number | null;
      orgCount: number | null;
    };

function readNonNegativeInt(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return Number(raw);
}

export function readAskRateLimitConfig(
  env: Record<string, string | undefined> = process.env,
): AskRateLimitConfig {
  const userPerWindow = readNonNegativeInt(env, "ASK_RATE_LIMIT_USER_PER_MINUTE", 0);
  const orgPerWindow = readNonNegativeInt(env, "ASK_RATE_LIMIT_ORG_PER_MINUTE", 0);
  if (userPerWindow === 0 && orgPerWindow === 0) {
    return { userPerWindow: 0, orgPerWindow: 0, windowSec: DEFAULT_ASK_RATE_LIMIT_WINDOW_SEC };
  }
  const windowSec = readNonNegativeInt(env, "ASK_RATE_LIMIT_WINDOW_SEC", DEFAULT_ASK_RATE_LIMIT_WINDOW_SEC);
  if (windowSec < 1) {
    throw new Error("ASK_RATE_LIMIT_WINDOW_SEC must be >= 1");
  }
  return { userPerWindow, orgPerWindow, windowSec };
}

export function askRateLimitEnabled(config: AskRateLimitConfig): boolean {
  return config.userPerWindow > 0 || config.orgPerWindow > 0;
}

export function windowBucket(nowMs: number, windowSec: number): number {
  return Math.floor(Math.floor(nowMs / 1000) / windowSec);
}

/** Seconds until the current fixed window ends (at least 1). */
export function retryAfterSec(nowMs: number, windowSec: number): number {
  const bucket = windowBucket(nowMs, windowSec);
  const windowEndUnix = (bucket + 1) * windowSec;
  const nowUnix = Math.floor(nowMs / 1000);
  return Math.max(1, windowEndUnix - nowUnix);
}

export function askRateLimitKey(
  scope: "user" | "org",
  id: string,
  windowSec: number,
  bucket: number,
): string {
  return `ask:rl:${scope}:${id}:${windowSec}:${bucket}`;
}

/** True when this request (already counted) is still within the limit. */
export function withinRateLimit(count: number, limit: number): boolean {
  return count <= limit;
}

const INCR_EXPIRE_LUA = `
local n = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])
return n
`;

const globalForRl = globalThis as unknown as { __stancehubAskRlRedis?: Redis };

export function getAskRateLimitRedis(): Redis {
  if (!globalForRl.__stancehubAskRlRedis) {
    globalForRl.__stancehubAskRlRedis = new Redis(getServerEnv().REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      commandTimeout: 2000,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  }
  return globalForRl.__stancehubAskRlRedis;
}

/** Test seam — reset singleton between tests if needed. */
export function resetAskRateLimitRedisForTests() {
  const existing = globalForRl.__stancehubAskRlRedis;
  globalForRl.__stancehubAskRlRedis = undefined;
  return existing?.quit().catch(() => undefined);
}

async function incrWithExpire(redis: Redis, key: string, ttlSec: number): Promise<number> {
  const result = await redis.eval(INCR_EXPIRE_LUA, 1, key, String(ttlSec));
  const n = typeof result === "number" ? result : Number(result);
  if (!Number.isFinite(n)) {
    throw new Error("rate limit counter returned a non-numeric value");
  }
  return n;
}

export type RateLimitRedis = Pick<Redis, "eval">;

/**
 * Consume one ask attempt against configured user/org windows.
 * When both limits are set, increments both keys then denies if either exceeded.
 */
export async function consumeAskRateLimit(input: {
  userId: string;
  organizationId: string;
  config: AskRateLimitConfig;
  nowMs?: number;
  redis?: RateLimitRedis;
}): Promise<AskRateLimitDecision> {
  const config = input.config;
  if (!askRateLimitEnabled(config)) {
    return { allowed: true, skipped: true };
  }

  const nowMs = input.nowMs ?? Date.now();
  const bucket = windowBucket(nowMs, config.windowSec);
  const ttlSec = config.windowSec + 1;
  const redis = input.redis ?? getAskRateLimitRedis();
  if (!input.redis) {
    const client = redis as Redis;
    if (client.status === "wait") {
      await client.connect();
    }
  }

  let userCount: number | null = null;
  let orgCount: number | null = null;

  if (config.userPerWindow > 0) {
    const key = askRateLimitKey("user", input.userId, config.windowSec, bucket);
    userCount = await incrWithExpire(redis as Redis, key, ttlSec);
    if (!withinRateLimit(userCount, config.userPerWindow)) {
      // Do not burn org budget after the user is already over their cap.
      return {
        allowed: false,
        skipped: false,
        scope: "user",
        limit: config.userPerWindow,
        count: userCount,
        retryAfterSec: retryAfterSec(nowMs, config.windowSec),
        windowSec: config.windowSec,
        userCount,
        orgCount: null,
      };
    }
  }
  if (config.orgPerWindow > 0) {
    const key = askRateLimitKey("org", input.organizationId, config.windowSec, bucket);
    orgCount = await incrWithExpire(redis as Redis, key, ttlSec);
    if (!withinRateLimit(orgCount, config.orgPerWindow)) {
      return {
        allowed: false,
        skipped: false,
        scope: "org",
        limit: config.orgPerWindow,
        count: orgCount,
        retryAfterSec: retryAfterSec(nowMs, config.windowSec),
        windowSec: config.windowSec,
        userCount,
        orgCount,
      };
    }
  }

  return { allowed: true, skipped: false, userCount, orgCount };
}
