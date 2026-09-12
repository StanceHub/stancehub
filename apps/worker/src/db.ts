import { openDatabase, resolveAdminDatabaseUrl, assertAdminDatabaseRole, type Database } from "@stancehub/db";

let handle: ReturnType<typeof openDatabase> | undefined;
let roleAssert: Promise<void> | undefined;

export function getWorkerDb(): Database {
  const connectionString = resolveAdminDatabaseUrl(process.env);
  if (!handle) {
    handle = openDatabase(connectionString);
    roleAssert = assertAdminDatabaseRole(handle.db);
  }
  return handle.db;
}

/** Await admin role assert when TENANCY_RLS=1 (no-op when off / already resolved). */
export async function ensureWorkerDb(): Promise<Database> {
  const db = getWorkerDb();
  if (roleAssert) await roleAssert;
  return db;
}

export async function closeWorkerDb() {
  if (!handle) return;
  await handle.close();
  handle = undefined;
  roleAssert = undefined;
}
