import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organization } from "./auth";
import { meetings } from "./meetings";

/** Durable intent to enqueue BullMQ jobs (embed / summarize). */
export const jobOutbox = pgTable(
  "job_outbox",
  {
    id: text("id").primaryKey(),
    jobName: text("job_name").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    meetingId: text("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    generation: integer("generation").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    reconcileReaddAt: timestamp("reconcile_readd_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    publishedAt: timestamp("published_at"),
  },
  (t) => [
    uniqueIndex("job_outbox_job_meeting_generation_uidx").on(t.jobName, t.meetingId, t.generation),
    index("job_outbox_pending_created_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export type JobOutboxRow = typeof jobOutbox.$inferSelect;
