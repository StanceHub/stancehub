-- Audit trail (#41). Append-oriented: app role SELECT+INSERT only (retention purge uses admin).

CREATE TABLE IF NOT EXISTS audit_events (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  created_at timestamp NOT NULL DEFAULT now(),
  actor_type text NOT NULL,
  actor_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  outcome text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  query_text text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_events_org_created_at_idx ON audit_events (organization_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS audit_events_org_action_idx ON audit_events (organization_id, action);
--> statement-breakpoint

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenancy_audit_events ON audit_events;
--> statement-breakpoint
CREATE POLICY tenancy_audit_events ON audit_events
  FOR ALL
  USING (organization_id = nullif(current_setting('app.organization_id', true), ''))
  WITH CHECK (organization_id = nullif(current_setting('app.organization_id', true), ''));
--> statement-breakpoint

GRANT SELECT, INSERT ON TABLE audit_events TO stancehub_app;
