import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { meetings } from "@stancehub/db";
import { getDb } from "@/server/db";
import { prepareMeetingEmbedRetry, publishPreparedMeetingEmbed } from "@/server/embed-retry";
import { requireOrgSession } from "@/server/org";

/** Org-scoped bulk re-embed. Sequential enqueue to avoid stampeding the worker/LLM. */
export async function POST() {
  const access = await requireOrgSession();
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!access.organizationId) {
    return NextResponse.json({ error: "no active organization" }, { status: 400 });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "admin required" }, { status: 403 });
  }

  const db = getDb();
  const rows = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(eq(meetings.organizationId, access.organizationId))
    .orderBy(asc(meetings.createdAt));

  let queued = 0;
  let outboxPending = 0;
  let skippedRunning = 0;
  let skippedMissing = 0;
  const errors: Array<{ meetingId: string; error: string }> = [];

  for (const row of rows) {
    try {
      const prepared = await prepareMeetingEmbedRetry({
        organizationId: access.organizationId,
        meetingId: row.id,
      });
      if (prepared.status === "not_found") {
        skippedMissing += 1;
        continue;
      }
      if (prepared.status === "already_running") {
        skippedRunning += 1;
        continue;
      }
      const published = await publishPreparedMeetingEmbed({
        organizationId: access.organizationId,
        meetingId: row.id,
        generation: prepared.generation,
      });
      if (published.enqueue === "redis") queued += 1;
      else outboxPending += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "retry failed";
      errors.push({ meetingId: row.id, error: message });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    organizationId: access.organizationId,
    considered: rows.length,
    queued,
    outboxPending,
    skippedRunning,
    skippedMissing,
    errors,
  });
}
