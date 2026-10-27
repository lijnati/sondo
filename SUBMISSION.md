# Sondo: Devpost submission

**Project name:** Sondo

**Tagline:** Stop guessing what your audience loves. An AI strategist that turns a brand brief into campaign concepts where every cultural claim traces to a Qloo result.

**Try it:** https://sondo.xylolabs.space (no login)
**Code:** https://github.com/lijnati/sondo (MIT)

---

## Problem

Brand marketers and agency strategists choose cultural partners (artists, shows, podcasts, venues, co-brands) for launches and campaigns. Without an insights team, they do it by gut feel, trend-chasing or slow, expensive panels. LLM copilots haven't fixed this. They produce fluent, confident lists drawn from training-data stereotypes, with no evidence and no sense of how *this* audience differs from everyone else. Teams end up on the same mainstream picks as their competitors, with nothing to defend the choice in a client meeting.

## Solution

Sondo is an autonomous research agent. You give it a brief: brand, audience, market, objective and optionally a few things the audience is known to love. It researches Qloo's taste graph live and returns a report with three differentiated campaign concepts (mainstream anchor, distinctive niche, cross-category bridge). Each claim is marked by its evidence tier:

- **Directly supported:** the sentence names the Qloo result it cites.
- **Contextual support:** the citation is related (same category or taste theme).
- **Hypothesis / creative idea:** strategic judgement, visibly different, never dressed up as a finding.

Every `E#` chip opens the underlying Qloo result: category, rank within its query, popularity, tags, and which query produced it. The report also shows what Sondo could and couldn't model from the brief, code-written key findings, lift and distinctiveness charts, the full evidence ledger, and the key-free Qloo tool trace.

## How Qloo is used

All research goes through a typed, allowlisted, budgeted client for `hackathon.api.qloo.com`:

- **`/search`** resolves the brand and anchors to Qloo entities. Only trusted matches seed research; a fictional brand is reported as "not in Qloo" rather than guessed.
- **`/v2/insights` across entity types** (artists, TV, film, podcasts, books, brands, places). Each category is queried **twice**: once with the audience's signals (age buckets, gender if stated, anchors, market) and once as a **market baseline**. Comparing the ranks gives **audience lift**: what over-indexes for this audience rather than for everyone in the city.
- **`/v2/insights` with `filter.type=urn:tag`** returns the taste themes behind the signal set.
- **`/v2/insights` with `filter.type=urn:demographics`** gives the age and gender affinity of the anchors.
- **Popularity × in-query rank** gives a **distinctiveness** map: strong-fit entities that aren't mainstream.
- **Cross-domain bridges:** the agent can take a strong result in one category (say, a brand) and use it as a seed for another (podcasts), following Qloo's cross-category graph.

Lift and distinctiveness are labelled as Sondo heuristics. Qloo affinity is never presented as purchase intent, audience share or ROI.

**Why this needs Qloo:** without it, Sondo has no ledger, so there's nothing to cite, no baseline to compare against and no lift. The validator would downgrade every claim to a hypothesis. The product only works because the evidence comes from Qloo.

## Technical architecture

Next.js 16 (App Router, Node runtime) on Vercel, Neon Postgres, Vercel AI Gateway, and the Qloo hackathon API. The agent is a bounded state machine in `lib/agent/`:

1. **Plan (model, then a code clamp):** turns the brief into categories and questions. The brief's ages, market and anchors stay authoritative, and anything Qloo can't model (income, values) is listed as *not modeled*.
2. **Research (code):** resolves anchors, then runs target and baseline queries per category, taste themes and anchor demographics.
3. **Adapt (up to 2 rounds):** the model proposes follow-ups from a fixed tool menu (explore a category, a niche lens, bridge from an `E#`, taste themes, stop). Code validates each proposal against the ledger and budget before it runs, and rejects unknown tools or ids.
4. **Critique (code):** writes findings (`F#`) for lift, distinctiveness, cross-category intersections, conflicts and gaps.
5. **Strategize (model):** writes three concepts that may cite only `E#` ids from the ledger.
6. **Validate (code):**
   - every citation must exist and must relate to the sentence citing it;
   - evidence claims without a relevant citation become hypotheses;
   - invented numbers and performance claims are removed;
   - concepts must differ.
   One repair call is allowed.
7. **Integrity gate:** a run is stored `completed` only if all three concepts are grounded (≥ 3 relevant citations across ≥ 2 categories) and the stored report re-validates. Otherwise it's `partial`, `failed`, `cancelled` or `interrupted`, with the reason shown.

**Guardrails per run:** 24 Qloo calls, 4 model calls, 2 adaptive rounds, a 180 s hard limit, Qloo concurrency 3, and an estimated cost cap.

**Runs survive the client leaving.** A run executes under `after()`, streams public events as NDJSON, persists every event, and resumes on reload. Public events never include Qloo params, ids, error text or model-written reasoning.

**Abuse limits:** per-IP daily limit (stored as an HMAC, never the raw IP), a global daily cap, a concurrency cap, idempotent submits, and a kill switch that serves featured reports only.

## Key features (all live)

- Brief composer with plain-English validation and three one-click example briefs.
- A live research view: stage timeline, the real Qloo queries as they run, the budget used, evidence per category, adaptive decisions. No fake progress bars and no model "thoughts".
- Persistent, shareable report permalinks (`/r/{id}`), rendered server-side. Unknown ids return a real 404.
- Three evidence tiers, an evidence drawer, lift and distinctiveness SVG charts with table fallbacks, a filterable evidence ledger, and the Qloo trace.
- Honest statuses: partial and interrupted runs are labelled as such, with the reason.
- Three featured reports from real completed runs, loaded from the database with zero Qloo calls.

## What makes it innovative

- **Evidence-locked generation.** The model never writes ids, scores or numbers. It references `E#`, and code renders every number from parsed Qloo responses.
- **Citation relevance, not just citation validity.** A real `E#` that doesn't relate to its sentence is dropped. An evidence claim left without a relevant citation is shown as a hypothesis.
- **Audience-vs-baseline lift on Qloo.** Paired queries reveal what's distinctive for this audience, which a single affinity list can't show.
- **Bounded agency with visible decisions.** The model chooses research moves from a typed menu, code checks each one, and the report shows every decision and its outcome.

## Potential impact

- **Who:** brand and growth marketers at DTC, CPG and hospitality brands without insights teams, and agency strategists preparing a first-pass cultural brief before a client workshop.
- **Use cases:** choosing launch partners in a new city, picking a podcast or creator category for a sponsorship test, finding a non-obvious co-brand, and building a defensible creative territory for a pitch.
- **Why it's credible:** each recommendation comes with its evidence and a "how to validate" test plan. Teams can take the concepts into a small, cheap test instead of a large bet. Sondo doesn't claim to predict sales.

## Challenges

- **Free-model reliability.** The $0 model sometimes answers in prose instead of submitting structured output, or times out. We added structured output via a forced tool call, a compact-digest retry for the strategy step that runs only when the deadline allows, deterministic fixes when repair fails, and best-of selection between draft and repair. All of these use the same validator.
- **Models cite the wrong thing.** Early runs had real `E#` ids attached to unrelated sentences. We built a deterministic relevance check (names, tags, category words) and a downgrade-to-hypothesis rule.
- **Inline ids and numbers.** The model wrote "(E11)" into prose, and the number rule withheld whole insights. Ids are now stripped before validation, with a regression test.
- **Unsupported params return 200.** Qloo silently ignores params it doesn't support, so every param is checked against a per-type allowlist in code, verified by a live probe.
- **Serverless runs that outlive the request.** Runs execute under `after()`, coordinate only through Postgres with conditional status updates, retry the final write with backoff, and mark stale rows as `interrupted` instead of leaving them "running".

## Demo instructions (about 3 minutes)

1. Open **https://sondo.xylolabs.space**. Read the hero, then scroll to the featured reports.
2. Open a featured report (for example *Stride Loop · New York City*):
   - Check the cover line "Grounded in N Qloo results across M categories".
   - Switch between the three concept tabs.
   - Click any `E#` chip to see the Qloo result behind a claim, and note the three evidence tiers.
   - Scroll to the lift and distinctiveness charts, the evidence ledger and "Run details and Qloo trace".
3. Click **New brief**, choose an example (or write your own) and submit.
4. Watch the live research view: real Qloo queries, the budget, evidence per category and adaptive decisions. A run takes about 1.5–3 minutes. You can leave and come back; it keeps running.
5. When it finishes, copy the report link and open it in a private window. The report persists and is shareable.

A run may finish as **partial**. That means the agent couldn't ground all three concepts, and the report says why. That's intended: Sondo won't present an unsupported concept as a finding.

## Optional 2-minute demo script

| Time | Show | Say |
|---|---|---|
| 0:00 | Landing | "Marketers pick cultural partners by gut feel, and LLMs just guess confidently. Sondo researches Qloo's taste graph and cites it." |
| 0:15 | New brief → example → submit | "A brand, an audience, a city and a few things they love." |
| 0:30 | Live view | "These are the real Qloo queries running now: each category twice, once for this audience and once as a city baseline. The agent decides what to research next, and code checks every move." |
| 1:00 | Finished report (or a featured one) | "Three concepts with different angles. Green claims are directly supported, and this one is marked as a creative bet." |
| 1:20 | Click an `E#` | "Every claim opens the Qloo result behind it: rank, popularity, tags and the query that produced it." |
| 1:40 | Charts, trace | "Lift shows what over-indexes for this audience, labelled as our heuristic. The full Qloo trace, key-free." |
| 1:55 | Copy link | "Shareable and persistent. No login." |

## Evaluation (live)

The 5 fixed briefs are run with `pnpm eval` against live Qloo (no cache) and the production model. Metrics only are written to `scripts/output/`. See the [Phase 5 results in ROADMAP.md](ROADMAP.md#phase-5-results-2026-10-27).

## Links

- Live app: https://sondo.xylolabs.space
- Repository: https://github.com/lijnati/sondo
- License: MIT
