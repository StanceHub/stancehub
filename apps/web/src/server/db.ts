import {
  assertAppDatabaseRole,
  createDb,
  isTenancyRlsEnabled,
  resolveAppDatabaseUrl,
  withOrganizationScope,
  type Database,
  type DbTransaction,
} from "@stancehub/db";
import { getServerEnv } from "@/env";

const globalForDb = globalThis as unknown as {
  __stancehubDb?: Database;
  __stancehubDbRoleAssert?: Promise<void>;
};

export function getDb(): Database {
  if (!globalForDb.__stancehubDb) {
    // Env parse ensures DATABASE_URL; resolveAppDatabaseUrl never falls back to admin.
    getServerEnv();
    const db = createDb(resolveAppDatabaseUrl(process.env));
    globalForDb.__stancehubDb = db;
    if (isTenancyRlsEnabled(process.env)) {
      // Eager refuse bypass roles; vault gates also await this promise.
      globalForDb.__stancehubDbRoleAssert = assertAppDatabaseRole(db);
    }
  }
  return globalForDb.__stancehubDb;
}

/** Await role assert when TENANCY_RLS=1 (no-op when off). */
export async function ensureAppDbRole(): Promise<Database> {
  const db = getDb();
  if (globalForDb.__stancehubDbRoleAssert) {
    await globalForDb.__stancehubDbRoleAssert;
  }
  return db;
}

export async function withOrgScope<T>(
  organizationId: string,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  const db = await ensureAppDbRole();
  return withOrganizationScope(db, organizationId, fn);
}
