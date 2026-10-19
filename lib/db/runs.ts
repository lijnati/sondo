/**
 * Typed access to `runs` and `run_events`. Every write goes through a single conditional
 * statement or one transaction, and every row read back is parsed with Zod.
 *
 * Status transitions: a run is created `running`. It leaves `running` exactly once, to a
 * terminal status. A `running` row older than `staleAfterMs` is moved to `interrupted`
 * when read (its function died). The only transition out of a terminal status is
 * `interrupted` → a final status, so a genuine late result is never thrown away.
 */
import { z } from "zod";

import { Brief } from "@/lib/agent/brief";
import type { AgentRunResult } from "@/lib/agent/schemas";
import { PublicRunEvent, STORED_STATUSES, type SequencedEvent, type StoredRunStatus } from "@/lib/runs/events";

import { parseStoredReport } from "./report-schema";
import { DbError, type Db } from "./sql";

export interface RunLimits {
  perIpPerDay: number;
  dailyCap: number;
  maxConcurrent: number;
  /** A `running` row older than this is treated as interrupted. */
  staleAfterMs: number;
}

export type CreateRunResult =
  | { kind: "created"; id: string }
  | { kind: "duplicate"; id: string }
  | { kind: "limited"; reason: "ip_daily" | "global_daily" | "concurrent" };

export interface RunRow {
  id: string;
  status: StoredRunStatus;
  source: "web" | "script";
  brief: Brief;
  report: AgentRunResult | null;
  failureCode: string | null;
  featured: boolean;
  createdAt: string;
  startedAt: string;
  finishedAt: string | null;
}

/** Advisory lock key shared by every run insert, so caps are checked one at a time. */
const CREATE_LOCK = 7_340_211;

const ts = z.union([z.string(), z.date()]).transform((v) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString()));
const json = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (typeof v === "string" ? JSON.parse(v) : v), schema);

const RunRowSchema = z.object({
  id: z.string(),
  status: z.enum(STORED_STATUSES),
  source: z.enum(["web", "script"]),
  brief: json(Brief),
  report: json(z.unknown()).nullable(),
  failure_code: z.string().nullable(),
  featured: z.boolean(),
  created_at: ts,
  started_at: ts,
  finished_at: ts.nullable(),
});

const staleSecs = (limits: Pick<RunLimits, "staleAfterMs">) => limits.staleAfterMs / 1000;

export async function createRun(
  db: Db,
  input: { id: string; brief: Brief; ipHash: string | null; idempotencyKey?: string; source: "web" | "script" },
  limits: RunLimits,
): Promise<CreateRunResult> {
  const key = input.idempotencyKey ?? null;
  const [, inserted, diag] = await db.transaction([
    { text: "select pg_advisory_xact_lock($1)", params: [CREATE_LOCK] },
    {
      text: `insert into runs (id, status, source, brief, ip_hash, idempotency_key)
             select $1, 'running', $2::text, $3::jsonb, $4::text, $5::text
             where not exists (select 1 from runs where idempotency_key = $5::text)
               and ($2::text = 'script' or (
                 (select count(*) from runs where source = 'web' and ip_hash = $4::text and created_at > now() - interval '1 day') < $6::int
                 and (select count(*) from runs where source = 'web' and created_at > now() - interval '1 day') < $7::int
                 and (select count(*) from runs where status = 'running' and started_at > now() - make_interval(secs => $8::float8)) < $9::int))
             returning id`,
      params: [input.id, input.source, JSON.stringify(input.brief), input.ipHash, key, limits.perIpPerDay, limits.dailyCap, staleSecs(limits), limits.maxConcurrent],
    },
    {
      text: `select (select id from runs where idempotency_key = $1::text) as existing,
                    (select count(*)::int from runs where source = 'web' and ip_hash = $2::text and created_at > now() - interval '1 day') as ip_count,
                    (select count(*)::int from runs where source = 'web' and created_at > now() - interval '1 day') as day_count`,
      params: [key, input.ipHash],
    },
  ]);
  const created = inserted?.[0]?.id;
  if (typeof created === "string") return { kind: "created", id: created };
  const d = diag?.[0] ?? {};
  if (typeof d.existing === "string") return { kind: "duplicate", id: d.existing };
  if (Number(d.ip_count) >= limits.perIpPerDay) return { kind: "limited", reason: "ip_daily" };
  if (Number(d.day_count) >= limits.dailyCap) return { kind: "limited", reason: "global_daily" };
  return { kind: "limited", reason: "concurrent" };
}

export async function getRun(db: Db, id: string, limits: Pick<RunLimits, "staleAfterMs">): Promise<RunRow | null> {
  const [, rows] = await db.transaction([
    {
      text: `update runs set status = 'interrupted', failure_code = 'interrupted', finished_at = now()
             where id = $1 and status = 'running' and started_at < now() - make_interval(secs => $2::float8)`,
      params: [id, staleSecs(limits)],
    },
    {
      text: "select id, status, source, brief, report, failure_code, featured, created_at, started_at, finished_at from runs where id = $1",
      params: [id],
    },
  ]);
  const raw = rows?.[0];
  if (!raw) return null;
  const r = RunRowSchema.parse(raw);
  return {
    id: r.id,
    status: r.status,
    source: r.source,
    brief: r.brief,
    report: r.report === null ? null : parseStoredReport(r.report),
    failureCode: r.failure_code,
    featured: r.featured,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  };
}

export async function runExists(db: Db, id: string): Promise<boolean> {
  return (await db.query("select 1 from runs where id = $1", [id])).length > 0;
}

/**
 * Moves a run to its final status. The report (if any) is validated first; `completed`
 * without a report is refused here and by a CHECK constraint. Returns false when the run
 * was already final.
 */
export async function finishRun(
  db: Db,
  id: string,
  out: { status: Exclude<StoredRunStatus, "running" | "interrupted">; report: AgentRunResult | null; failureCode?: string },
): Promise<boolean> {
  if (out.status === "completed" && !out.report) throw new DbError("A completed run needs a report");
  const report = out.report ? parseStoredReport(JSON.parse(JSON.stringify(out.report))) : null;
  const usage = report ? JSON.stringify(report.usage) : null;
  const rows = await db.query(
    `update runs set status = $2, report = $3::jsonb, usage = $4::jsonb, failure_code = $5, finished_at = now()
     where id = $1 and status in ('running', 'interrupted') returning id`,
    [id, out.status, report ? JSON.stringify(report) : null, usage, out.failureCode ?? null],
  );
  return rows.length > 0;
}

export async function requestCancel(db: Db, id: string): Promise<boolean> {
  return (await db.query("update runs set cancel_requested = true where id = $1 and status = 'running' returning id", [id])).length > 0;
}

export async function isCancelRequested(db: Db, id: string): Promise<boolean> {
  const rows = await db.query<{ cancel_requested: boolean }>("select cancel_requested from runs where id = $1", [id]);
  return rows[0]?.cancel_requested === true;
}

export async function appendEvents(db: Db, id: string, events: SequencedEvent[]): Promise<void> {
  if (!events.length) return;
  await db.query(
    `insert into run_events (run_id, seq, event)
     select $1, (x->>'seq')::int, x->'event' from jsonb_array_elements($2::jsonb) as x
     on conflict (run_id, seq) do nothing`,
    [id, JSON.stringify(events)],
  );
}

export async function listEvents(db: Db, id: string, afterSeq: number, limit = 500): Promise<SequencedEvent[]> {
  const rows = await db.query<{ seq: number; event: unknown }>("select seq, event from run_events where run_id = $1 and seq > $2 order by seq limit $3", [id, afterSeq, limit]);
  const out: SequencedEvent[] = [];
  for (const r of rows) {
    const parsed = PublicRunEvent.safeParse(typeof r.event === "string" ? JSON.parse(r.event) : r.event);
    if (parsed.success) out.push({ seq: Number(r.seq), event: parsed.data });
  }
  return out;
}

export async function setFeatured(db: Db, id: string, rank: number): Promise<boolean> {
  const [, rows] = await db.transaction([
    { text: "update runs set featured = false, featured_rank = null where featured_rank = $1 and id <> $2", params: [rank, id] },
    { text: "update runs set featured = true, featured_rank = $2 where id = $1 and status = 'completed' returning id", params: [id, rank] },
  ]);
  return (rows?.length ?? 0) > 0;
}

export interface FeaturedCard {
  id: string;
  brandName: string;
  market: string;
  objective: Brief["objective"];
  finishedAt: string | null;
  evidenceCount: number;
  categoryCount: number;
  concepts: { angle: string; name: string; positioning: string }[];
}

const FeaturedRowSchema = z.object({
  id: z.string(),
  brief: json(Brief),
  finished_at: ts.nullable(),
  evidence_count: z.coerce.number(),
  category_count: z.coerce.number(),
  concepts: json(z.array(z.object({ angle: z.string(), name: z.string(), positioning: z.string() }))),
});

export async function listFeatured(db: Db): Promise<FeaturedCard[]> {
  const rows = await db.query(
    `select id, brief, finished_at,
            jsonb_array_length(report->'evidence') as evidence_count,
            (select count(distinct e->'query'->>'filterType') from jsonb_array_elements(report->'evidence') e) as category_count,
            (select coalesce(jsonb_agg(jsonb_build_object('angle', c->>'angle', 'name', c->>'name', 'positioning', c->>'positioning')), '[]'::jsonb)
               from jsonb_array_elements(report->'concepts') c) as concepts
     from runs where featured and status = 'completed' order by featured_rank`,
  );
  return rows.map((raw) => {
    const r = FeaturedRowSchema.parse(raw);
    return {
      id: r.id,
      brandName: r.brief.brandName,
      market: r.brief.market,
      objective: r.brief.objective,
      finishedAt: r.finished_at,
      evidenceCount: r.evidence_count,
      categoryCount: r.category_count,
      concepts: r.concepts,
    };
  });
}
