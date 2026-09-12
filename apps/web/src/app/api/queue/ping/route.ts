import { NextResponse } from "next/server";
import { requireAdminOrg } from "@/server/org";
import { enqueuePing } from "@/server/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin/operator: enqueue a BullMQ ping job. */
export async function POST() {
  const gate = await requireAdminOrg();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const job = await enqueuePing(`ping from ${gate.access.session.user.email}`);
  return NextResponse.json({ ok: true, jobId: job.id });
}
