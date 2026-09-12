import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { meetings } from "@stancehub/db";
import { getDb } from "@/server/db";
import { prepareMeetingEmbedRetry, publishPreparedMeetingEmbed } from "@/server/embed-retry";
import { requireAdminOrg } from "@/server/org";

/** Org-scoped bulk re-embed. Sequential enqueue to avoid stampeding the worker/LLM. */
export async function POST() {
  const gate = await requireAdminOrg();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const organizationId = gate.access.organizationId;

  const db = getDb();
  const rows = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(eq(meetings.organizationId, organizationId))
    .orderBy(asc(meetings.createdAt));

  let queued = 0;
  let outboxPending = 0;
  let skippedRunning = 0;
  let skippedMissing = 0;
  const errors: Array<{ meetingId: string; error: string }> = [];

  for (const row of rows) {
    try {
      const prepared = await prepareMeetingEmbedRetry({
        organizationId,
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
        organizationId,
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
    organizationId,
    considered: rows.length,
    queued,
    outboxPending,
    skippedRunning,
    skippedMissing,
    errors,
  });
}
