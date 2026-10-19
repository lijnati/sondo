/**
 * `pnpm db:migrate`: applies pending additive migrations in db/migrations to DATABASE_URL.
 * Prints file names only — never the connection string.
 */
import { migrate } from "@/lib/db/migrate";
import { neonDb } from "@/lib/db/neon";
import { parseServerEnv } from "@/lib/env/schema";

const env = parseServerEnv(process.env);
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (expected in .env.local). Nothing was changed.");
  process.exit(2);
}
const applied = await migrate(neonDb(env.DATABASE_URL));
console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date.");
