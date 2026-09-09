ALTER TABLE "meetings" ADD COLUMN "summary_status" text DEFAULT 'idle' NOT NULL;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "summary_generation" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "summary_error" text;
--> statement-breakpoint
CREATE TABLE "meeting_artifacts" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "meeting_id" text NOT NULL,
  "kind" text NOT NULL,
  "content_text" text,
  "content_json" jsonb,
  "model" text,
  "prompt_version" text,
  "embed_generation" integer DEFAULT 1 NOT NULL,
  "summary_generation" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_artifacts"
  ADD CONSTRAINT "meeting_artifacts_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "meeting_artifacts"
  ADD CONSTRAINT "meeting_artifacts_meeting_id_meetings_id_fk"
  FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_artifacts_meeting_kind_uidx" ON "meeting_artifacts" ("meeting_id", "kind");
--> statement-breakpoint
CREATE INDEX "meeting_artifacts_organization_id_idx" ON "meeting_artifacts" ("organization_id");
--> statement-breakpoint
CREATE TABLE "tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "meeting_id" text NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "assignee_hint" text,
  "source_action_index" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_organization_id_organization_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_meeting_id_meetings_id_fk"
  FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tasks_organization_status_idx" ON "tasks" ("organization_id", "status");
--> statement-breakpoint
CREATE INDEX "tasks_meeting_id_idx" ON "tasks" ("meeting_id");
