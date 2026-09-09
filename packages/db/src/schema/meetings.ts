import { integer, pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { organization } from "./auth";

/** Product tables (Sprint 0 skeleton — expand in Sprint 1+) */
export const meetings = pgTable(
  "meetings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    source: text("source").notNull().default("upload"),
    pipelineStatus: text("pipeline_status").notNull().default("pending"),
    pipelineError: text("pipeline_error"),
    embedGeneration: integer("embed_generation").notNull().default(1),
    summaryStatus: text("summary_status").notNull().default("idle"),
    summaryGeneration: integer("summary_generation").notNull().default(0),
    summaryError: text("summary_error"),
    startedAt: timestamp("started_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("meetings_organization_id_idx").on(t.organizationId)],
);
