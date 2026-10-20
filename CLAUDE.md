# CLAUDE.md — Sondo engineering rules

Sondo is an autonomous cultural-intelligence strategist for the Qloo Agentic Hackathon. The deadline is **Oct 30, 2026, 11:45 pm ET**, and the internal submit target is **Oct 29, 6 pm ET**.
Read the relevant doc before changing an area: PRODUCT.md (scope, honesty rules), QLOO_RESEARCH.md (API truth), ARCHITECTURE.md (contracts, limits), DESIGN.md (UI), ROADMAP.md (current phase), HACKATHON.md (compliance).

## UI
- Pixel Meadow, paper mode, **light-only by design** (no dark theme). Tokens live in `app/meadow.css`; page CSS uses tokens only. Follow the `pixel-meadow-ui` skill and DESIGN.md.
- No script may mutate server-rendered DOM (reveals are CSS-only), and nothing time-dependent renders before mount, so hydration always matches.
- Evidence tiers come only from `claimBadge` and `ideaBadge` (`lib/report/view.ts`). A creative idea must never look like a Qloo finding.

## Phase gate
- Phases 0–3 are closed. **Phase 4 (product design) was authorized 2026-10-20**; its results are in ROADMAP.md. **Phase 5 (hardening) needs explicit authorization.** Don't start a new phase without it.

## Qloo
- Host `https://hackathon.api.qloo.com` only. Header `X-Api-Key`. **GET with query params only** (POST fails).
- `filter.type` is required. Check every param against the per-type allowlist. Unsupported params are *silently ignored*, so drop them in code rather than trusting 200s.
- 0 retries on 400/401/403/404. **Stop on 401.** At most 1 retry on 429/5xx/timeout.
- Don't invent endpoints, params or response fields. If it isn't 🧪 in QLOO_RESEARCH.md, treat it as unverified and feature-detect it.
- **Never commit Qloo response data.** Test fixtures are synthetic (fictional names, fake UUIDs). Caches live in the private DB only.

## Evidence integrity (non-negotiable)
- Entity IDs, scores and evidence IDs come only from code paths that parsed a real Qloo response. The LLM references evidence by `E#` and refs by `ref_*` only.
- The LLM never writes numbers or percentages. The UI renders numbers from the ledger.
- No claims of purchase intent, conversion, ROI, audience share or causality. Derived metrics (lift, distinctiveness) are always labelled "Sondo heuristic".
- Every displayed claim has passed validation (`checkStrategy`/`finalizeStrategy` in `lib/agent/validate.ts`), including citation relevance (`lib/agent/relevance.ts`). A citation must relate to the text that cites it, and an evidence claim without a relevant citation is shown as a hypothesis.

## Runs and persistence (Phase 3)
- The database is the only coordination point between requests: no in-memory global state. A run is executed by `executeRun()` (`lib/runs/execute.ts`) under `after()`; it must persist even if the client leaves.
- Public events go through `toPublicEvent()`: never stream Qloo params or ids, error strings, token counts or model-written reasons.
- Status changes only through `lib/db/runs.ts` (conditional updates). `completed` requires the integrity gate (`lib/runs/integrity.ts`) and a Zod-valid report; featured runs must be `completed`.
- Migrations are additive and forward-only (`db/migrations/`, `pnpm db:migrate`). Ask before any destructive change.
- Unknown report ids must return a real 404 (`proxy.ts` → `/r/missing`). Keep `notFound()` before any await there.

## Budgets (per run)
Qloo ≤ 24 calls · LLM ≤ 4 calls · ≤ 2 adaptive rounds · Qloo timeout 12 s · model call 60 s · wall clock 120 s soft / 180 s hard · concurrency 3 with ≥ 250 ms between request starts · estimated run cost ≤ $0.15 (not a billing cap). Source of truth: `lib/agent/budget.ts`.

## Code
- TypeScript strict, ESM, Zod at every boundary (brief, Qloo responses, LLM outputs, DB rows).
- Next.js 16 App Router, Node runtime (no edge). AI SDK 7 (7.0.143): verify APIs in `node_modules/ai/docs`, not from memory. The model is `SONDO_MODEL` via the AI Gateway.
- Keep dependencies minimal. Use shadcn primitives only (restyled). No chart library. No ORM, auth or analytics.
- Secrets exist server-only via env vars. Never log the key. The tool trace records path and params only.

## Verification before claiming done
- `pnpm typecheck && pnpm lint && pnpm test` are green. For agent changes, also run `pnpm eval` (live, metrics only).
- UI changes are checked in a real browser at 375 and 1280, including empty, partial and error states.
- Report real outcomes. Never present mocked fixtures as proof of live API behavior.

## Commands
- `pnpm dev` · `pnpm build` · `pnpm start` · `pnpm lint` · `pnpm typecheck` (runs `next typegen` first) · `pnpm test` (Vitest) · `pnpm e2e` (Playwright; builds and serves on :3100, or set `E2E_BASE_URL`; it reuses a server already on :3100, so stop stale ones first; `E2E_LIVE=1` adds a live brief→report run).
- Spike: `pnpm spike` (reads `.env.local`, Node ≥ 23.6). It writes a sanitized `spike/output/feasibility-summary.json`.
- `pnpm probe`: live capability probe through `lib/qloo/*` (about 28 calls). It writes a sanitized `scripts/output/probe-summary.json` (safe to commit).
- `pnpm explore <scenario> [--depth 1] [--save] [--no-cache]`: bounded live research for `scripts/scenarios/*.json` (≤ 40 calls). Console only. It caches responses in the gitignored `.qloo-cache/`; never commit them.
- `pnpm agent <brief> [--json] [--out] [--no-cache] [--no-model]`: run the real agent on `scripts/briefs/*.json`. Needs `AI_GATEWAY_API_KEY` unless `--no-model` (Qloo-only research, deterministic plan and rules).
- `pnpm eval [--only a,b] [--cache] [--out]`: the Phase 2 evaluation. It runs the 5 fixed briefs live (no Qloo cache by default) and writes metrics only to `scripts/output/eval-summary.json` (safe to commit). The exit code is non-zero unless every brief passes. `--out` saves full results to the gitignored `.qloo-cache/runs/`.
- `pnpm db:migrate`: apply pending migrations to `DATABASE_URL` (prints file names only).
- `pnpm featured <brief>[:rank] …`: run briefs live through `executeRun()`, persist them, and feature each one only if it is stored `completed`. Spends real quota (≤ 24 Qloo calls each; the Postgres cache makes re-runs cheap).
- `pnpm model:smoke [provider/model]`: check that a gateway model handles structured output and tool calls. The default free model has no native JSON-schema output, so `generateStructured` uses a forced tool call (`SONDO_STRUCTURED_MODE=tool|output` overrides).
- TypeScript is pinned to `~6.0` because typescript-eslint doesn't support 7.x yet.
