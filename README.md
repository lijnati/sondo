# Sondo

**Stop guessing what your audience loves.** Sondo is an autonomous cultural-intelligence strategist built for the Qloo Agentic Hackathon 2026. It turns a brand brief into evidence-backed campaign strategies, and every cultural claim traces to a specific Qloo result.

> Status: in development. The app shell (Phase 1), the Qloo data layer (Phase 1b) and the agent engine (Phase 2, CLI only) are built. The web flow and reports are next (see [ROADMAP.md](ROADMAP.md)).

## What makes it Qloo-powered

Sondo's evidence comes only from Qloo's cultural graph, through a typed, budgeted data layer (`lib/qloo/`):

| Qloo endpoint | Used for |
|---|---|
| `GET /search` | Resolve brand and cultural-anchor names to Qloo entities (with match confidence) |
| `GET /v2/insights` (entity types) | Cross-category affinity: artists, film, TV, podcasts, books, brands and places for an audience |
| `GET /v2/insights` `filter.type=urn:tag` | Taste analysis: the cultural themes behind a signal set |
| `GET /v2/insights` `filter.type=urn:demographics` | Relative age and gender affinity of anchors |
| `GET /v2/tags`, `/v2/audiences`, `/v2/audiences/types` | Valid tag and audience IDs for signals |
| `GET /v2/analysis/compare` | Experimental only (score undocumented) |

**Audience lift** runs each category twice: once with audience signals and once as a location baseline. Comparing the two shows what over-indexes for *this* audience. Lift and the distinctiveness quadrant are labelled Sondo heuristics. The capabilities above were verified live; see [QLOO_RESEARCH.md §10](QLOO_RESEARCH.md).

## How the agent works

`lib/agent/` runs a bounded, auditable workflow. Code owns control flow, IDs, numbers and budgets; the model is used only where judgement helps.

1. **Plan** (model, then a code clamp): the brief's ages, gender, market and anchors stay authoritative.
2. **Research** (code): resolve anchors (trusted matches only), then a target and a market-baseline query per category, taste themes and anchor demographics.
3. **Adapt** (evidence-dependent): the model proposes follow-ups from a fixed tool menu (explore a category, niche lens, bridge from an `E#`, taste themes, stop). A dispatcher validates each proposal before it runs. A second, rule-based round reacts to what is still weak.
4. **Evaluate** (code): findings (`F#`) for audience lift, distinctiveness, cross-category intersections, conflicts and gaps, each citing ledger `E#`.
5. **Strategize** (model): three concepts with different angles. **Validation** (code) checks every `E#`, blocks invented numbers and performance claims, requires citations for named entities, downgrades unsupported claims to labelled hypotheses, and enforces differentiation. One repair call is allowed.

Limits per run: 24 Qloo calls, 4 model calls, 2 adaptive rounds, 180 s. One cancel signal reaches every request.

## Getting started

Requirements: Node ≥ 23.6 and pnpm 11.

```bash
pnpm install
cp .env.example .env.local   # add QLOO_API_KEY (hackathon key; hackathon host only)
pnpm dev                     # http://localhost:3000
```

The app shell runs without any credentials.

| Script | What it does |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js 16 app |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | ESLint, TypeScript strict (`next typegen` first), Vitest |
| `pnpm e2e` | Playwright smoke tests at 1280 and 375 (builds and serves on :3100) |
| `pnpm probe` | Live Qloo capability probe (~28 calls). Writes a sanitized summary to `scripts/output/` |
| `pnpm explore <scenario> [--depth 1] [--save]` | Bounded live research for `scripts/scenarios/*.json` (≤ 40 calls). Console output only |
| `pnpm agent <brief> [--json] [--no-model]` | Run the agent on `scripts/briefs/*.json`. `--no-model` runs the Qloo research without a model key |
| `pnpm model:smoke` | Check that the configured gateway model supports structured output and tool calls |

## Environment

| Variable | Required | Notes |
|---|---|---|
| `QLOO_API_KEY` | For Qloo calls | Server-only. Never logged; never sent to the browser |
| `QLOO_BASE_URL` | No | Defaults to `https://hackathon.api.qloo.com`; any other host is rejected |
| `AI_GATEWAY_API_KEY` | For the agent | LLM calls through the Vercel AI Gateway (needed even for $0 models). Set a spending budget on the key |
| `SONDO_MODEL` | No | Gateway model id. Default `nvidia/nemotron-3.5-lightning-free` ($0) |
| `SONDO_RUN_COST_LIMIT_USD` | No | Per-run estimated cost limit (default 0.15). An estimate, not a billing cap |
| `DATABASE_URL` | Phase 3 | Neon Postgres for permalinks and the private cache |

## Data and honesty rules

- **No Qloo response data is committed.** Test fixtures are synthetic (fictional names, fake IDs). The CLIs cache responses only in the gitignored `.qloo-cache/`. The probe summary contains statuses, counts and ranges only.
- Affinity is Qloo's per-query relevance score. It isn't a probability, an audience share, purchase intent or ROI. Sondo compares ranks within a query and never compares raw scores across queries.
- Missing Qloo fields stay missing. They are never filled with plausible values.

## Docs

[PRODUCT.md](PRODUCT.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [QLOO_RESEARCH.md](QLOO_RESEARCH.md) · [DESIGN.md](DESIGN.md) · [ROADMAP.md](ROADMAP.md) · [HACKATHON.md](HACKATHON.md)

## License

[MIT](LICENSE). Not affiliated with Qloo or any brand shown.
