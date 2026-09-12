import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { meetings, tasks } from "@stancehub/db";
import { getDb } from "@/server/db";
import { requireActiveOrg } from "@/server/org";

export async function GET() {
  const gate = await requireActiveOrg();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const organizationId = gate.access.organizationId;

  const db = getDb();
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      assigneeHint: tasks.assigneeHint,
      meetingId: tasks.meetingId,
      meetingTitle: meetings.title,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .innerJoin(
      meetings,
      and(eq(meetings.id, tasks.meetingId), eq(meetings.organizationId, tasks.organizationId)),
    )
    .where(eq(tasks.organizationId, organizationId))
    .orderBy(asc(tasks.createdAt))
    .limit(200);

  return NextResponse.json({ ok: true, tasks: rows });
}
