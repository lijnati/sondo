# Sondo

**Stop guessing what your audience loves.** Sondo is an autonomous cultural-intelligence strategist built for the Qloo Agentic Hackathon 2026. It turns a brand brief into evidence-backed campaign strategies, and every cultural claim traces to a specific Qloo result.

> Status: in development. The app shell (Phase 1) and the Qloo data layer (Phase 1b) are done. The research agent, live runs and reports are next (see [ROADMAP.md](ROADMAP.md)).

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

## Environment

| Variable | Required | Notes |
|---|---|---|
| `QLOO_API_KEY` | For Qloo calls | Server-only. Never logged; never sent to the browser |
| `QLOO_BASE_URL` | No | Defaults to `https://hackathon.api.qloo.com`; any other host is rejected |
| `AI_GATEWAY_API_KEY` | Phase 2 | LLM calls through the Vercel AI Gateway |
| `DATABASE_URL` | Phase 3 | Neon Postgres for permalinks and the private cache |

## Data and honesty rules

- **No Qloo response data is committed.** Test fixtures are synthetic (fictional names, fake IDs). The CLIs cache responses only in the gitignored `.qloo-cache/`. The probe summary contains statuses, counts and ranges only.
- Affinity is Qloo's per-query relevance score. It isn't a probability, an audience share, purchase intent or ROI. Sondo compares ranks within a query and never compares raw scores across queries.
- Missing Qloo fields stay missing. They are never filled with plausible values.

## Docs

[PRODUCT.md](PRODUCT.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [QLOO_RESEARCH.md](QLOO_RESEARCH.md) · [DESIGN.md](DESIGN.md) · [ROADMAP.md](ROADMAP.md) · [HACKATHON.md](HACKATHON.md)

## License

[MIT](LICENSE). Not affiliated with Qloo or any brand shown.
