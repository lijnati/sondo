/**
 * The narrow database surface Sondo uses: parameterised queries and non-interactive
 * transactions (a list of statements run atomically). Neon's HTTP driver implements it in
 * production (lib/db/client.ts); tests back it with in-process PGlite running the same SQL.
 */
export type Row = Record<string, unknown>;

export interface Statement {
  text: string;
  params?: unknown[];
}

export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
  /** Runs every statement in one transaction; returns each statement's rows. */
  transaction(statements: Statement[]): Promise<Row[][]>;
}

export class DbError extends Error {
  override readonly name = "DbError";
}
