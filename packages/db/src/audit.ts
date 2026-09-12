import type { DbOrTx } from "./tenancy-rls";
import { auditEvents } from "./schema/audit";

export const AUDIT_ACTIONS = {
  askCompleted: "ask.completed",
  askMiss: "ask.miss",
  askFailed: "ask.failed",
  summarizeSucceeded: "summarize.succeeded",
  summarizeFailed: "summarize.failed",
  taskBulkReplaced: "task.bulk_replaced",
  taskStatusChanged: "task.status_changed",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUDIT_OUTCOMES = {
  success: "success",
  failure: "failure",
  miss: "miss",
} as const;

export type AuditOutcome = (typeof AUDIT_OUTCOMES)[keyof typeof AUDIT_OUTCOMES];

export const AUDIT_ACTOR_TYPES = {
  user: "user",
  worker: "worker",
  system: "system",
} as const;

/** Align with SEARCH_LOG_QUERY (#21): at most 80 chars when enterprise flag is on. */
export const AUDIT_QUERY_TEXT_MAX = 80;

export function resolveAuditQueryText(
  query: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.AUDIT_STORE_QUERY_TEXT !== "1") return null;
  const trimmed = query.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, AUDIT_QUERY_TEXT_MAX);
}

export function truncateAuditReason(message: string, max = 120): string {
  return message.trim().slice(0, max);
}

export type InsertAuditEventInput = {
  organizationId: string;
  actorType: (typeof AUDIT_ACTOR_TYPES)[keyof typeof AUDIT_ACTOR_TYPES];
  actorUserId?: string | null;
  action: AuditAction | string;
  resourceType?: string | null;
  resourceId?: string | null;
  outcome: AuditOutcome | string;
  metadata?: Record<string, unknown>;
  queryText?: string | null;
};

export async function insertAuditEvent(db: DbOrTx, input: InsertAuditEventInput) {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new Error("organizationId is required for audit events");
  }
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId,
    actorType: input.actorType,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    resourceType: input.resourceType ?? null,
    resourceId: input.resourceId ?? null,
    outcome: input.outcome,
    metadata: input.metadata ?? {},
    queryText: input.queryText ?? null,
  });
}
