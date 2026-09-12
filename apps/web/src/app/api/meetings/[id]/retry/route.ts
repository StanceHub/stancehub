import { NextResponse } from "next/server";
import { embedJobId } from "@stancehub/shared";
import { requireAdminOrg } from "@/server/org";
import { prepareMeetingEmbedRetry, publishPreparedMeetingEmbed } from "@/server/embed-retry";
import { NOT_FOUND_BODY } from "@/server/tenancy";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdminOrg();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await context.params;
  try {
    const prepared = await prepareMeetingEmbedRetry({
      organizationId: gate.access.organizationId,
      meetingId: id,
    });

    if (prepared.status === "not_found") {
      return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
    }
    if (prepared.status === "already_running") {
      return NextResponse.json({
        ok: true,
        alreadyRunning: true,
        meetingId: id,
        jobId: prepared.jobId,
      });
    }

    const published = await publishPreparedMeetingEmbed({
      organizationId: gate.access.organizationId,
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
        published.enqueue === "redis" ? embedJobId(id, prepared.generation) : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "retry failed";
    return NextResponse.json({ error: message, meetingId: id }, { status: 500 });
  }
}
