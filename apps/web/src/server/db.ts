import { createDb, type Database } from "@stancehub/db";
import { getServerEnv } from "@/env";

const globalForDb = globalThis as unknown as { __stancehubDb?: Database };

export function getDb(): Database {
  if (!globalForDb.__stancehubDb) {
    globalForDb.__stancehubDb = createDb(getServerEnv().DATABASE_URL);
  }
  return globalForDb.__stancehubDb;
}
