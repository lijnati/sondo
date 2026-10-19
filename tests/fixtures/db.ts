/**
 * In-process Postgres (PGlite) behind Sondo's Db interface, with the real migrations
 * applied. Tests exercise the production SQL; no network, no Neon.
 */
import { PGlite } from "@electric-sql/pglite";

import { migrate } from "@/lib/db/migrate";
import type { Db, Row } from "@/lib/db/sql";

export function pgliteDb(pg: PGlite): Db {
  return {
    async query<T extends Row = Row>(text: string, params: unknown[] = []) {
      return (await pg.query<T>(text, params)).rows;
    },
    async transaction(statements) {
      return pg.transaction(async (tx) => {
        const out: Row[][] = [];
        for (const s of statements) out.push((await tx.query<Row>(s.text, s.params ?? [])).rows);
        return out;
      });
    },
  };
}

export async function testDb(): Promise<{ db: Db; pg: PGlite; close: () => Promise<void> }> {
  const pg = await PGlite.create();
  const db = pgliteDb(pg);
  await migrate(db);
  return { db, pg, close: () => pg.close() };
}
