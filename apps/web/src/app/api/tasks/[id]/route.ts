import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { tasks } from "@stancehub/db";
import { getDb } from "@/server/db";
import { requireActiveOrg } from "@/server/org";
import { getTaskForOrg, NOT_FOUND_BODY } from "@/server/tenancy";

const ALLOWED = new Set(["open", "done", "cancelled"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireActiveOrg();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const organizationId = gate.access.organizationId;

  const { id } = await context.params;
  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const status = typeof body.status === "string" ? body.status : "";
  if (!ALLOWED.has(status)) {
    return NextResponse.json({ error: "status must be open, done, or cancelled" }, { status: 400 });
  }

  const db = getDb();
  const existing = await getTaskForOrg(db, { organizationId, taskId: id });
  if (!existing) {
    return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
  }

  const updated = await db
    .update(tasks)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.organizationId, organizationId)))
    .returning({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      meetingId: tasks.meetingId,
    });

  if (updated.length === 0) {
    return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
  }
  return NextResponse.json({ ok: true, task: updated[0] });
}
