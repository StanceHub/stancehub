import { NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import {
  meetings,
  orgSearchStatsLockSql,
  removeMeetingChunksAndStats,
} from "@stancehub/db";
import { isLiveEmbedJobState } from "@stancehub/shared";
import { getDb } from "@/server/db";
import { requireOrgSession } from "@/server/org";
import { getEmbedJob } from "@/server/queue";

const OPEN_PIPELINE = ["pending", "embedding"] as const;

function isOpenPipeline(status: string) {
  return (OPEN_PIPELINE as readonly string[]).includes(status);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireOrgSession();
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!access.organizationId) {
    return NextResponse.json({ error: "no active organization" }, { status: 400 });
  }
  if (!access.isAdmin) {
    return NextResponse.json({ error: "admin required" }, { status: 403 });
  }

  const { id } = await context.params;
  const organizationId = access.organizationId;
  const db = getDb();

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`embed-retry:${id}`}))`);

      const [current] = await tx
        .select({
          id: meetings.id,
          generation: meetings.embedGeneration,
          pipelineStatus: meetings.pipelineStatus,
        })
        .from(meetings)
        .where(and(eq(meetings.id, id), eq(meetings.organizationId, organizationId)))
        .limit(1)
        .for("update");
      if (!current) return { status: "not_found" as const };

      if (isOpenPipeline(current.pipelineStatus)) {
        let running;
        try {
          running = await getEmbedJob(id, current.generation);
        } catch {
          return { status: "busy" as const, reason: "could not verify embed job state" };
        }
        if (running && isLiveEmbedJobState(running.state)) {
          return { status: "busy" as const, reason: "embed job is still running" };
        }
        return {
          status: "busy" as const,
          reason: "meeting embed is still open; wait or retry until ready/failed",
        };
      }

      await tx.execute(orgSearchStatsLockSql(organizationId));

      const [stillThere] = await tx
        .select({
          id: meetings.id,
          pipelineStatus: meetings.pipelineStatus,
        })
        .from(meetings)
        .where(and(eq(meetings.id, id), eq(meetings.organizationId, organizationId)))
        .limit(1);
      if (!stillThere) return { status: "not_found" as const };
      if (isOpenPipeline(stillThere.pipelineStatus)) {
        return {
          status: "busy" as const,
          reason: "meeting embed is still open; wait or retry until ready/failed",
        };
      }

      await removeMeetingChunksAndStats(tx, { organizationId, meetingId: id });

      const deleted = await tx
        .delete(meetings)
        .where(and(eq(meetings.id, id), eq(meetings.organizationId, organizationId)))
        .returning({ id: meetings.id });
      if (deleted.length === 0) return { status: "not_found" as const };

      return { status: "deleted" as const };
    });

    if (result.status === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (result.status === "busy") {
      return NextResponse.json({ error: result.reason }, { status: 409 });
    }
    return NextResponse.json({ ok: true, meetingId: id, deleted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "delete failed";
    return NextResponse.json({ error: message, meetingId: id }, { status: 500 });
  }
}
