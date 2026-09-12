-- Local/CI only: create non-bypass app role for Enterprise RLS (TENANCY_RLS=1).
-- Mounted for fresh Postgres volumes; CI runs this before migrate.
-- Do not put production passwords here — operators set credentials out of band.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stancehub_app') THEN
    CREATE ROLE stancehub_app WITH
      LOGIN
      PASSWORD 'stancehub'
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  ELSE
    ALTER ROLE stancehub_app WITH LOGIN PASSWORD 'stancehub' NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE stancehub TO stancehub_app;
