-- Phase 3: runs, their progress events, and the private Qloo response cache.
-- Additive only. Statements are separated by a line ending in ';' (see lib/db/migrate.ts).

create table if not exists runs (
  -- Public, random, non-sequential id (lib/runs/ids.ts). Also the agent runId.
  id text primary key check (id ~ '^[0-9A-Za-z]{12}$'),
  status text not null check (status in ('running', 'completed', 'partial', 'failed', 'cancelled', 'interrupted')),
  source text not null default 'web' check (source in ('web', 'script')),
  brief jsonb not null,
  report jsonb,
  usage jsonb,
  failure_code text,
  ip_hash text,
  idempotency_key text unique,
  cancel_requested boolean not null default false,
  featured boolean not null default false,
  featured_rank integer,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- A run is never "completed" without its report.
  constraint runs_completed_has_report check (status <> 'completed' or report is not null),
  constraint runs_featured_completed check (not featured or status = 'completed')
);

create index if not exists runs_ip_created_idx on runs (ip_hash, created_at);

create index if not exists runs_status_idx on runs (status, started_at);

create index if not exists runs_featured_idx on runs (featured_rank) where featured;

create table if not exists run_events (
  run_id text not null references runs (id) on delete cascade,
  seq integer not null check (seq >= 0),
  at timestamptz not null default now(),
  event jsonb not null,
  primary key (run_id, seq)
);

-- Private server-side Qloo cache. Never exported, never committed.
create table if not exists qloo_cache (
  key text primary key,
  body jsonb not null,
  fetched_at timestamptz not null default now()
);
