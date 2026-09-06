import { NextResponse } from "next/server";
import { requireSession } from "@/server/rbac";
import { enqueuePing } from "@/server/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enqueue a BullMQ ping job (auth required). */
export async function POST() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const job = await enqueuePing(`ping from ${session.user.email}`);
  return NextResponse.json({ ok: true, jobId: job.id });
}
