import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organization } from "./auth";
import { meetings } from "./meetings";

export const meetingArtifacts = pgTable(
  "meeting_artifacts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    contentText: text("content_text"),
    contentJson: jsonb("content_json"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    embedGeneration: integer("embed_generation").notNull().default(1),
    summaryGeneration: integer("summary_generation").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("meeting_artifacts_meeting_kind_uidx").on(t.meetingId, t.kind),
    index("meeting_artifacts_organization_id_idx").on(t.organizationId),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("open"),
    assigneeHint: text("assignee_hint"),
    sourceActionIndex: integer("source_action_index"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("tasks_organization_status_idx").on(t.organizationId, t.status),
    index("tasks_meeting_id_idx").on(t.meetingId),
  ],
);
