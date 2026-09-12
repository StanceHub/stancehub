import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_OUTCOMES,
  insertAuditEvent,
  resolveAuditQueryText,
  type AuditAction,
  type AuditOutcome,
} from "@stancehub/db";
import { withOrgScope } from "@/server/db";

/** Best-effort ask audit — never fails the ask response. */
export async function recordAskAuditEvent(input: {
  organizationId: string;
  userId: string;
  action: AuditAction;
  outcome: AuditOutcome;
  query: string;
  metadata: Record<string, unknown>;
}) {
  try {
    await withOrgScope(input.organizationId, (tx) =>
      insertAuditEvent(tx, {
        organizationId: input.organizationId,
        actorType: AUDIT_ACTOR_TYPES.user,
        actorUserId: input.userId,
        action: input.action,
        outcome: input.outcome,
        metadata: input.metadata,
        queryText: resolveAuditQueryText(input.query),
      }),
    );
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "vault.audit.insert_failed",
        action: input.action,
        organizationId: input.organizationId,
        message: error instanceof Error ? error.message : "audit insert failed",
      }),
    );
  }
}

export { AUDIT_ACTIONS, AUDIT_OUTCOMES };
