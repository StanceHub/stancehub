import { NextResponse } from "next/server";
import { embedJobId } from "@stancehub/shared";
import { prepareMeetingEmbedRetry, publishPreparedMeetingEmbed } from "@/server/embed-retry";
import { requireOrgSession } from "@/server/org";

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
  try {
    const prepared = await prepareMeetingEmbedRetry({
      organizationId: access.organizationId,
      meetingId: id,
    });

    if (prepared.status === "not_found") {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (prepared.status === "already_running") {
      return NextResponse.json({ ok: true, alreadyRunning: true, meetingId: id, jobId: prepared.jobId });
    }

    const published = await publishPreparedMeetingEmbed({
      organizationId: access.organizationId,
      meetingId: id,
      generation: prepared.generation,
    });
    return NextResponse.json({
      ok: true,
      meetingId: id,
      generation: prepared.generation,
      enqueue: published.enqueue,
      outboxId: prepared.outboxId,
      jobId:
        published.enqueue === "redis"
          ? embedJobId(id, prepared.generation)
          : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "retry failed";
    return NextResponse.json({ error: message, meetingId: id }, { status: 500 });
  }
}
