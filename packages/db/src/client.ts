import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDb>;

export function createDb(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, { schema });
}

export function openDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

export function createDbClient(connectionString: string) {
  return postgres(connectionString, { max: 10 });
}
