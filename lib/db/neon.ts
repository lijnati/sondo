/** Neon HTTP driver behind the Db interface. Shared by the app (client.ts) and the CLIs. */
import { neon } from "@neondatabase/serverless";

import type { Db, Row } from "./sql";

export function neonDb(url: string): Db {
  const sql = neon(url);
  return {
    async query<T extends Row = Row>(text: string, params: unknown[] = []) {
      return (await sql.query(text, params)) as T[];
    },
    async transaction(statements) {
      return (await sql.transaction(statements.map((s) => sql.query(s.text, s.params ?? [])))) as Row[][];
    },
  };
}
