-- Phase 5: "Without Qloo" contrast per report (lib/contrast/contrast.ts), written by `pnpm contrast`.
-- Additive only. One row per report; re-running the script replaces it.

create table if not exists report_contrasts (
  run_id text primary key references runs (id) on delete cascade,
  contrast jsonb not null,
  created_at timestamptz not null default now()
);
