import "server-only";

import { requireEnv } from "@/lib/env/server";

import { neonDb } from "./neon";
import type { Db } from "./sql";

let db: Db | undefined;

/** The app's database. Throws `DATABASE_URL is not configured` without one. */
export function getDb(): Db {
  db ??= neonDb(requireEnv("DATABASE_URL"));
  return db;
}
