import { NextResponse } from "next/server";
import postgres from "postgres";
import { Redis } from "ioredis";
import { ensureAppDbRole } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error" | "skipped"> = {
    app: "ok",
    database: "skipped",
    redis: "skipped",
  };
  const details: Record<string, string> = {};

  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;

  if (databaseUrl) {
    try {
      const sql = postgres(databaseUrl, { max: 1 });
      await sql`select 1`;
      await sql.end({ timeout: 2 });
      // When TENANCY_RLS=1, refuse a bypass/superuser app URL (same assert as vault boot).
      await ensureAppDbRole();
      checks.database = "ok";
    } catch (err) {
      checks.database = "error";
      details.database = err instanceof Error ? err.message : String(err);
    }
  }

  if (redisUrl) {
    try {
      const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true });
      await redis.connect();
      const pong = await redis.ping();
      await redis.quit();
      checks.redis = pong === "PONG" ? "ok" : "error";
    } catch (err) {
      checks.redis = "error";
      details.redis = err instanceof Error ? err.message : String(err);
    }
  }

  const ok = Object.values(checks).every((v) => v === "ok" || v === "skipped") &&
    checks.database === "ok" &&
    checks.redis === "ok";

  return NextResponse.json(
    { ok, checks, details, ts: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
