import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_OUTCOMES,
  insertAuditEvent,
  tasks,
} from "@stancehub/db";
import { withOrgScope } from "@/server/db";
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
  const userId = gate.access.session.user.id;

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

  const result = await withOrgScope(organizationId, async (tx) => {
    const existing = await getTaskForOrg(tx, { organizationId, taskId: id });
    if (!existing) return { kind: "not_found" as const };
    if (existing.status === status) {
      return {
        kind: "ok" as const,
        task: {
          id: existing.id,
          title: existing.title,
          status: existing.status,
          meetingId: existing.meetingId,
        },
      };
    }

    const rows = await tx
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(tasks.id, id),
          eq(tasks.organizationId, organizationId),
          eq(tasks.status, existing.status),
        ),
      )
      .returning({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        meetingId: tasks.meetingId,
      });
    const row = rows[0];
    if (!row) return { kind: "conflict" as const };

    await insertAuditEvent(tx, {
      organizationId,
      actorType: AUDIT_ACTOR_TYPES.user,
      actorUserId: userId,
      action: AUDIT_ACTIONS.taskStatusChanged,
      resourceType: "task",
      resourceId: row.id,
      outcome: AUDIT_OUTCOMES.success,
      metadata: {
        fromStatus: existing.status,
        toStatus: status,
        meetingId: row.meetingId,
        taskId: row.id,
      },
    });

    return { kind: "ok" as const, task: row };
  });

  if (result.kind === "not_found") {
    return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
  }
  if (result.kind === "conflict") {
    return NextResponse.json({ error: "task status changed concurrently" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, task: result.task });
}
