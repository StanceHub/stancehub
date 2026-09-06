import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "./client";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://stancehub:stancehub@localhost:5432/stancehub";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "..", "migrations");

async function main() {
  const db = createDb(connectionString);
  console.log("Running migrations from", migrationsFolder);
  await migrate(db, { migrationsFolder });
  console.log("Migrations complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
