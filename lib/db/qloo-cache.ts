/**
 * Private server-side Qloo response cache in Postgres (allowed by the hackathon guide).
 * A cache failure is never a run failure: reads degrade to a miss, writes are dropped.
 */
import type { QlooCache } from "@/lib/qloo/cache";

import type { Db } from "./sql";

const TTL_DAYS = 7;

/** Resolves to `fallback` if `p` hasn't settled within `ms`. */
function capped<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

export class PgQlooCache implements QlooCache {
  /** `timeoutMs` caps every cache read and write so a slow database never slows a run. */
  constructor(
    private readonly db: Db,
    private readonly timeoutMs = 2_000,
  ) {}

  async get(key: string): Promise<unknown | undefined> {
    const read = this.db.query<{ body: unknown }>(`select body from qloo_cache where key = $1 and fetched_at > now() - make_interval(days => ${TTL_DAYS})`, [key]).then((rows) => {
      const body = rows[0]?.body;
      return typeof body === "string" ? (JSON.parse(body) as unknown) : body;
    });
    return capped<unknown>(read, this.timeoutMs, undefined);
  }

  async set(key: string, body: unknown): Promise<void> {
    // A dropped write only costs a future cache hit: the response was already used.
    const write = this.db
      .query("insert into qloo_cache (key, body, fetched_at) values ($1, $2::jsonb, now()) on conflict (key) do update set body = excluded.body, fetched_at = now()", [key, JSON.stringify(body)])
      .then(() => undefined);
    await capped(write, this.timeoutMs, undefined);
  }
}
