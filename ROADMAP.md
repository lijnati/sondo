# ROADMAP.md — Phase plan to submission

Today is **Thu 2026-10-15**. Hard deadline: **Fri Oct 30, 11:45 pm ET**. Internal submission target: **Thu Oct 29, 6:00 pm ET**. Oct 30 is a buffer with no feature work.
Order of investment: **Qloo integration → agent → app plumbing → design → hardening → submission.** A deployed URL exists from Phase 1 onward.

| Phase | Dates | Theme | Exit gate |
|---|---|---|---|
| 0 | Oct 15–17 | Research, feasibility, architecture | 7 docs plus a runnable spike ✅. Live spike passed G1–G2 on Oct 17 ✅. |
| 1 | Oct 17 | Foundations: app shell | Scaffold, design system, marketing and product shells, env validation, test tooling. Lint, typecheck, test and build green. |
| 1b | Oct 18 | Qloo data layer | Typed Qloo tools tested. Neon provisioned. Public repo. Hello-world deployed. |
| 2 | Oct 19–21 | Agent workflow | 5 eval briefs produce validated reports via the CLI within budget |
| 3 | Oct 22–24 | App integration | End-to-end in production: brief → live stream → persisted report permalink |
| 4 | Oct 24–27 | Product design and UX | All pages and states designed. Featured reports look launch-ready. |
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

## Phase 4: Product design and UX (Oct 24–27)
**Objective:** a complete, coherent, premium product experience (the Design criterion).

**Deliverables:** landing page (DESIGN.md §4.1), polished composer, live research timeline and trace, report Overview/Signals/Strategies/Evidence, lift and distinctiveness SVG charts with table fallbacks, comparison table, all states from DESIGN.md §5, responsive at 375–1536, dark mode, reduced motion.
**Dependencies:** stable Report JSON (freeze the schema at the start of Phase 4).
**Risks:** polish eats into the time for hardening, so Phase 4 is timeboxed and P1 polish items move to a post-submission list.
**Verification:** the design QA checklist (DESIGN.md §7); a Lighthouse a11y score ≥ 95 on the landing and report pages; real runs show empty and partial states.
**Done when:** the checklist passes and featured reports are screenshot-ready.

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
