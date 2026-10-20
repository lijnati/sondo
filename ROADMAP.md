# ROADMAP.md — Phase plan to submission

Today is **Tue 2026-10-20**. Hard deadline: **Fri Oct 30, 11:45 pm ET**. Internal submission target: **Thu Oct 29, 6:00 pm ET**. Oct 30 is a buffer with no feature work.
Order of investment: **Qloo integration → agent → app plumbing → design → hardening → submission.** A deployed URL exists from Phase 1 onward.

| Phase | Dates | Theme | Exit gate |
|---|---|---|---|
| 0 | Oct 15–17 | Research, feasibility, architecture | 7 docs plus a runnable spike ✅. Live spike passed G1–G2 on Oct 17 ✅. |
| 1 | Oct 17 | Foundations: app shell | Scaffold, design system, marketing and product shells, env validation, test tooling. Lint, typecheck, test and build green. |
| 1b | Oct 17 | Qloo data layer | Typed Qloo tools tested ✅. Live probe: 12/13 capabilities verified ✅. Neon deferred to Phase 3 (not needed yet). Public repo and deploy await approval. |
| 2 | Oct 17–19 | Agent workflow | ✅ Closed Oct 19. Live `pnpm eval` on 5 briefs with the free model: 4/4 completed, brief 5 degraded to an explained partial, 0 invalid citations, 0 unsupported evidence claims, all budgets held (see Phase 2 results). Phase 3 awaits approval. |
| 3 | Oct 19 | App integration | ✅ Built and verified locally Oct 19 against live Qloo, the live model and Neon: brief → live stream → persisted report permalink, 3 verified featured reports. Production deploy awaits approval (see Phase 3 results). |
| 4 | Oct 20 | Product design and UX | ✅ Built and verified Oct 20 (see Phase 4 results). Light-only by founder decision. Phase 5 awaits approval. |
| 5 | Oct 27–28 | Hardening and verification | E2E green. Failure injection handled. Quota protections verified. |
| 6 | Oct 29 | Documentation and submission | Devpost submitted, with the checklist in HACKATHON.md §8 complete |

---

## Phase 1: Foundations, app shell (Oct 17)
*Split decided 2026-10-17: the shell ships first; the Qloo data layer, Neon and deploy follow as Phase 1b.*

**Deliverables:** Next.js 16 scaffold (pnpm, TS strict, Tailwind v4 tokens from DESIGN.md §2, Geist), restyled shadcn primitives, `/` placeholder landing, `/new` composer shell, `/r/[id]` report skeleton plus not-found, error boundaries, Zod-validated server env, contract types from ARCHITECTURE.md §3–4 and §9, Vitest and Playwright smoke tests, `git init` and MIT `LICENSE`.
**Done when:** lint, typecheck, test, build and e2e are green, and the pages have been checked in a browser at 375 and 1280.

## Phase 1b: Qloo data layer (Oct 18)
The remaining items below, minus what Phase 1 already delivered (scaffold, spike, §9 results).

**Objective:** prove the Qloo integration live and build the typed, tested data layer everything else depends on.

**Deliverables**
- Git repo initialized and pushed to a **public** GitHub repo. MIT `LICENSE` detected in About.
- Live spike run. `spike/output/feasibility-summary.json` committed. QLOO_RESEARCH.md §9 results filled in, with every ❓ resolved to 🧪 or ❌.
- Next.js 16 app scaffold (TS strict, Tailwind v4, Geist, ESLint), deployed to Vercel (placeholder page). Env vars set in Vercel.
- Neon provisioned (Vercel Marketplace). `runs` and `qloo_cache` tables created.
- `lib/qloo/`: client (timeout, retry policy, cache, budget counter, ToolCallRecord), per-type **param allowlists**, Zod response schemas derived from live shapes, `normalize()` → `EvidenceItem`, and a capability probe (urn:tag, demographics, compare, audiences).
- `scripts/explore.ts` CLI: brief JSON → resolve + explore → prints a ledger summary.
- Vitest unit tests for the param builder, normalize, lift/quadrant math, budget guard and the cache key (synthetic fixtures only).

**Dependencies:** **Qloo API key (blocker)**, GitHub account, Vercel account, AI Gateway key (needed by Phase 2).
**Risks:** the key arrives late; `query.affinity` is absent (G2 fallback: rank-based evidence); location is ignored for non-place types (G4 fallback).
**Verification:** a live spike summary with no 401/403 on core paths; `pnpm test` green; the deployed URL returns 200; a CLI run on 2 briefs prints non-empty evidence across ≥ 4 categories.
**Done when:** G1 and G2 pass live, the data layer is merged with tests, and production deploy works.

## Phase 2: Agent workflow (Oct 19–21)
**Objective:** a complete, bounded and auditable agent that turns a brief into a validated `Report` JSON.

**Deliverables**
- `lib/agent/` nodes 0–10 (ARCHITECTURE.md §2), budget guard, RunEvent emitter, and prompts with structured outputs via AI SDK 7 and the AI Gateway (APIs verified from installed docs).
- `validateClaims()` with all 7 rules, plus `repair` and the drop logic.
- **Evaluation set: 5 fixed briefs** in `evals/briefs/*.json`:
  1. Fictional oat-milk cold brew, ages 25–34, Austin, launch. Anchors are a real indie artist, a TV show and an outdoor brand.
  2. Fictional boutique hotel, ages 35–44, Lisbon, market entry.
  3. Fictional running DTC, ages 24 and under, London, awareness.
  4. A real, well-known challenger beverage brand in Los Angeles (brand-resolves path).
  5. Edge case: unknown brand, no anchors, a low-density market (expected: ask for anchors, or a partial report).
- `pnpm eval` runs all briefs live and writes **metrics only** (not payloads): citation validity, dropped claims, overlap, calls used, latency.

**Dependencies:** Phase 1 data layer, LLM key.
**Risks:** LLM citations drift (mitigated by the validator and repair); strategies come out generic (mitigated by critique flags and distinct-category rules); latency (parallel explore, skipping deepen under time pressure).
**Verification:** eval metrics meet PRODUCT.md §8: 0 invalid citations in final output, overlap ≤ 30%, ≤ 40 Qloo / ≤ 6 LLM calls, p50 ≤ 90 s. Brief 5 degrades gracefully. Unit tests for the validator using adversarial synthetic strategies.
**Done when:** 4 of 5 briefs produce complete validated reports, brief 5 degrades correctly, and all budgets hold.

### Phase 2 results (closed 2026-10-19)
*As built, the briefs live in `scripts/briefs/` (not `evals/briefs/`). Brief 3 is the fictional sneaker launch in New York City (`sneakers-nyc`), which replaced the London running brand. Brief 4 is Liquid Death in Los Angeles (`liquid-death-la`, no anchors). Brief 5 is a fictional pickle maker in Pierre, South Dakota, with no anchors and no ages (`unknown-brand`). Budgets are the tighter `lib/agent/budget.ts` limits (Qloo 24, model 4, 180 s hard), not the 40/6 above.*

**Final live eval** (`pnpm eval`, live Qloo with no cache, `nvidia/nemotron-3.5-lightning-free`, run sequentially; metrics in `scripts/output/eval-summary.json`):

| Brief | Expect | Status | Concepts grounded | Evidence / hypothesis claims | Citations (invalid) | Mismatches dropped | Max overlap | Qloo | Model | Time |
|---|---|---|---|---|---|---|---|---|---|---|
| coldbrew-austin | complete | completed ✅ | 3/3 | 9 / 0 | 27 (0) | 0 | 0.17 | 16/24 | 4/4 | 99 s |
| hotel-lisbon | complete | completed ✅ | 3/3 | 8 / 1 | 41 (0) | 3 | 0.18 | 17/24 | 4/4 (repair call failed) | 110 s |
| sneakers-nyc | complete | completed ✅ | 3/3 | 11 / 0 | 27 (0) | 0 | 0.14 | 20/24 | 4/4 | 110 s |
| liquid-death-la | complete | completed ✅ | 3/3 | 9 / 0 | 30 (0) | 1 | 0.20 | 12/24 | 3/4 (repair call failed) | 95 s |
| unknown-brand | degrade | partial ✅ | 0/3 (3 partial) | 9 / 0 | 18 (0) | 0 | 0.00 | 9/24 | 4/4 | 75 s |

Totals: 0 invalid citations, 0 mismatched citations left in output, 0 evidence claims without a relevant citation (all re-checked by `lib/agent/eval-metrics.ts` from each run's own ledger), 4 mismatched citations dropped, every budget held, estimated model cost $0 (free model), p50 99 s and max 110 s.

**What changed to get there**
- Citation relevance (`lib/agent/relevance.ts`, ARCHITECTURE.md §7 rule 8). Mismatched citations are dropped, an evidence claim with no direct or contextual citation is downgraded to a hypothesis, and grounding counts only relevant citations.
- The first full eval scored 2/4. Hotel-lisbon failed because the strategy call failed on the free model and the retry used up the repair call. It completed on both reruns, so this was model flakiness, not a code fault. Liquid-death-la failed twice for a real reason: the model writes `E#` ids into prose ("(E11)"), and the number rule withheld whole insights as invented statistics. Inline `E#` references are now stripped before validation (regression test added), and the next full eval scored 4/4.

**Known limitations (honest)**
- The free model is flaky: its repair call failed on 2 of 5 final runs (`AI_ToolChoiceViolationError`). Deterministic fixes still produced validated output, but a single run can come back `partial`. One clean eval run is evidence, not a stability guarantee.
- p50 latency is 99 s, above PRODUCT.md §8's 90 s target (well within the 180 s hard limit).
- In the first eval, unknown-brand had a concept overlap of 0.33, above the 0.30 target. The overlap is flagged for repair but not enforced after repair. The final run's overlap was 0.00.
- Relevance is a deterministic consistency check (names, tags, category words), not fact-checking.

## Phase 3: App integration (Oct 22–24)
**Objective:** the full flow works in production with real data, even before the polish.

**Deliverables**
- `POST /api/runs`: brief validation, rate limit (5/IP/day plus a global cap), NDJSON stream of RunEvents, `waitUntil` persistence.
- `/new` brief composer (functional, using design tokens). `/r/[id]` running state plus report tabs (functional layout). Evidence drawer (basic).
- 3 featured example runs generated in production and marked `featured`. They load from the DB with zero Qloo calls.
- "Featured-only" kill switch (env flag) for quota emergencies.

**Dependencies:** Phase 2 agent, Neon.
**Risks:** streaming quirks on Vercel (test on a preview early); a function timeout (the hard 240 s abort is already in place).
**Verification:** a manual end-to-end on the production URL from a clean browser; reloading mid-run recovers; the permalink renders server-side; the kill switch works.
**Done when:** a judge-like user can run a new brief and share the permalink in production.

### Phase 3 results (2026-10-19)
*Authorized and built Oct 19, ahead of the Oct 22–24 slot. Verified locally (`pnpm build && pnpm start`) against live Qloo, the live free model and the project's Neon database. Not yet deployed: that needs approval.*

**What exists**
- `/new`: a working brief form on the existing `Brief` schema (client and server Zod, plain-English messages shared by both), three one-click example briefs, a live "How Sondo will read this" rail, duplicate-submit protection (disabled button plus `Idempotency-Key`), and rate-limit, paused, unavailable and network-error states.
- `POST /api/runs` streams NDJSON public events while the real `runAgent()` runs under `after()`. Plus `GET /api/runs/[id]?after=` (resume or poll) and `POST /api/runs/[id]/cancel`. Behaviour on disconnect, refresh, stream loss, cancel, deadline and a killed function is in ARCHITECTURE.md §9.
- Live research view: stage timeline, research plan, Qloo activity (queries of 24, cached, failed), evidence per category, adaptive decisions and warnings. Everything comes from real events; there are no percentages and no model "thoughts". `aria-live` announces stage changes.
- `/r/[id]`: a server-rendered stored report. It has status, brief, modeled and not-modeled signals, three concepts, every claim badged Directly supported / Contextual support / Hypothesis, `E#` chips opening an evidence drawer, code-written findings, the evidence ledger, validation counts, limitations, run details and the Qloo trace, and a copy-link share button. Running, partial, failed, cancelled and interrupted states are covered. Unknown or malformed ids return a **real HTTP 404** (`proxy.ts`).
- Neon: `runs`, `run_events` and `qloo_cache` (additive migration `0001_runs.sql`, applied). Atomic status transitions, an integrity gate before `completed`, rate limits under an advisory lock, a kill switch (`SONDO_LIVE_RUNS=off`) and a private Qloo cache capped at 2 s per operation.
- Featured reports on `/` and `/new`, read from the database (zero Qloo calls). `pnpm featured` only features runs stored as `completed`.

**Verification**
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest, 254 tests including in-process Postgres via PGlite) and `pnpm build`: green.
- `pnpm e2e` with `E2E_LIVE=1`: 29 passed, 1 skipped (the live test runs on desktop only). This includes real 404 status checks, form validation, the featured report and drawer, no overflow at 375 and 1280, and a **live brief → report run through the UI** (2.5 min, stored `partial`, labelled honestly).
- `curl`: `/r/zzzzzzzzzzzz`, `/r/does-not-exist` and `/r/missing` return 404; invalid briefs return 400 with field messages.
- Browser QA at 375 and 1280 using Playwright Chromium screenshots (the Chrome extension disconnected): form, validation errors, example prefill, report, partial report, interrupted run, featured cards and not-found. The meadow theme is light-only by design, so dark mode keeps the light pages (asserted in e2e).

**Featured reports (live, verified `completed`)**
| Rank | Brief | Run | Evidence | Categories | Attempts |
|---|---|---|---|---|---|
| 1 | sneakers-nyc (Stride Loop) | `VTuxwl03jMKD` | 106 | 6 | 2 (first stored `partial`, not featured) |
| 2 | coldbrew-austin (Oat Hour) | `DseEb2AHvHWh` | 94 | 6 | 3 (two `partial`, not featured) |
| 3 | hotel-lisbon (Casa Azulejo) | `3KZLO3daGGPB` | 93 | 4 | 1 |

**Live outcomes, honestly:** 9 live runs in total. 4 completed, 4 partial (the free model's concepts were only partly grounded; each is stored and labelled partial with the reason), and 1 interrupted. That one was a web run whose final write hit transient network failures to Neon twice. The fix is backoff on the final write (four attempts over about 6 s, tested) and the 2 s cache cap. Even the 3 featured reports took 6 runs to get. The free model is the main source of partials.

**Known limitations and open items**
- **Deployment blockers (need approval):** push to GitHub, create the Vercel project, set env vars (`QLOO_API_KEY`, `AI_GATEWAY_API_KEY`, `DATABASE_URL`, `SONDO_IP_HASH_SECRET`, optional caps), set a spending budget on the AI Gateway key, and set the function region to `fra1` to sit next to Neon (eu-central-1). Reports are 0.5–0.8 MB of JSON, and over a WAN link a report read took 2–26 s locally.
- The free model makes `partial` common (about half of live runs here). A stronger `SONDO_MODEL` is the lever. That is a product decision, not a code change.
- Report pages ship the whole ledger table. Trimming the payload or paginating it is Phase 4 or 5 work.
- The evidence drawer, charts (lift and distinctiveness) and the comparison table from DESIGN.md §4.5–4.6 are Phase 4.

**Phase 4 readiness:** ready. The report JSON schema is frozen as the `StoredReport` Zod schema (`lib/db/report-schema.ts`). Every state that Phase 4 designs exists with real data in the database: complete, partial, interrupted, not found and running.

## Phase 4: Product design and UX (Oct 24–27)
**Objective:** a complete, coherent, premium product experience (the Design criterion).

**Deliverables:** landing page (DESIGN.md §4.1), polished composer, live research timeline and trace, report Overview/Signals/Strategies/Evidence, lift and distinctiveness SVG charts with table fallbacks, comparison table, all states from DESIGN.md §5, responsive at 375–1536, dark mode, reduced motion.
**Dependencies:** stable Report JSON (freeze the schema at the start of Phase 4).
**Risks:** polish eats into the time for hardening, so Phase 4 is timeboxed and P1 polish items move to a post-submission list.
**Verification:** the design QA checklist (DESIGN.md §7); a Lighthouse a11y score ≥ 95 on the landing and report pages; real runs show empty and partial states.
**Done when:** the checklist passes and featured reports are screenshot-ready.

### Phase 4 results (2026-10-20)
*Authorized 2026-10-20 and built the same day, ahead of the Oct 24–27 slot, on branch `phase-4-design`. Checked locally against the Neon database and one live run. Not deployed.*

**What changed**
- **One design system.** `app/meadow.css` holds every Pixel Meadow token, plus type, buttons, states and motion. Page CSS uses tokens only. The Swiss-era tokens and unused shadcn wrappers are gone (`@radix-ui/react-label`, `@radix-ui/react-slot` and `class-variance-authority` were removed).
- **Light-only.** A "night meadow" dark theme was built and then removed at the founder's request (it looked worse than the light design).
- **Hydration fixed.** Reveals are now CSS (load animations plus scroll-driven `animation-timeline: view()`). The JS observer that mutated server-rendered nodes is gone. The live view's clock starts after mount. That was a Phase 3 bug that showed as a hydration error on `/r/[id]` while a run was in progress.
- **Report (`/r/[id]`):**
  - a cover with a seeded meadow per run, a status and grounding row, and a sticky section nav;
  - key findings from `keyFindings()`;
  - a concept tablist with editorial articles and an evidence rail;
  - three visible evidence tiers (direct, contextual, hypothesis or creative);
  - SVG lift and distinctiveness charts with table fallbacks;
  - findings grouped by strength;
  - a ledger with CSS-only filter and show-all;
  - a restyled drawer that returns focus to its chip;
  - "Not written" placeholders, a no-report page that shows the stages reached, and a matching skeleton.
  - Mobile height for a featured report went from 10,500 px to 9,900 px, and desktop to 6,500 px, while adding charts and navigation.
- **Live view:** a staged timeline, a feed of the real Qloo queries (`summarizeRun().recentQloo`), 24 budget cells labelled as a budget, evidence bars, and the plan and validation cards. No percentages and no model text.
- **Composer (`/new`):**
  - the form comes first, in five numbered sections with "why Sondo asks" lines;
  - optional fields are marked, and Constraints is collapsed;
  - an error summary links to each invalid field;
  - the rail has a "Needed to start" checklist.
  - The `Brief` contract is unchanged.
- **Landing:** the illustrative mocks ("example data") are replaced with real excerpts of the top featured report, read in SQL by `featuredExcerpt()`. Featured cards now show the top code-written finding and the three concept names.

**Verification**
- `pnpm typecheck`, `pnpm lint` and `pnpm test` pass: 260 tests, including new ones for `keyFindings`, `liftRows`, `distinctivenessPoints`, `recentQloo`, the featured card's top finding and `featuredExcerpt`.
- `pnpm e2e` on the production build:
  - **First run:** 24 passed, 4 failed. The failures were two real defects: drawer focus not returned, and error messages duplicated by the new summary. Both are fixed.
  - **Rerun:** 27 passed, 2 skipped (the live test is opt-in), and 1 timeout. The overflow smoke test hit its 30 s budget across three cold page loads on this memory-starved machine.
  - **Repeat** (`--repeat-each 2` on smoke.spec): the overflow test passed 2/2. One first-request URL wait (5 s, `/new` on a cold server reading Neon over the WAN) missed once, then passed. Treat both as timing flakes to harden in Phase 5. The suite gained coverage for concept-tab keyboard use, drawer focus return, the ledger filter and show-all, and the chart table fallback.
- Browser QA with Playwright Chromium at 375, 768, 1280 and 1440: landing, `/new`, a completed report, a partial report, an interrupted run, the 404 and the live view. There was no horizontal overflow, and no console or hydration errors on `/` or `/new`.
- **One live run** through the UI (Cold brew · Austin, `4Y1pIpewUFu9`): 21 of 24 Qloo queries, 114 results across 6 categories. It was stored **partial** after 177 s ("fewer than three grounded concepts"), and the live view showed every stage, query and count from real events.

**Regressions found and fixed:**
- the drawer did not return focus to its chip;
- the live clock caused a hydration error;
- the scatter crowded every point near popularity 1, so the axis is now stretched toward 1 with labelled ticks;
- the raw category key "taste" showed in grounding lines;
- after the error summary was added, error messages were duplicated.

**Remaining UI limitations**
- Reports still ship the whole ledger as HTML (0.5–0.8 MB of JSON is read server-side). The first 12 rows show and the rest is hidden by CSS.
- On mobile, the concept tab names truncate in a horizontally scrolling row.
- Scroll-driven reveals reverse when scrolling up, which is by design. Full-page screenshots taken from the top show those sections blank.
- No Lighthouse run yet (Phase 5).

**Phase 5 readiness:** ready. Open items for Phase 5: the production deploy (still awaiting approval), smoke tests against production, failure injection, and the free model's high partial rate (still the main quality lever).

## Phase 5: Hardening and verification (Oct 27–28)
**Objective:** nothing breaks during two weeks of unattended judging.

**Deliverables:** 3 Playwright smoke tests against production; failure-injection tests (forced 429, 403 on optional endpoints, LLM schema failure, timeout); re-run `pnpm eval`; a secrets scan of the git history; a check that no Qloo payloads are in the repo; a cache warm-up of the featured briefs; a Qloo quota-increase request sent via Discord #api-help with details.
**Verification:** all tests green; every injected failure produces the documented UX; the eval metrics still pass.
**Done when:** a cold production visitor on mobile and desktop can complete the flow, and every failure path ends in a designed state.

## Phase 6: Documentation and submission (Oct 29)
**Deliverables:** README (problem, Qloo-powered explanation, architecture diagram, endpoints used, run instructions, env, limitations, mapping to the criteria), Devpost description, screenshots, optional 2-min video, testing instructions ("no login"), then **submit by 6:00 pm ET**. Run the HACKATHON.md §8 checklist.
**Done when:** the Devpost confirmation is captured. Oct 30 is reserved for emergencies only.

---

## Top risks (cross-phase)
| Risk | Impact | Mitigation |
|---|---|---|
| Qloo key not issued in time | Blocks everything live | Request today. Escalate in Discord by Oct 17. Meanwhile build only key-independent pieces (scaffold, deploy, UI shell, validator with synthetic data). |
| `query.affinity` absent or unusable | Weaker evidence display and distinctiveness | Rank-based evidence plus popularity (designed in from the start) |
| Audience and location signals ignored for some types | Weaker audience lift | Scope claims to verified combinations. The capability probe drives behavior. |
| Quota exhaustion during judging | Dead demo | Cache, featured reports, rate limits, kill switch, quota-increase request |
| LLM produces generic or unsupported claims | Credibility | Evidence-locked schema, validator, repair and drop, critique flags |

## Decisions needed (from the founder)
1. **Qloo API key:** has the hackathon key form been submitted, and when? (blocker)
2. **Eligibility:** confirm your country or region isn't excluded (HACKATHON.md §2).
3. **LLM:** approve the Vercel AI Gateway with `anthropic/claude-sonnet-5-5` and a spend cap.
4. **Persistence:** approve Neon Postgres (Vercel Marketplace) for permalinks, featured reports and the private cache.
5. **Repo and license:** GitHub owner/repo name, MIT license, and the copyright holder name.
6. **Featured examples:** approve fictional brands with real cultural anchors.
7. **Team:** solo or team? The plan assumes one builder plus the agent.
