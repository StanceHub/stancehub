import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./client";
import {
  assertAdminDatabaseRole,
  isTenancyRlsEnabled,
  resolveAdminDatabaseUrl,
} from "./tenancy-rls";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "..", "migrations");

async function main() {
  const connectionString = isTenancyRlsEnabled(process.env)
    ? resolveAdminDatabaseUrl(process.env)
    : (process.env.DATABASE_URL_ADMIN?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      "postgresql://stancehub:stancehub@localhost:5432/stancehub");

  const db = createDb(connectionString);
  if (isTenancyRlsEnabled(process.env)) {
    await assertAdminDatabaseRole(db);
  }
  console.log("Running migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
