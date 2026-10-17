# ARCHITECTURE.md — Sondo

Design principle: **a bounded, auditable workflow, not an open-ended multi-agent swarm.** Code owns control flow, budgets, IDs and numbers. The LLM is used only where judgment adds value: interpreting the brief, choosing what to explore next, and synthesizing strategy. It works through typed tools and schema-validated outputs, and it can never mint an ID or a score.

## 1. System overview

```
Browser (Next.js App Router, RSC + client islands)
  │  POST /api/runs  (brief)          ← NDJSON event stream (RunEvent)
  ▼
Run Orchestrator (Node runtime, Fluid Compute, maxDuration 300s)
  ├─ Budget guard (Qloo ≤40 calls, LLM ≤6 calls, wall clock ≤150s soft / 240s hard)
  ├─ Qloo Client ──► https://hackathon.api.qloo.com  (GET only, X-Api-Key)
  │     └─ Private cache (Postgres qloo_cache, TTL 7d)
  ├─ LLM (Vercel AI SDK → AI Gateway; structured outputs + typed tools)
  ├─ Evidence Ledger (in-memory → persisted with run)
  └─ Persistence (Neon Postgres: runs, qloo_cache)
  ▼
/r/[id]  report permalink (server-rendered from stored report)
```

## 2. Workflow (state machine)

| # | Node | Kind | Input → Output | Qloo calls | LLM calls |
|---|---|---|---|---|---|
| 0 | `validateBrief` | code (Zod) | `BriefInput` → `Brief` | 0 | 0 |
| 1 | `planResearch` | **LLM** (structured) | `Brief` → `ResearchPlan` (draft) → code clamps it to allowlists | 0 | 1 |
| 2 | `resolve` | code tools | names → `ResolvedRef[]` (entities, tags, audiences, locality) | ≤ 10 | 0 |
| 3 | `explore` | code (parallel, concurrency 4) | per category: **target** query + **baseline** query | ≤ 14 | 0 |
| 4 | `deepen` | **LLM** tool loop (1 round, ≤ 4 tool calls) | ledger digest → follow-up queries (bridges, taste tags, compare, explain) | ≤ 8 | 1 |
| 5 | `normalize` | code | raw responses → `EvidenceItem[]` (ledger) | 0 | 0 |
| 6 | `critique` | code | ledger → `Critique` (coverage, flags, lift, distinctiveness) | 0 | 0 |
| 7 | `strategize` | **LLM** (structured) | brief + critique + ledger digest → `StrategySet` | 0 | 1 |
| 8 | `validateClaims` | code | `StrategySet` × ledger → `ValidationReport` | 0 | 0 |
| 9 | `repair` | **LLM** (only if 8 fails) | violations → corrected `StrategySet`. Revalidate. Still failing → drop the claims. | 0 | ≤ 2 |
| 10 | `assembleReport` | code | → `Report`. Persisted. Numbers rendered from the ledger. | 0 | 0 |

**Hard limits per run:** Qloo ≤ **40** calls (cache hits are free); LLM ≤ **6** calls; total LLM output ≤ ~12k tokens; wall clock **150 s soft** (skip `deepen` and optional calls) and **240 s hard** (abort and return a partial report).

**Retries:** Qloo gets 1 retry on 429/5xx/timeout (honoring `Retry-After`, else a 1.5 s backoff). **0 retries on 400/401/403/404.** On 401 the whole run aborts and an operator alert is logged. LLM gets 1 retry on transport errors. Schema failures go to `repair`, not to a blind retry.

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

Parameter builder rules:
1. Each `filterType` has an **allowlist of params** taken from the Entity Type Parameter Guide. Unsupported params are dropped *before* the request, because Qloo would silently ignore them anyway.
2. Location params follow spike G4.
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

## 9. Streaming contract

```ts
type RunEvent =
  | { t: "run.started"; runId: string; budget: { qloo: number; llm: number } }
  | { t: "node.started" | "node.finished"; node: NodeName; ms?: number; summary?: string }
  | { t: "tool.call"; record: ToolCallRecord }              // key-free
  | { t: "evidence.added"; count: number; category: string }
  | { t: "plan.ready"; plan: ResearchPlanPublic }          // includes notModeled
  | { t: "warning"; code: string; message: string }
  | { t: "run.finished"; runId: string; status: "complete" | "partial" | "failed" };
```

`POST /api/runs` validates the brief, enforces rate limits, creates the `runs` row and returns `application/x-ndjson`. The client renders events and then routes to `/r/[id]`.

## 10. Persistence (justified)
Neon Postgres is used **only** because three must-haves need it:
1. Shareable report permalinks.
2. Featured example reports that load instantly during judging without spending quota.
3. A private server-side Qloo response cache, which is explicitly allowed and protects quota for 2 weeks of judging.

It's not used for auth, users or analytics.

```sql
create table runs (
  id text primary key, created_at timestamptz default now(),
  status text not null, brief jsonb not null, plan jsonb, report jsonb, trace jsonb,
  ip_hash text, featured boolean default false
);
create table qloo_cache (
  key text primary key, path text not null, params jsonb not null,
  status int not null, body jsonb not null, fetched_at timestamptz default now()
);
```

Rate limits: ≤ 5 new runs per IP-hash per day and a global daily cap (env var). Driver: `@neondatabase/serverless` with plain SQL (no ORM for 2 tables).

## 11. Stack decision

| Choice | Verdict | Reason |
|---|---|---|
| Next.js 16 (App Router) + React 19 + TS strict | ✅ | One deployable unit for UI, API and streaming. Vercel-native. |
| Tailwind CSS v4 | ✅ | Token-driven design system |
| shadcn/ui | ✅ **selectively** | Primitives only (Dialog/Sheet, Tabs, Tooltip, Popover, Form inputs), fully restyled. No stock dashboard blocks. |
| Geist Sans + Geist Mono | ✅ | Matches the Neo-Swiss/Vercel direction. Mono for IDs and the trace. |
| Vercel AI SDK (v7) + AI Gateway | ✅ | Structured outputs, tool calling and provider fallback. **AI SDK 7 APIs must be checked against `node_modules/ai/docs` in Phase 1**, not from memory. |
| Model | Default `anthropic/claude-sonnet-5-5` via the Gateway for plan, deepen and strategy. `claude-haiku-5-5` is optional for repair. | Strong structured output and reasoning. Decision for the user (cost and provider). |
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
lib/qloo/            (client, params allowlists, schemas, normalize)
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
