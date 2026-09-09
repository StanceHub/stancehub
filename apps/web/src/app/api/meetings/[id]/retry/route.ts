import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { meetings } from "@stancehub/db";
import { isLiveEmbedJobState } from "@stancehub/shared";
import { getDb } from "@/server/db";
import { requireOrgSession } from "@/server/org";
import { enqueueEmbedMeeting, getEmbedJob } from "@/server/queue";

const OPEN_PIPELINE = ["pending", "embedding"] as const;

export async function POST(
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
  const db = getDb();
  const [meeting] = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, id), eq(meetings.organizationId, access.organizationId)))
    .limit(1);
  if (!meeting) return NextResponse.json({ error: "not found" }, { status: 404 });

  let committedGeneration: number | null = null;
  try {
    const prepared = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`embed-retry:${id}`}))`);

      const [current] = await tx
        .select({ generation: meetings.embedGeneration })
        .from(meetings)
        .where(and(eq(meetings.id, id), eq(meetings.organizationId, access.organizationId)))
        .limit(1);
      if (!current) return { status: "not_found" as const };

      const running = await getEmbedJob(id, current.generation);
      if (running && isLiveEmbedJobState(running.state)) {
        return { status: "already_running" as const, jobId: running.job.id };
      }

      const [bumped] = await tx
        .update(meetings)
        .set({
          embedGeneration: sql`${meetings.embedGeneration} + 1`,
          pipelineStatus: "pending",
          pipelineError: null,
          updatedAt: new Date(),
        })
        .where(and(eq(meetings.id, id), eq(meetings.organizationId, access.organizationId)))
        .returning({ generation: meetings.embedGeneration });
      if (!bumped) return { status: "not_found" as const };

      return { status: "queued" as const, generation: bumped.generation };
    });

    if (prepared.status === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (prepared.status === "already_running") {
      return NextResponse.json({ ok: true, alreadyRunning: true, meetingId: id, jobId: prepared.jobId });
    }

    committedGeneration = prepared.generation;
    const queued = await enqueueEmbedMeeting({
      organizationId: access.organizationId,
      meetingId: id,
      generation: prepared.generation,
    });
    return NextResponse.json({ ok: true, meetingId: id, jobId: queued.job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "enqueue failed";
    if (committedGeneration != null) {
      await db
        .update(meetings)
        .set({ pipelineStatus: "failed", pipelineError: message.slice(0, 500), updatedAt: new Date() })
        .where(
          and(
            eq(meetings.id, id),
            eq(meetings.organizationId, access.organizationId),
            eq(meetings.embedGeneration, committedGeneration),
            inArray(meetings.pipelineStatus, [...OPEN_PIPELINE]),
          ),
        );
    }
    return NextResponse.json({ error: message, meetingId: id }, { status: 500 });
  }
}
