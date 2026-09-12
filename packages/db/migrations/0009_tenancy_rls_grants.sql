-- Tighten stancehub_app grants: auth + vault only (Better Auth shares DATABASE_URL).
-- Drop blanket public defaults so future tables are not auto-granted.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM stancehub_app;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM stancehub_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM stancehub_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM stancehub_app;
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "user",
  session,
  account,
  verification,
  organization,
  member,
  invitation,
  meetings,
  transcripts,
  chunks,
  meeting_artifacts,
  tasks,
  job_outbox,
  org_search_stats,
  org_term_df
TO stancehub_app;
--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
  ) THEN
    EXECUTE 'REVOKE ALL ON TABLE drizzle.__drizzle_migrations FROM stancehub_app';
  END IF;
END
$$;
