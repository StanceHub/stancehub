import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/** Append-oriented org audit log (#41). App role gets SELECT+INSERT only. */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    actorType: text("actor_type").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    outcome: text("outcome").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    /** CE default null. Only set when AUDIT_STORE_QUERY_TEXT=1 (truncated). */
    queryText: text("query_text"),
  },
  (t) => [
    index("audit_events_org_created_at_idx").on(t.organizationId, t.createdAt),
    index("audit_events_org_action_idx").on(t.organizationId, t.action),
  ],
);
