import { openDatabase, resolveAdminDatabaseUrl, type Database } from "@stancehub/db";

let handle: ReturnType<typeof openDatabase> | undefined;

export function getWorkerDb(): Database {
  const connectionString = resolveAdminDatabaseUrl(process.env);
  if (!handle) handle = openDatabase(connectionString);
  return handle.db;
}

export async function closeWorkerDb() {
  if (!handle) return;
  await handle.close();
  handle = undefined;
}
