CREATE TABLE "job_outbox" (
  "id" text PRIMARY KEY NOT NULL,
  "job_name" text NOT NULL,
  "organization_id" text NOT NULL,
  "meeting_id" text NOT NULL,
  "generation" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "reconcile_readd_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "published_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "job_outbox"
  ADD CONSTRAINT "job_outbox_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "job_outbox"
  ADD CONSTRAINT "job_outbox_meeting_id_meetings_id_fk"
  FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "job_outbox_job_meeting_generation_uidx"
  ON "job_outbox" ("job_name", "meeting_id", "generation");
--> statement-breakpoint
CREATE INDEX "job_outbox_pending_created_idx"
  ON "job_outbox" ("created_at")
  WHERE "status" = 'pending';
