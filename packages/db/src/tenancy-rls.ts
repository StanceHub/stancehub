import { sql } from "drizzle-orm";
import type { Database } from "./client";

export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | DbTransaction;

/** Drizzle PgTransaction exposes `rollback`; the root `Database` does not. */
export function isDbTransaction(db: DbOrTx): db is DbTransaction {
  return typeof (db as { rollback?: unknown }).rollback === "function";
}

export function isTenancyRlsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TENANCY_RLS === "1";
}

/**
 * Resolve migrate/worker URL. When TENANCY_RLS=1, admin is required (no silent fallback to app URL).
 */
export function resolveAdminDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (isTenancyRlsEnabled(env)) {
    const admin = env.DATABASE_URL_ADMIN?.trim();
    if (!admin) {
      throw new Error("DATABASE_URL_ADMIN is required when TENANCY_RLS=1");
    }
    return admin;
  }
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

/**
 * App (web) URL. When TENANCY_RLS=1, must be the non-bypass role — never fall back to admin.
 */
export function resolveAppDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  return url;
}

type RoleFlags = { rolsuper: boolean; rolbypassrls: boolean };

function roleFlagsFromExecute(result: unknown): RoleFlags | null {
  const rows = Array.isArray(result)
    ? result
    : result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)
      ? result.rows
      : [];
  const row = rows[0] as { rolsuper?: boolean; rolbypassrls?: boolean } | undefined;
  if (!row) return null;
  return {
    rolsuper: Boolean(row.rolsuper),
    rolbypassrls: Boolean(row.rolbypassrls),
  };
}

/** Refuse app pool when TENANCY_RLS=1 if current_user can bypass RLS (incl. docker superuser). */
export async function assertAppDatabaseRole(db: Database): Promise<void> {
  if (!isTenancyRlsEnabled()) return;
  const result = await db.execute(sql`
    SELECT rolsuper, rolbypassrls
    FROM pg_roles
    WHERE rolname = current_user
  `);
  const flags = roleFlagsFromExecute(result);
  if (!flags) {
    throw new Error("TENANCY_RLS=1: could not resolve current_user role flags");
  }
  if (flags.rolsuper || flags.rolbypassrls) {
    throw new Error(
      "TENANCY_RLS=1 requires DATABASE_URL as a non-superuser, NOBYPASSRLS role (e.g. stancehub_app); do not use DATABASE_URL_ADMIN for the web app",
    );
  }
}

/**
 * Run vault queries with `SET LOCAL app.organization_id`. Empty org id fails closed.
 * Does not open nested transactions when already inside a tx.
 */
export async function withOrganizationScope<T>(
  db: DbOrTx,
  organizationId: string,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const orgId = organizationId.trim();
  if (!orgId) {
    throw new Error("organizationId is required for organization-scoped queries");
  }

  const run = async (tx: DbTransaction) => {
    await tx.execute(sql`select set_config('app.organization_id', ${orgId}, true)`);
    return fn(tx);
  };

  if (isDbTransaction(db)) {
    return run(db);
  }
  return db.transaction(async (tx) => run(tx));
}
