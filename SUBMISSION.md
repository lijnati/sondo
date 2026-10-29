# Sondo: Devpost submission

Copy-ready text for each Devpost field, then the pitch kit (demo script, elevator pitch, judge Q&A). Every number below comes from a stored run, a live eval or a test run; the sources are listed in [Where the numbers come from](#where-the-numbers-come-from).

---

## Devpost fields

**Project name:** Sondo

**Tagline (≤ 200 chars):** Cultural strategy with receipts. Sondo turns a brand brief into three campaign concepts, and every cultural claim links to the Qloo result behind it.

**Try it out:** https://sondo.xylolabs.space (no login, no payment, nothing to configure)
**Code:** https://github.com/lijnati/sondo (MIT)

**Built with:** `next.js` `react` `typescript` `qloo` `vercel` `vercel-ai-gateway` `ai-sdk` `neon` `postgresql` `zod` `vitest` `playwright`

---

### Inspiration

Every brand launch needs cultural partners: the artist, the show, the podcast, the venue or the co-brand that makes a campaign feel native to its audience. Big brands pay insights teams and research panels for that answer. Everyone else guesses.

AI has made that guessing faster without making it better. Ask a general-purpose model which podcasts a 25-to-34-year-old in Austin loves and you get a fluent, confident list drawn from training-data stereotypes. It's the same list your competitors get, there's no evidence behind it, and nothing tells you how *this* audience differs from everyone else in the city. You can't defend it in a client meeting.

We wanted the opposite: an agent that does the research, shows its sources, and says plainly when it can't support a claim.

### What it does

You give Sondo a brief: a brand, an audience, a market, an objective and, optionally, a few things that audience already loves. Sondo's agent then researches Qloo's taste graph live, and you can watch it work: the stages, the real Qloo queries, the budget and the evidence coming in.

A few minutes later you have a report with **three different campaign concepts**: a mainstream anchor, a distinctive niche and a cross-category bridge. Each claim is marked with its evidence tier:

- **Directly supported:** the sentence names the Qloo result it cites.
- **Contextual support:** the cited result is related (same category or taste theme).
- **Hypothesis or creative idea:** strategic judgement, styled differently, never dressed up as a finding.

Click any `E#` chip and the Qloo result behind the claim opens: its category, its rank within its query, popularity, tags and the query that produced it. The report also shows:

- what Sondo could and couldn't model from the brief;
- key findings written by code;
- audience-lift and distinctiveness charts;
- the full evidence ledger and the Qloo trace (with no keys);
- a "how to validate" test plan for every concept;
- a **Without Qloo** panel: the same brief given to the same model with no data access, matched against Qloo's results.

Reports are permanent, shareable links that unfurl with their own preview image. Any finished report can **replay** its research in about 20 seconds.

### How we built it

- **App:** Next.js 16 (App Router, Node runtime), React 19 and TypeScript in strict mode, deployed on Vercel in `fra1` next to the database.
- **Agent:** AI SDK 7 through the Vercel AI Gateway. The production model is `nvidia/nemotron-3.5-lightning-free`, a free model; that was a deliberate constraint, and the reason the validation layer had to be strong.
- **Data:** Neon Postgres for runs, the event log, reports and a private Qloo response cache. Zod validates every boundary: briefs, Qloo responses, model output and database rows.
- **Agent design:** a bounded state machine in `lib/agent/`. Code owns control flow, entity ids, every number, budgets and run status; the model plans, picks research moves and writes copy. Steps:
  1. **Plan.** The model turns the brief into categories and questions, and code clamps the plan to the brief: ages, market and anchors stay authoritative, and anything Qloo can't model (income, values) is listed as *not modeled*.
  2. **Research (code).** Resolve the brand and anchors, then run paired target and baseline queries per category, plus taste themes and anchor demographics.
  3. **Adapt (up to 2 rounds).** The model chooses follow-ups from a fixed tool menu: explore a category, add a niche lens, bridge from an `E#`, fetch taste themes, or stop. Code checks each proposal against the ledger and the budget before anything runs.
  4. **Critique (code).** Writes findings (`F#`) on lift, distinctiveness, cross-category intersections, conflicts and gaps.
  5. **Strategize (model).** Three concepts that may cite only ledger ids.
  6. **Validate (code), with one repair call.** Every citation must exist and must relate to the sentence that cites it. Evidence claims with no relevant citation become hypotheses. Invented numbers and performance claims are removed. Concepts must differ.
  7. **Integrity gate.** A run is stored `completed` only if all three concepts are grounded (at least 3 relevant citations across at least 2 categories) and the stored report re-validates. Otherwise it's stored as `partial`, `failed`, `cancelled` or `interrupted`, with the reason shown.
- **Runs outlive the request.** A run executes under Next.js `after()`, streams public events as NDJSON, writes each event to Postgres, and resumes on reload. Public events never carry Qloo params, ids, error text, token counts or model-written reasoning.
- **Guardrails per run:** 24 Qloo calls, 4 model calls, 2 adaptive rounds, a 180 s hard limit and Qloo concurrency of 3. Across visitors: a per-IP daily limit (IPs stored only as HMACs), a global daily cap, a concurrency cap, idempotent submits and a kill switch that serves featured reports only.

### How Qloo powers Sondo

Qloo is the only evidence source. If you remove it, the ledger is empty, the validator has nothing to accept, and every claim is downgraded to a hypothesis. Sondo would still write, but it couldn't prove anything.

All calls go through a typed, allowlisted, budgeted client for `hackathon.api.qloo.com`:

- **Entity resolution (`/search`).** Brand and anchor names become Qloo entities. Only trusted matches seed research, and a fictional brand is reported as "not in Qloo" rather than guessed.
- **Cultural affinities (`/v2/insights` across artists, film, TV, podcasts, books, brands and places).** Each category is queried twice: once with the audience's signals (age buckets, gender if stated, anchors, market) and once as a **market baseline**. Comparing the two ranks gives **audience lift**: what over-indexes for this audience rather than for everyone in the city.
- **Taste themes (`filter.type=urn:tag`)** behind the signal set, and **demographics (`filter.type=urn:demographics`)** of the anchors.
- **Distinctiveness.** Qloo popularity crossed with in-query rank finds strong-fit entities that aren't mainstream.
- **Cross-domain discovery.** The agent can take a strong result in one category (a brand) and use it as the seed for another (podcasts), following Qloo's graph across domains.
- **Provenance.** Every `E#` is a row parsed from a real Qloo response: query, rank, popularity and tags. The model can reference an id but can never write one, and it never writes a number.

Lift and distinctiveness are labelled as Sondo heuristics. Qloo affinity is never presented as purchase intent, audience share or ROI.

**The measured difference.** For the three featured briefs we asked the same model for cultural partners with no data access. Of its 32 suggestions, **1** appeared among the Qloo results collected for that audience. Sondo's concepts cite **23** partners the plain model never named. The report shows both lists, matched by code.

### Challenges we ran into

- **A free model that doesn't always follow the format.** It sometimes answered in prose instead of structured output, or timed out. We forced structured output through a tool call, added a compact-digest retry that runs only when the deadline allows, applied deterministic fixes when repair fails, and kept whichever of draft or repair is better grounded. All of it runs through the same validator.
- **Real citations on the wrong sentence.** Early runs attached genuine `E#` ids to unrelated claims. Checking that an id exists wasn't enough, so we built a deterministic relevance check (names, tags, category words) and a downgrade-to-hypothesis rule.
- **Ids and numbers leaking into prose.** The model wrote "(E11)" into sentences, and the no-invented-numbers rule then withheld whole insights. Inline ids are now stripped before validation, with a regression test.
- **A 200 that ignores you.** Qloo silently ignores parameters a type doesn't support. We verified each type's parameters with a live probe and drop anything off the allowlist in code instead of trusting the status code.
- **Serverless runs that outlive the request.** Postgres is the only coordination point: conditional status updates, backoff on the final write, and stale rows marked `interrupted` instead of left "running" forever.

### Accomplishments that we're proud of

- **0 invalid citations** in every recorded live eval (Oct 19, both Oct 27 runs and Oct 29). In the Oct 29 eval, against live Qloo with no cache, the 5 fixed briefs produced 176 citations. All were valid, every evidence claim had a relevant citation, and all 5 runs stayed within budget.
- **Honest status.** A run that can't ground all three concepts is stored and shown as `partial` with the reason, never promoted to `completed`. The integrity gate makes that structural.
- **The model never writes a number.** Every rank, score and count in the UI is rendered from parsed Qloo responses.
- **A product, not a notebook:** live research view, permalinks, replay, the evidence drawer, charts with table fallbacks, link previews, and real 404s for unknown reports. Lighthouse accessibility scores 100 on the landing, composer and report pages in production.
- **Tested like it matters:** 272 unit tests (including in-process Postgres via PGlite) and a Playwright suite at 1280 and 375 px that also runs against production.

### What we learned

- **Grounding is a pipeline property, not a prompt.** Asking the model to "cite sources" produced plausible ids on the wrong sentences. What worked was making ids unforgeable (code assigns them), checking relevance in code, and letting the run fail honestly.
- **A baseline is what makes cultural data useful.** A single affinity list mostly shows what's popular. The paired audience-vs-market query is what surfaces the non-obvious partner.
- **Bounded agency beats open-ended agency for trust.** A typed menu of research moves, each validated before it runs, gave us an agent that adapts, stays within budget, and leaves a trace a person can audit.
- **Say "partial" out loud.** Labelling unsupported concepts made the output more credible, not less.

### What's next for Sondo

- **The paying user:** brand and growth teams at DTC, CPG and hospitality companies without an insights department, and agency strategists who need a defensible first-pass cultural brief before a client workshop.
- **The product path:**
  1. Team workspaces with saved briefs and report history.
  2. Exports to slides and docs, so a report drops straight into a pitch.
  3. Brief-to-brief comparison: the same audience across two cities, or two audiences in one city.
  4. A stronger paid model behind the same validator, to cut the partial rate.
- **Closing the loop.** Each concept already ships with a "how to validate" plan. The next step is recording the test outcome against the concept, so teams build their own evidence over time.
- **Business model:** a per-seat subscription for in-house teams, plus agency plans priced per client workspace. Sondo is a first-pass research tool, not a replacement for a full study.

### Demo instructions for judges

No login, payment or setup. Everything below runs on the live site.

1. Open **https://sondo.xylolabs.space** and scroll to **Featured reports**.
2. Open **Stride Loop · New York City**:
   - The cover shows how many Qloo results across how many categories ground the report.
   - Switch between the three concept tabs.
   - Click any `E#` chip to open the Qloo result behind that claim, and note the three evidence tiers.
   - Read **Without Qloo, by contrast**: what a plain model suggests for the same brief, next to the partners only Sondo found.
   - Press **Watch the research** to replay the agent's run in about 20 seconds.
   - Scroll to the lift and distinctiveness charts, the evidence ledger and **Run details and Qloo trace**.
3. Click **New brief**, pick an example (or write your own) and submit. The live view shows the real Qloo queries, the budget and the evidence per category. A run takes about 2–3 minutes, and it keeps running if you leave.
4. When it finishes, copy the report link and open it in a private window. The report is stored and shareable.

A run can finish as **partial**: the agent couldn't ground all three concepts, and the report says why. That's by design. Each visitor gets a few live runs a day to protect the shared Qloo quota; the featured reports are always available.

---

## Pitch kit

### 30-second elevator pitch

> Every brand launch needs cultural partners, and most teams pick them by gut or ask an AI that guesses confidently. Sondo is an AI strategist that actually does the research. Give it a brief and it queries Qloo's taste graph live, compares your audience against the whole market, and writes three campaign concepts where every claim links to the Qloo result behind it. When we gave the same model the same briefs without Qloo, 1 of its 32 picks showed up in what Qloo found for those audiences. Sondo is strategy you can defend.

### 90-second live demo

| Time | Screen | Say |
|---|---|---|
| 0:00 | Landing | "Brands choose cultural partners (artists, shows, podcasts, venues) by gut feel. AI copilots just guess faster. Sondo researches and cites." |
| 0:12 | New brief → example → submit | "A brand, an audience, a city, a goal and a couple of things they already love." |
| 0:20 | Live view | "These are the real Qloo queries running now: each category twice, once for this audience and once for the whole market. The agent picks follow-ups from a fixed menu, and code checks each move against the budget." |
| 0:35 | Open the featured Stride Loop report (the live run continues in the background) | "Here's a finished run. Three concepts with different angles: a mainstream anchor, a niche and a cross-category bridge." |
| 0:45 | Click an `E#` chip | "Every claim opens the Qloo result behind it: rank, popularity, tags and the query. Green is directly supported. This one is labelled a creative hypothesis: Sondo won't pass a guess off as a finding." |
| 1:00 | Without Qloo panel | "The same model, the same brief, no Qloo. One of its 32 picks appeared in what Qloo found for these audiences. These are the partners only Sondo found." |
| 1:12 | Lift chart | "Lift: what ranks higher for this audience than for the city. It's labelled as our heuristic, and Sondo never claims ROI." |
| 1:20 | Back to the live run, or the copied link | "The run finished while we talked. It's a permanent, shareable report. For a brand team, that's a defensible first-pass cultural brief in minutes, with a test plan for each idea." |

If the live run hasn't finished by 1:20, or comes back partial, say so: "It's labelled partial because it couldn't ground every concept. That's the system working."

### Five likely judge questions

1. **"Isn't this just ChatGPT with an API call?"**
   No. The model can't produce evidence. Code assigns every `E#` from parsed Qloo responses, checks that each citation relates to its sentence, removes invented numbers, and downgrades unsupported claims to hypotheses. The Without Qloo panel shows the gap: 1 of 32 plain-model picks appeared among Qloo's results for those audiences.

2. **"How do you know the citations are right?"**
   There are three layers, all in code. Each citation must exist in the run's ledger. It must relate to the sentence that cites it (names, tags and category words; `lib/agent/relevance.ts`). And a run is `completed` only if all three concepts clear a grounding bar and the stored report re-validates. Across the live evals, invalid citations in output were 0. Relevance is a consistency check, not fact-checking, and we say that in the README.

3. **"Why do some runs come back partial?"**
   We run a free model on purpose, and it sometimes under-cites or times out. Instead of hiding that, the integrity gate stores the run as `partial` and explains why. A stronger paid model behind the same validator is the obvious lever; the validation logic doesn't change.

4. **"Who pays for this?"**
   Brand and growth teams at DTC, CPG and hospitality companies that don't have an insights department, and agency strategists preparing pitches. Today they pay for panels and consultants or rely on gut feel. Sondo produces a cited first pass in minutes, with a test plan, so the expensive research goes where it's needed.

5. **"Does affinity mean people will buy?"**
   No, and Sondo says so on every report. Affinity is Qloo's relevance score for a query, not purchase intent, audience share or ROI. Lift and distinctiveness are labelled as Sondo heuristics, and every concept comes with a cheap way to test it before a real budget goes in.

### Why Sondo can be a company

- **A real, recurring job.** Every launch, market entry and sponsorship decision needs a cultural rationale, and most teams can't afford a research study for each one.
- **Trust is the moat.** Generic AI copy is a commodity. Auditable strategy, where every claim opens its source and the tool says what it can't support, is what an agency can put in front of a client.
- **It compounds.** Each concept carries a test plan. Recording outcomes against concepts builds evidence specific to a team's own audiences.
- **It's already shaped like a product:** shareable reports, abuse limits, persistence, replay and link previews are all live today.

---

## Submission assets

Screenshots of the live production site (captured Oct 29 with Playwright Chromium; desktop 1440 × 900 at 2×, mobile 390 × 844 at 3×). They're kept out of git because they show Qloo results; the files are in the gitignored `.qa/submission/` folder.

| File | Use |
|---|---|
| `00-cover-3x2.png` | Devpost thumbnail (3:2): the landing hero |
| `01-landing-hero.png` | Gallery 1: what Sondo is |
| `02-report-cover.png` | Gallery 2: report cover with the grounding line |
| `03-report-concepts.png` | Gallery 3: a concept with evidence tiers |
| `04-evidence-drawer.png` | Gallery 4: an `E#` opened to its Qloo result |
| `05-without-qloo.png` | Gallery 5: the Without Qloo contrast |
| `06-signals-lift.png` | Gallery 6: lift and distinctiveness |
| `07-ledger.png` | Evidence ledger |
| `08-new-brief.png` | Brief composer |
| `09-replay-midrun.png` | Research replay, mid-run |
| `10-mobile-landing.png`, `11-mobile-concept.png` | Mobile |

The logo masters are in `public/brand/`. A demo video is optional (Devpost: "Demo videos are not required") and wasn't recorded.

## Where the numbers come from

| Claim | Source |
|---|---|
| 1 of 32 plain-model picks, 23 partners only Sondo cited | `pnpm contrast --featured`, Oct 27, stored in `report_contrasts` |
| Featured reports: 106, 94 and 93 Qloo results | Featured runs `VTuxwl03jMKD`, `DseEb2AHvHWh` and `3KZLO3daGGPB` |
| Live eval results | `scripts/output/eval-summary.json`; see [ROADMAP.md, Phase 6](ROADMAP.md#phase-6-results-2026-10-29) |
| Lighthouse accessibility 100 | Production run, Oct 27 (ROADMAP.md, Phase 5) |
| Test counts | `pnpm test` and `pnpm e2e`, Oct 29 (ROADMAP.md, Phase 6) |
