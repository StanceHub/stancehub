import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { meetings, transcripts } from "@stancehub/db";
import { parseTranscript } from "@stancehub/ai";
import { getDb } from "@/server/db";
import { enqueueEmbedMeeting } from "@/server/queue";
import { requireOrgSession } from "@/server/org";

const MAX_BYTES = 1_500_000;

export async function POST(request: Request) {
  const access = await requireOrgSession();
  if (!access) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!access.organizationId) {
    return NextResponse.json({ error: "no active organization" }, { status: 400 });
  }

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
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.insert(meetings).values({
      id: meetingId,
      organizationId: access.organizationId!,
      title,
      source: "upload",
      pipelineStatus: "pending",
    });
    await tx.insert(transcripts).values({
      id: transcriptId,
      organizationId: access.organizationId!,
      meetingId,
      rawText: raw,
      format: parsed.format,
      version: 1,
    });
  });

  try {
    const queued = await enqueueEmbedMeeting({
      organizationId: access.organizationId,
      meetingId,
      generation: 1,
    });
    return NextResponse.json({ ok: true, meetingId, jobId: queued.job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "enqueue failed";
    await db
      .update(meetings)
      .set({ pipelineStatus: "failed", pipelineError: message, updatedAt: new Date() })
      .where(and(eq(meetings.id, meetingId), eq(meetings.embedGeneration, 1)));
    return NextResponse.json({ error: message, meetingId }, { status: 500 });
  }
}
