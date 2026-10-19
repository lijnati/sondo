/**
 * Forward-only, additive migrations. Each `db/migrations/NNNN_name.sql` file runs once,
 * in one transaction together with its `schema_migrations` row, so a failed file leaves
 * nothing behind. Files are split into statements on lines ending in `;` — keep them
 * free of functions and DO blocks.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Db } from "./sql";

export const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");

export function splitStatements(sqlText: string): string[] {
  return sqlText
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) =>
      s
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const statements = splitStatements(await readFile(join(dir, file), "utf8"));
    await db.transaction([...statements.map((text) => ({ text })), { text: "insert into schema_migrations (name) values ($1)", params: [file] }]);
    applied.push(file);
  }
  return applied;
}
