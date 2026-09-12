import { NextResponse } from "next/server";
import { insertJobOutbox, meetings, transcripts, publishOutboxForMeetingGeneration } from "@stancehub/db";
import { parseTranscript } from "@stancehub/ai";
import { embedJobId, JOB_NAMES } from "@stancehub/shared";
import { withOrgScope, ensureAppDbRole } from "@/server/db";
import { getQueue } from "@/server/queue";
import { createWebOutboxQueue } from "@/server/outbox-queue";
import { requireActiveOrg } from "@/server/org";

const MAX_BYTES = 1_500_000;

export async function POST(request: Request) {
  const gate = await requireActiveOrg();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const { organizationId } = gate.access;

  let title = "Untitled meeting";
  let raw = "";
  let filename = "";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    title = String(form.get("title") ?? title).trim() || title;
    const pasted = String(form.get("text") ?? "");
    const file = form.get("file");
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "file too large" }, { status: 400 });
      }
      filename = file.name;
      raw = await file.text();
    } else {
      raw = pasted;
    }
  } else {
    const body = (await request.json()) as { title?: string; text?: string };
    title = body.title?.trim() || title;
    raw = body.text ?? "";
  }

  if (!raw.trim()) {
    return NextResponse.json({ error: "transcript is required" }, { status: 400 });
  }
  if (raw.length > MAX_BYTES) {
    return NextResponse.json({ error: "transcript too large" }, { status: 400 });
  }

  const parsed = parseTranscript(raw, filename);
  if (!parsed.text.trim()) {
    return NextResponse.json({ error: "transcript produced no text" }, { status: 400 });
  }
  const meetingId = crypto.randomUUID();
  const transcriptId = crypto.randomUUID();
  const generation = 1;

  await withOrgScope(organizationId, async (tx) => {
    await tx.insert(meetings).values({
      id: meetingId,
      organizationId,
      title,
      source: "upload",
      pipelineStatus: "pending",
      embedGeneration: generation,
    });
    await tx.insert(transcripts).values({
      id: transcriptId,
      organizationId,
      meetingId,
      rawText: raw,
      format: parsed.format,
      version: 1,
    });
    await insertJobOutbox(tx, {
      jobName: JOB_NAMES.embedMeeting,
      organizationId,
      meetingId,
      generation,
      payload: { organizationId, meetingId, generation },
    });
  });

  const published = await publishOutboxForMeetingGeneration(await ensureAppDbRole(), createWebOutboxQueue(getQueue()), {
    jobName: JOB_NAMES.embedMeeting,
    meetingId,
    generation,
    organizationId,
  });

  return NextResponse.json({
    ok: true,
    meetingId,
    enqueue: published.enqueue,
    outboxId: "outboxId" in published ? published.outboxId : undefined,
    jobId: published.enqueue === "redis" ? embedJobId(meetingId, generation) : undefined,
  });
}
