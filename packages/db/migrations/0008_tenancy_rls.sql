-- Enterprise RLS (#49 PR2). Assumes role `stancehub_app` already exists (see deploy/postgres bootstrap).
-- Table owners / BYPASSRLS / superusers remain the migrate+worker escape hatch.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stancehub_app') THEN
    RAISE EXCEPTION 'role stancehub_app missing — run deploy/postgres role bootstrap before migrate';
  END IF;
END
$$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO stancehub_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stancehub_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO stancehub_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stancehub_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO stancehub_app;
--> statement-breakpoint

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE meetings FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenancy_meetings ON meetings;
--> statement-breakpoint
CREATE POLICY tenancy_meetings ON meetings
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), ''));
--> statement-breakpoint

ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE transcripts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenancy_transcripts ON transcripts;
--> statement-breakpoint
CREATE POLICY tenancy_transcripts ON transcripts
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), ''));
--> statement-breakpoint

ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE chunks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenancy_chunks ON chunks;
--> statement-breakpoint
CREATE POLICY tenancy_chunks ON chunks
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), ''));
--> statement-breakpoint

ALTER TABLE meeting_artifacts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE meeting_artifacts FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenancy_meeting_artifacts ON meeting_artifacts;
--> statement-breakpoint
CREATE POLICY tenancy_meeting_artifacts ON meeting_artifacts
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), ''));
--> statement-breakpoint

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tasks FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenancy_tasks ON tasks;
--> statement-breakpoint
CREATE POLICY tenancy_tasks ON tasks
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), ''));
--> statement-breakpoint

ALTER TABLE job_outbox ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE job_outbox FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenancy_job_outbox ON job_outbox;
--> statement-breakpoint
CREATE POLICY tenancy_job_outbox ON job_outbox
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), ''));
--> statement-breakpoint

ALTER TABLE org_search_stats ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE org_search_stats FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenancy_org_search_stats ON org_search_stats;
--> statement-breakpoint
CREATE POLICY tenancy_org_search_stats ON org_search_stats
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), ''));
--> statement-breakpoint

ALTER TABLE org_term_df ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE org_term_df FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenancy_org_term_df ON org_term_df;
--> statement-breakpoint
CREATE POLICY tenancy_org_term_df ON org_term_df
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), ''));
