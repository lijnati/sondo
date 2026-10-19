# ARCHITECTURE.md — Sondo

Design principle: **a bounded, auditable workflow, not an open-ended multi-agent swarm.** Code owns control flow, budgets, IDs and numbers. The LLM is used only where judgment adds value: interpreting the brief, choosing what to explore next, and synthesizing strategy. It works through typed tools and schema-validated outputs, and it can never mint an ID or a score.

## 1. System overview

```
Browser (Next.js App Router, RSC + client islands)
  │  POST /api/runs  (brief)          ← NDJSON event stream (RunEvent)
  ▼
Run Orchestrator (Node runtime, Fluid Compute, maxDuration 300s)
  ├─ Budget guard (Qloo ≤24 calls, LLM ≤4 calls, wall clock 120s soft / 180s hard)
  ├─ Qloo Client ──► https://hackathon.api.qloo.com  (GET only, X-Api-Key)
  │     └─ Private cache (Postgres qloo_cache, TTL 7d)
  ├─ LLM (Vercel AI SDK → AI Gateway; structured outputs + typed tools)
  ├─ Evidence Ledger (in-memory → persisted with the report)
  └─ Persistence (Neon Postgres: runs, run_events, qloo_cache)
  ▼
/r/[id]  report permalink (server-rendered from stored report)
```

## 2. Workflow (state machine)

| # | Node | Kind | Input → Output | Qloo calls | LLM calls |
|---|---|---|---|---|---|
| 0 | `validateBrief` | code (Zod) | brief JSON → `Brief` (`lib/agent/brief.ts`) | 0 | 0 |
| 1 | `planResearch` | **LLM** (structured) | `Brief` → `ResearchPlanDraft` → **code clamp** (`plan.ts`: brief ages/gender/market win, categories ≤ 5, anchors only from the brief). On model failure → deterministic fallback plan. | 0 | 1 |
| 2 | `resolve` | code | brand + anchors + peers (≤ 6) → trusted `ResolvedRef`s (exact/close only). Typed anchor misses retry once across the plan's alternate types (decision round 0). | ≤ 6 (+ retries) | 0 |
| 3 | `explore` | code (parallel) | per category: **target** (anchors + ages/gender + market) and **baseline** (anchors + market); taste themes; anchor demographics | ≤ 12 | 0 |
| 4 | `deepen` | **adaptive** (`adapt.ts`) | Round 1: the **model proposes tool calls** (`exploreCategory`, `nicheLens`, `bridge`, `tasteThemes`, `stop`; tools have no `execute`). Round 2: **rules** on the updated critique. The dispatcher validates every proposal before running it. | remainder | 1 |
| 5 | `critique` | code (`critique.ts`) | ledger → findings (`F#`, with `E#`) + flags + sufficiency | 0 | 0 |
| 6 | `strategize` | **LLM** (structured) | brief + findings + ledger digest → `StrategyOutput` (opportunities + 3 concepts) | 0 | 1 |
| 7 | `validateClaims` | code (`validate.ts`) | `checkStrategy` → violations | 0 | 0 |
| 8 | `repair` | **LLM** (only if 7 finds repairable violations) | one call; then `finalizeStrategy` applies deterministic fixes | 0 | ≤ 1 |
| 9 | assemble | code | → `AgentRunResult` (status completed / partial / failed / cancelled) | 0 | 0 |

**Hard limits per run (Phase 2, `lib/agent/budget.ts`):** Qloo ≤ **24** calls (cache hits are free); LLM ≤ **4** calls (plan, adapt, strategize, repair, in that priority; the adaptive model round runs only if two calls remain); ≤ **2** adaptive rounds with ≤ 4 actions each; per-stage `maxOutputTokens` (reasoning tokens count); 60 s per model call; **120 s soft** (skip adaptive research) and **180 s hard** (abort everything via one shared AbortSignal and return a partial result); estimated run cost ≤ `SONDO_RUN_COST_LIMIT_USD` (default $0.15; an estimate, not a billing cap).

**Concurrency and pacing:** at most 3 concurrent Qloo requests, with request starts spaced ≥ 250 ms apart. The original plan said 4, but live runs hit 429s without spacing (QLOO_RESEARCH.md §10).

**Retries:** Qloo gets 1 retry on 429/5xx/timeout (honoring `Retry-After`, capped at 10 s, else a 1.5 s backoff). **0 retries on 400/401/403/404.** On 401 the whole run aborts and an operator alert is logged. LLM gets 1 retry on transport errors. Schema failures go to `repair`, not to a blind retry.

**Why this shape:** a single orchestrator with three LLM decision points is enough to be clearly *agentic*. The agent plans, chooses tools adaptively based on intermediate results, self-checks and repairs. It also stays deterministic enough to test, budget and audit. Multiple autonomous agents would add latency, cost and failure modes without adding evidence quality.

### 2.1 Baselines and derived metrics (deterministic)
- **Target query** per category: anchors + location + **audience signals** (age, gender, audiences).
- **Baseline query** per category: anchors + location **without** audience signals. Where anchors are missing, the baseline is location only.
- **Audience lift** for entity *e*: `lift = baselineRank(e) − targetRank(e)`. If *e* is absent from the baseline, it's treated as `baselineRank = take + 1` and flagged `newInTarget`. Lift is shown as rank movement, never as a percentage.
- **Distinctiveness:** `affinityPct(e)` (if available, else `1 − targetRank/take`) combined with `1 − popularity(e)`. The quadrant labels are *Mainstream fit*, *Distinctive fit*, *Weak/mainstream* and *Long tail*. It's labelled "Sondo heuristic" everywhere.
- These are computed only when the inputs exist. They're omitted when there are no audience signals.

## 3. Qloo tool layer (typed)

All tools are server-only. They take **refs**, never raw UUIDs from the LLM. A ref (`ref_*`) is minted by code when `/search`, `/v2/tags` or `/v2/audiences` returns a result, so the LLM can only reference things Qloo actually returned.

```ts
// lib/qloo/types.ts  (shapes finalized after spike; Zod schemas mirror these)
type EntityType = "artist" | "book" | "brand" | "destination" | "movie" | "person" | "place" | "podcast" | "tv_show";
type AgeBucket = "24_and_younger" | "25_to_29" | "30_to_34" | "35_to_44" | "45_to_54" | "55_and_older";

interface ResolvedRef {
  ref: `ref_${string}`;              // minted by Sondo
  kind: "entity" | "tag" | "audience" | "locality";
  qlooId: string;                    // from Qloo, never from LLM
  name: string;
  entityType?: EntityType;
  popularity?: number;               // 0–1 percentile
  matchConfidence: "exact" | "close" | "weak";  // normalized-name comparison
  sourceCallId: string;              // trace link
}

interface AudienceSignals {
  ages?: AgeBucket[];
  gender?: "male" | "female";
  audienceRefs?: string[];
  locationQuery?: string;            // passed as signal.location.query
}

// Tools
searchEntities(i: { query: string; types: EntityType[]; take?: number }): ResolvedRef[]
searchTags(i: { query: string; tagTypes?: string[]; take?: number }): ResolvedRef[]
searchAudiences(i: { audienceType?: string; take?: number }): ResolvedRef[]
insights(i: {
  filterType: EntityType | "tag" | "demographics";
  seedRefs: string[];               // entity refs → signal.interests.entities
  tagRefs?: string[];               // → signal.interests.tags
  audience?: AudienceSignals;
  filterTagRefs?: string[];         // → filter.tags
  excludeTagRefs?: string[];
  placeLocationQuery?: string;      // → filter.location.query (place/destination only)
  popularityMax?: number;           // niche lens
  explain?: boolean;                // feature.explainability
  take?: number;                    // ≤ 25 in Sondo
}): { callId: string; items: EvidenceItem[]; empty: boolean; warnings: string[] }
compare(i: { aRefs: string[]; bRefs: string[] }): { callId: string; raw: unknown } // shape TBD by spike
```

**As implemented (Phase 1b)** in `lib/qloo/operations.ts`. Every operation takes a `QlooSession` (one client, so one budget, plus a `RefRegistry` and an evidence `Ledger`) and returns `{ record: ToolCallRecord, warnings: string[] }` plus its payload:
- `searchEntities({query, types, take})` → `refs: ResolvedRef[]`. A `/search` 404 means no results.
- `searchTags({query, tagTypes?, parentTypes?})`, `searchAudiences({audienceTypes})` and `listAudienceTypes()`.
- `insights(type, InsightsInput)` → `items: EvidenceItem[]`, `empty`.
- `tasteAnalysis(InsightsInput & {tagTypes?, parentTypes?})` → tag `EvidenceItem[]`.
- `demographics({seedRefs})` → `DemographicProfile[]`.
- `compare({aRefs, bRefs})` is **experimental**. Its score is undocumented, so it never becomes evidence.

Dropped params, skipped malformed items and empty results are reported in `warnings` rather than hidden. Transport (`lib/qloo/client.ts`) owns the timeout, retries, budget, concurrency, pacing, cache and trace. A 401 or a second 429 halts the client for the rest of the run.

Parameter builder rules:
1. Each `filterType` has an **allowlist of params** taken from the Entity Type Parameter Guide, plus live-verified extras (`signal.location.query`, `feature.explainability`, `filter.location.query` on place/destination). `/search`, `/v2/tags`, `/v2/audiences` and compare have their own lists. Unsupported params are dropped *before* the request and reported, because Qloo would silently ignore them anyway.
2. Location: `signal.location.query` for entity types, and `filter.location.query` for place/destination (QLOO_RESEARCH.md §10).
3. GET only. Arrays are comma-joined.
4. `take` is capped.

**Qloo client:** `fetch` with `AbortSignal.timeout(12_000)`, the `X-Api-Key` header from `process.env.QLOO_API_KEY` (server only), cache lookup keyed by `sha256(path + sorted params)`, a per-run call counter, and a structured `ToolCallRecord` for every call (the key never appears).

```ts
interface ToolCallRecord {
  callId: string; node: string; tool: string;
  path: string; params: Record<string, string>;   // IDs shown with ref names in UI
  status: number | "timeout" | "error"; latencyMs: number; cached: boolean;
  resultCount: number; retry: number; startedAt: string; error?: string;
}
```

## 4. Evidence model

```ts
interface EvidenceItem {
  id: `E${number}`;                  // E1, E2… assigned by code, stable within run
  callId: string;                    // → ToolCallRecord
  query: { filterType: string; signalSummary: string; variant: "target" | "baseline" | "deepen" };
  entity: { qlooId: string; name: string; type: string; imageUrl?: string; tags: { id: string; name: string }[] };
  rank: number;                      // 1-based position in that response
  of: number;                        // result count
  affinity?: number;                 // ONLY if Qloo returned it (scale recorded)
  popularity?: number;               // Qloo percentile 0–1
  explainability?: { ref: string; contribution: number }[];
  derived?: { lift?: number; newInTarget?: boolean; quadrant?: "mainstream_fit" | "distinctive_fit" | "weak_mainstream" | "long_tail" };
}
```

**Phase 1b additions** (`lib/evidence/types.ts`):
- `entity.kind` is `"entity" | "tag"`, so taste-analysis tags are evidence too.
- `query.inputRefs` lists the refs used as signals.
- `missing[]` lists fields Qloo didn't return (affinity, popularity, tags, image).
- `rank`/`of` are Qloo's original positions, even when malformed items were skipped.
- Endpoint, params and retrieval time live on the linked `ToolCallRecord` (`callId`).

`DemographicProfile` holds `urn:demographics` output verbatim (−1..1, relative). Lift and quadrant are in `lib/evidence/lift.ts`. Quadrant uses the rank half × popularity < 0.90 (absolute; per-list medians mislabelled 0.99 as niche).

Invariants (unit-tested):
- An `EvidenceItem` is created only inside `normalize()` from a real response object.
- `affinity` and `popularity` are copied verbatim, never computed or estimated.
- Derived values live only under `derived` and are labelled in the UI.
- The LLM sees a **digest**: `{id, name, type, rank/of, affinity?, popularity?, lift?, quadrant?, top3Tags}`. It never sees raw IDs. The digest is capped at about 120 items, with top-k per category.

## 5. LLM contracts (structured outputs, Zod)

```ts
const ResearchPlan = z.object({
  anchorsToResolve: z.array(z.object({ name: z.string().max(80), type: EntityTypeEnum })).max(6),
  peerBrands: z.array(z.string().max(80)).max(3),
  audience: z.object({
    ages: z.array(AgeBucketEnum).max(3).optional(),
    gender: z.enum(["male", "female"]).optional(),       // only if brief states it
    audienceKeywords: z.array(z.string()).max(3),         // matched against /v2/audiences results by code
  }),
  locationQuery: z.string().max(80).optional(),
  categories: z.array(EntityTypeEnum).min(3).max(6),
  notModeled: z.array(z.string()).max(8),                 // brief attributes Qloo can't represent
  rationale: z.string().max(400),
});

const Strategy = z.object({
  key: z.enum(["mainstream_anchor", "distinctive_niche", "cross_category_bridge"]),
  title: z.string().max(70),
  thesis: z.string().max(280),
  territory: z.string().max(140),
  partners: z.array(z.object({ evidenceId: EvidenceIdRe, role: z.string().max(80) })).min(2).max(5),
  placements: z.array(z.object({ evidenceIds: z.array(EvidenceIdRe).min(1), idea: z.string().max(160) })).max(4),
  creativeDirection: z.string().max(240),
  claims: z.array(z.object({ text: z.string().max(220), evidenceIds: z.array(EvidenceIdRe).min(1) })).min(3).max(6),
  risks: z.array(z.string().max(160)).min(1).max(3),
  validationPlan: z.array(z.string().max(160)).min(2).max(4),   // how to test, e.g. A/B creative, small-budget pilot
});
const StrategySet = z.object({ executiveSummary: z.string().max(500), strategies: z.array(Strategy).length(3) });
```

Prompting rules:
- The system prompt states that the model may only reference evidence by `E#` IDs.
- **No digits** are allowed in free text except years, and no percentages. The UI renders all numbers from the ledger next to each citation.
- The model must not mention any entity that isn't cited.
- Each strategy must use a distinct primary category mix.

## 6. `deepen` node (bounded agency)

> **Phase 2 implementation:** see `lib/agent/adapt.ts`. The menu below was implemented as `exploreCategory`, `nicheLens`, `bridge`, `tasteThemes` and `stop`; `explain` and `compareWithPeer` were not, because the compare score is undocumented (QLOO_RESEARCH.md §10). Proposals are recorded as `Decision`s (proposedBy model or rule; outcome executed, rejected or skipped, with a reason).
The LLM receives the ledger digest and the critique flags, for example "podcast category empty", "top artists are all mainstream", "strong brand→place signal in Austin". It may call **at most 4 tools in one step** from this menu:
- `bridge(evidenceId, targetType)`: use a discovered entity as the seed in another category.
- `nicheLens(category)`: re-query with `popularityMax: 0.6`.
- `tasteThemes(seedEvidenceIds)`: `urn:tag` if available, else a Sondo tag aggregation.
- `explain(category)`: re-run the top query with `feature.explainability`.
- `compareWithPeer()`: only if a peer brand resolved.

Tool arguments are evidence IDs or enums only. Code resolves them to Qloo IDs. Each call counts against the 40-call budget. This step is skipped if the soft time limit has passed.

## 7. Claim validation (deterministic)
`validateClaims(strategySet, ledger)` fails on any of the following:
1. Zod schema violation.
2. A cited `E#` that isn't in the ledger.
3. A partner or placement whose evidence comes from a failed or empty call.
4. A strategy with < 3 distinct evidence items, or covering < 2 categories.
5. Cross-strategy partner overlap > 30%.
6. Free text containing a forbidden pattern: `/\b(\d{1,3}\s?%|percent|ROI|conversion|will buy|guarantee|proven|purchase intent)\b/i`, or any digit run other than a 4-digit year.
7. A ledger entity name appearing in free text but not cited in that claim. This produces a warning and an auto-attach of the citation, or a fail if ambiguous.

**Phase 2 implementation** (`lib/agent/validate.ts`): rule 6 is negation-aware ("affinity is not purchase intent" is allowed; asserted performance claims are not), and magnitude words (million, thousand) also count as numbers. Digits inside cited entity names are allowed. Concepts also need three distinct angles, ≥ 3 distinct `E#` across ≥ 2 categories to count as `grounded`, and ≤ 30% cited-entity overlap (Jaccard on Qloo entity ids, so the same entity cited via different `E#` still counts).

**Rule 8, citation relevance** (`lib/agent/relevance.ts`, added at the end of Phase 2). A cited `E#` must exist *and* relate to the text that cites it. Each citation is rated `direct` (the text names the item), `contextual` (the text names one of its Qloo tags or its category, e.g. "podcasts"), `unlinked` (no deterministic link) or `mismatch` (the text is about another ledger entity, theme or category). Mismatched citations are dropped and counted (`validation.mismatchedCitations`). An `evidence` claim with no direct or contextual citation is downgraded to `hypothesis`. Only direct and contextual citations count towards `grounded`. A taste theme the text names as a theme ("the Architecture taste theme") is auto-attached, like a named entity; nothing else is ever added. Inline `E#` references in prose ("Santa Monica (E11)") are stripped before the checks: they are citation leaks, not statistics. This is a consistency check, not fact-checking.

Outcome: if it passes, assemble. If it fails, run `repair` once with the violation list. If it fails again, drop the offending claims or partners. If a strategy then falls below the minimum, show it as "insufficient evidence" instead of padding it. **The report never shows an unvalidated claim.**

## 8. Failure handling

| Failure | Behaviour |
|---|---|
| Brand not in Qloo, or weak match | Continue with anchors and peers. Show the "Brand not found in Qloo; strategy is grounded in audience anchors" banner. Never fabricate. |
| No anchors and no brand resolved | Stop before explore. Ask the user for ≥ 1 cultural anchor (inline form error). |
| Category returns empty | Mark the category "no signal". The critique feeds this to `deepen` (it may try bridge or niche). The report shows the empty state honestly. |
| Endpoint unavailable (403 on `urn:tag`/`urn:demographics`, compare) | Feature-flag it off for the session (cached capability probe). Use the documented fallback. |
| 429 / quota | Stop new calls, finish with what exists, and mark "partial". Global switch: featured-examples-only mode. |
| 401 | Abort the run and show a generic "data provider unavailable" message. Log for the operator. |
| LLM schema failure | `repair` once. Then return a deterministic "research-only" report (signals without strategies). |
| Time budget exceeded | Skip optional nodes, then assemble a partial report with a clear notice. |
| Client disconnects | The run continues to completion via `waitUntil` and persists. `/r/[id]` shows the result. |

## 9. Streaming contract (as built, Phase 3)

**Wire format.** `POST /api/runs` with `{ brief }` and an optional `Idempotency-Key` header returns `application/x-ndjson`: one `{ seq, event }` per line, where `event` is a `PublicRunEvent` (`lib/runs/events.ts`, Zod-validated on both ends). The `x-run-id` header carries the public run id.

```ts
type PublicRunEvent =
  | { t: "run.started"; runId; budget: { qloo; llm } }
  | { t: "stage"; stage: "planning" | "research" | "critique" | "strategy" | "validation"; phase: "started" | "finished"; step?; ms?; summary? }
  | { t: "plan"; source; categories; anchors; adjustments }
  | { t: "qloo"; kind: "search" | "insights" | "tags" | "audiences" | "other"; category?; ok; cached; results; ms }
  | { t: "evidence"; category; count }
  | { t: "decision"; proposedBy; tool; target?; outcome; evidenceAdded }
  | { t: "model"; stage; ok; ms }
  | { t: "findings"; count } | { t: "claims"; checked; autoCited; downgraded; removed; repaired }
  | { t: "warning"; message }
  | { t: "run.finished"; runId; status: StoredRunStatus };
```

`toPublicEvent()` (`lib/runs/execute.ts`) maps the agent's internal `RunEvent`s and removes everything private: Qloo params and ids, error strings, token counts and the model's decision reasons. Warnings pass through `publicText()`, which strips secrets and provider error detail. The agent produces no chain-of-thought, so none can be streamed.

**Execution.** `executeRun()` runs the real `runAgent()`, publishes events to the stream and appends them to `run_events` (batched about every second and at each stage boundary), polls `cancel_requested` every 3 s, applies the integrity gate, then writes the final status once. The route hands the run promise to `after()` (Vercel `waitUntil`), with `maxDuration = 300` s against the 180 s agent hard deadline.

| Situation | Behaviour |
|---|---|
| Client disconnects / closes the tab | Stream writes are dropped; the run continues under `after()`, finishes and persists. |
| Refresh mid-run | After `run.started` the client `replaceState`s to `/r/<id>`. The page server-renders the stored events and polls `GET /api/runs/<id>?after=<seq>` every 2 s. |
| Stream drops (network) | The client falls back to polling from its last `seq`. |
| Cancel | `POST /api/runs/<id>/cancel` sets a DB flag; whichever instance runs the agent sees it within ~3 s and aborts. The partial result is stored as `cancelled`. |
| Hard deadline (180 s) | The agent aborts everything and returns `partial`; it is stored. |
| Function killed (crash, platform timeout) | The row stays `running`. Any read more than 240 s after start moves it to `interrupted`, which the report page shows with the stored progress. A genuine late result may still replace `interrupted`. |
| Report fails schema validation on write | Stored as `failed` without a report. A half-written success is never stored. |

No in-memory global state is used: the database is the only coordination point between requests and instances.

## 10. Persistence (as built, Phase 3)
Neon Postgres via `@neondatabase/serverless` (HTTP, plain SQL behind a small `Db` interface in `lib/db/sql.ts`; tests run the same SQL on PGlite). It is used for exactly three things: report permalinks and run state, featured reports, and the private Qloo cache. No users, auth or analytics.

Migrations are forward-only and additive (`db/migrations/*.sql`, `pnpm db:migrate`, tracked in `schema_migrations`, each file in one transaction). `0001_runs.sql` creates:
- `runs`: `id` (12-char base62, random, about 71 bits; the public id and the agent run id; no sequential ids exist), `status` (`running | completed | partial | failed | cancelled | interrupted`), `source` (`web | script`), `brief`, `report`, `usage`, `failure_code`, `ip_hash` (HMAC, never the IP), `idempotency_key` (unique), `cancel_requested`, `featured`, `featured_rank`, timestamps. CHECK constraints: `completed` requires a report; only `completed` runs can be featured.
- `run_events (run_id, seq, at, event)`, primary key `(run_id, seq)`; replays are ignored.
- `qloo_cache (key, body, fetched_at)`: 7-day TTL; a cache failure degrades to a miss.

**Status transitions** (`lib/db/runs.ts`) are single conditional statements: `running →` one terminal status; `interrupted →` a final status; nothing else. Every report is parsed by the `StoredReport` Zod schema on write and on read. **Integrity gate** (`lib/runs/integrity.ts`): before storing `completed`, the result is re-checked against its own ledger with `eval-metrics.ts` (0 invalid citations, 0 residual mismatches, 0 unsupported evidence claims, three grounded concepts, budgets held). Any failure is stored as `partial` with the reasons in its warnings.

**Abuse limits** (`lib/runs/limits.ts`, env-configurable): ≤ 5 web runs per IP hash per 24 h, a global daily cap (default 40), ≤ 2 concurrent running runs, a 16 KB body cap and the `SONDO_LIVE_RUNS=off` kill switch. Caps are checked and the row inserted in one transaction holding `pg_advisory_xact_lock`, so parallel submissions can't overshoot. Featured generation (`source = script`) bypasses web caps.

**Report URLs.** `proxy.ts` checks `/r/:id` before rendering: malformed or unknown ids are rewritten to `/r/missing`, which calls `notFound()` before any await, so the response is a real HTTP 404 (a `notFound()` inside a streamed page can only send 200). Non-featured reports are `noindex`; reports are public to anyone with the link, and the brief form says so.

## 11. Stack decision

| Choice | Verdict | Reason |
|---|---|---|
| Next.js 16 (App Router) + React 19 + TS strict | ✅ | One deployable unit for UI, API and streaming. Vercel-native. |
| Tailwind CSS v4 | ✅ | Token-driven design system |
| shadcn/ui | ✅ **selectively** | Primitives only (Dialog/Sheet, Tabs, Tooltip, Popover, Form inputs), fully restyled. No stock dashboard blocks. |
| Geist Sans + Geist Mono | ✅ | Matches the Neo-Swiss/Vercel direction. Mono for IDs and the trace. |
| Vercel AI SDK (v7) + AI Gateway | ✅ | Structured outputs, tool calling and provider fallback. **AI SDK 7 APIs must be checked against `node_modules/ai/docs` in Phase 1**, not from memory. |
| Model | `SONDO_MODEL`, default `nvidia/nemotron-3.5-lightning-free` ($0, user decision 2026-10-17) via the AI Gateway. Any gateway model works; `openai/gpt-5-mini` is priced in the table. | Every stage has a deterministic fallback, so a weaker free model degrades output quality, not correctness. |
| Zod | ✅ | Single source for runtime validation and LLM schemas |
| Neon Postgres | ✅ minimal | See §10 |
| Vitest | ✅ | Unit tests: param builder, normalize, lift, validator, budget guard |
| Playwright | ✅ minimal | 3 smoke e2e tests: landing, featured report renders, brief to run (against a deployed preview with a real key) |
| Chart library | ❌ | Hand-built SVG for 3 charts. Smaller, more controllable, editorial. |
| Workflow DevKit / queues / eve | ❌ | A run fits one ≤ 300 s function. Durability isn't worth the new-framework risk 2 weeks before the deadline. |
| ORM, auth, analytics, state libs | ❌ | Not needed |

## 12. Repository layout (Phase 1+)

```
app/                 (routes: /, /new, /r/[id], /api/runs)
components/          (ui primitives, report/*, run/*)
lib/qloo/            (client, params allowlists, schemas, refs, operations, cache)
lib/evidence/        (types, ledger, normalize, lift)
scripts/             (probe.ts, explore.ts, scenarios/*.json; sanitized output/)
lib/agent/           (orchestrator, nodes/*, prompts/*, budget, validate)
lib/db/              (sql, cache, runs)
tests/unit/          (synthetic fixtures only — fictional names, fake UUIDs)
tests/e2e/
spike/               (Phase 0 feasibility script + sanitized summary)
```

## 13. Security and data
- `QLOO_API_KEY` and the gateway key exist only on the server, via Vercel env vars. They never reach the client bundle or logs. The trace records the path and params only.
- No Qloo payloads in git. Fixtures are synthetic. Live integration tests are opt-in (`QLOO_LIVE=1`) and don't snapshot responses.
- User briefs may contain brand info. They're stored privately, with no PII fields requested.
