CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "pipeline_error" text;
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"meeting_id" text NOT NULL,
	"raw_text" text NOT NULL,
	"format" text DEFAULT 'plain' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"meeting_id" text NOT NULL,
	"transcript_id" text NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"start_offset" integer,
	"end_offset" integer,
	"start_ms" integer,
	"end_ms" integer,
	"embedding" vector(768) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_transcript_id_transcripts_id_fk" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "transcripts_meeting_id_idx" ON "transcripts" USING btree ("meeting_id");
--> statement-breakpoint
CREATE INDEX "transcripts_organization_id_idx" ON "transcripts" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_meeting_chunk_idx" ON "chunks" USING btree ("meeting_id","chunk_index");
--> statement-breakpoint
CREATE INDEX "chunks_organization_id_idx" ON "chunks" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX "chunks_meeting_id_idx" ON "chunks" USING btree ("meeting_id");
--> statement-breakpoint
CREATE INDEX "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);
