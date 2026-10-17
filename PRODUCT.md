# PRODUCT.md — Sondo

**Sondo: stop guessing what your audience loves.**
Sondo is an autonomous cultural-intelligence strategist. It turns a brand brief into three evidence-backed campaign strategies. Every cultural claim in a strategy traces to a specific Qloo result.

## 1. Problem
Brand and growth marketers routinely choose **cultural partners** (creators, artists, shows, podcasts, venues, co-brands) and **creative territories** by gut feel, by trend-chasing, or through slow and expensive panels. LLM copilots make this worse, because they produce confident, generic suggestions from training-data stereotypes, with no evidence and no audience specificity. The result is wasted spend on mainstream picks that every competitor also chooses.

## 2. Who it's for
- **Primary:** a brand or growth marketer at a DTC, CPG or hospitality brand (SMB to mid-market) with no in-house insights team, planning a campaign, partnership or market entry.
- **Secondary:** an agency strategist who needs a defensible first-pass cultural brief before a client workshop.
- **Not for:** media buyers who need reach or CPM forecasting, or anyone needing purchase-intent or attribution data.

## 3. Core job
> "Given my brand, my audience and my market, tell me which cultural territories and partners genuinely resonate with *this* audience (not everyone), show me why, and give me testable campaign directions."

## 4. Workflow (MVP)
1. **Brief:** brand name and description, target audience (structured plus free text), market (city or region), campaign goal (awareness, consideration, launch, partnership, market entry), optional cultural anchors (things the audience is known to love), and constraints (exclude categories, budget tier, tone).
2. **Interpretation:** Sondo maps the brief onto what Qloo can actually model: entity anchors, age buckets, gender, Qloo audiences and a locality. It shows the user exactly which parts of the brief are **modeled** and which are **not modeled** (e.g. income, job title, "eco-conscious" unless a matching Qloo audience or tag exists).
3. **Research (live, visible):** Sondo resolves entities, runs cross-category Insights for the target audience *and* a location baseline, and explores 6 categories (music artists, TV, film, podcasts, brands, local places). It then optionally runs taste analysis, explainability and compare.
4. **Critique:** deterministic checks for coverage, empty results, low-confidence matches and "generic" (mainstream, not audience-specific) signals.
5. **Strategy:** three **differentiated** strategies, for example *Mainstream anchor*, *Niche distinctiveness* and *Cross-category bridge*. Each has a thesis, cultural territory, recommended partners and placements, a creative direction, cited evidence, risks, and **How to validate** (a concrete test plan).
6. **Report:** a cultural intelligence report with the audience profile, top signals per category, audience lift, a distinctiveness map, strategy comparison, an evidence inspector and the full tool trace.

## 5. Differentiators (why Qloo makes this impossible to fake)
- **Audience lift:** for each category Sondo runs the query twice. One run uses the audience signals; the other is the location or general baseline. It surfaces what *over-indexes* for this audience. An LLM alone can't do this.
- **Distinctiveness:** Qloo `popularity` (percentile) crossed with in-query affinity or rank. High affinity with low popularity marks a culturally resonant but under-exploited lever. Labelled as a Sondo-derived heuristic.
- **Cross-category bridges:** Qloo's cross-domain graph (brand → podcast → venue) finds non-obvious partnership chains.
- **Evidence-locked generation:** the LLM can only cite evidence IDs from the ledger. Numbers are rendered from data, never written by the model.

## 6. Honesty rules (product language)
| Never say | Say instead |
|---|---|
| "Your audience will buy…" / "drives conversions" / "ROI" | "shows strong cultural affinity with…" |
| "73% of your audience loves X" | "X ranks #3 of 50 in Qloo affinity for this audience signal set" |
| "This campaign will work" | "This is a hypothesis grounded in affinity data. Validate it with the test plan." |
| Comparing raw scores across different queries | Compare ranks within one query, and lift between paired queries |
| Demographic claims beyond Qloo's inputs | Modeled with age bucket, gender (binary in Qloo), Qloo audiences and locality only |

Every report carries a fixed **"What this is / isn't"** box. The claim validator blocks forbidden patterns (see ARCHITECTURE.md §7).

## 7. Scope

**In the MVP**
- Single-page brief form with 3 one-click **featured examples** (fictional brands with real cultural anchors)
- Bounded agent run with live progress streaming
- Report with audience profile, category signals, lift, distinctiveness map, 3 strategies, comparison table, evidence drawer and tool trace
- Shareable report permalink (`/r/[id]`)
- Graceful degradation for brand-not-found, empty categories, unavailable endpoints, rate limits and LLM failures
- Deployed on Vercel. No login.

**Out of scope (explicitly)**
- Auth, accounts, billing, teams, saved workspaces
- Ad copy generation beyond a one-line creative direction per strategy
- Media plans, budgets, reach and CPM forecasting, attribution
- Trend time series (possibly a stretch goal)
- Chat-style follow-up conversations (stretch goal: "explore this strategy deeper" re-runs one category)
- PDF export (stretch goal: print stylesheet)

## 8. Success criteria

**Product (measured on 5 fixed evaluation briefs, see ROADMAP.md Phase 2)**
- 100% of displayed cultural claims cite at least one valid evidence ID, enforced by the validator. Claims that fail are repaired once, then dropped. Target: ≤ 10% of drafted claims dropped.
- 0 fabricated entity IDs, scores or citations. This is checked automatically.
- 3 strategies that are measurably differentiated: overlap of cited entities across strategies ≤ 30%.
- Run completes in ≤ 90 s at p50 and ≤ 150 s at p95, using ≤ 40 Qloo calls and ≤ 6 LLM calls.
- The "not modeled" list is shown whenever the brief contains unsupported audience attributes.

**Hackathon**
- Passes Stage One and scores strongly on all four criteria (see HACKATHON.md §6).
- A judge can go from landing page to a full report in under 2 minutes with zero setup.

## 9. Key assumptions (to verify)
| Assumption | How it's verified | Owner phase |
|---|---|---|
| `/v2/insights` returns a per-result affinity value | Spike G2 | 1 |
| Demographic signals shift rankings enough for lift to be meaningful | Spike G3 plus eval briefs | 1–2 |
| Location signal works for non-place categories | Spike G4 | 1 |
| Featured fictional-brand briefs produce rich results via anchors | Eval briefs | 2 |
| Quota supports judging-period traffic with caching | Request quota info from Qloo. Load test against the cache. | 5 |
