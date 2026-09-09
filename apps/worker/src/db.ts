import { openDatabase, type Database } from "@stancehub/db";

let handle: ReturnType<typeof openDatabase> | undefined;

export function getWorkerDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  if (!handle) handle = openDatabase(connectionString);
  return handle.db;
}

export async function closeWorkerDb() {
  if (!handle) return;
  await handle.close();
  handle = undefined;
}
