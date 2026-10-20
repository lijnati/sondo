# DESIGN.md — Visual direction, page architecture, interaction

## 1. Direction: Pixel Meadow, paper mode
Sondo is a research publication with a warm, recognisable frame. Pixel-art scenes (procedural, `lib/pixel-scene/pixel-scene.js`) live only in **inset rounded frames**: the landing hero, the `/new` hero, closing bands and the report cover. Everything else is calm paper, with hairlines, pill controls and type that stays restrained. The source is the `pixel-meadow-ui` skill (tokens, components, voice). It is **light-only by design**, with no dark theme: the founder chose this on 2026-10-20.

**Principles**
1. **Evidence is the ornament.** On a report, the most prominent things are real Qloo results, their ranks and the claims that cite them.
2. **Honest data.** Every number on screen is read from the ledger. Charts answer a stated question and have a table fallback. Derived metrics (lift, quadrants) are labelled "Sondo heuristic".
3. **A creative bet never looks like a finding.** There are three visible evidence tiers (§2.3).
4. **Quiet motion.** Motion explains state (stage changes, new Qloo calls, reveals) and is off under `prefers-reduced-motion`.

**Banned:** generic AI-SaaS gradients and glowing blobs, glassmorphism outside the hero nav, fake dashboards and invented metrics, emoji bullets, testimonials or logos, decorative art that is not one of the meadow scenes, and full-bleed art (art always sits inset from a white page edge).

## 2. Tokens (`app/meadow.css`)
All page CSS uses tokens. A colour changes in one place.

### 2.1 Colour
| Token | Value | Use |
|---|---|---|
| `--bg` / `--sheet` / `--paper` / `--paper-deep` | `#fff` / `#fffefa` / `#f7f9f5` / `#eaf0e8` | page, cards, quiet fills, tracks |
| `--ink` / `--ink-soft` / `--ink-faint` | `#183d32` / `#53665d` / `#5c7067` | text (never black) |
| `--rule` / `--rule-strong` | `#dce4da` / `#bdcabe` | hairlines |
| `--accent` / `--accent-deep` / `--accent-soft` | `#21634e` / `#164c3b` / `#e4eee4` | evidence, selection, focus |
| `--butter` / `--butter-ink` | `#ffe46b` / `#313712` | the one loud colour: primary action, active stage |
| `--mint` → `--cream` → `--ice` | pastel triad, always in this order | concept tints, featured cards |
| `--warn-ink`, `--bad`, `--bad-ink`, `--danger` | | partial, failed, field errors |

Contrast: ink-soft and ink-faint on paper/sheet ≥ 4.5:1; accent on sheet ≥ 4.5:1.

### 2.2 Type, shape, motion
- **DM Sans** for display at 600–650 with −0.035 to −0.045em tracking. At most one **Instrument Serif** italic word per headline. **Geist Mono** for E#, run ids, ranks and eyebrows.
- Every interactive surface is a pill. Cards are 14–20 px radius. The container is 1160 px, with 72 px between report sections.
- Motion uses `cubic-bezier(.22,1,.36,1)`. Hero words and reveals play once on load. Section reveals are CSS scroll-driven (`animation-timeline: view()`) and simply show where that isn't supported. **No script touches server-rendered nodes**, which fixed the Phase 3 hydration mismatches.

### 2.3 Evidence tiers (one system everywhere)
| Tier | Badge | Card rule | Meaning |
|---|---|---|---|
| Direct | solid accent | solid accent left rule | the claim names the cited Qloo result |
| Contextual | outlined | solid soft-green rule | it names a tag or category of the result |
| Hypothesis / creative idea | dashed outline | dashed amber rule, lighter fill | a strategic bet to test, not a finding |

The tier comes only from `claimBadge` and `ideaBadge` (`lib/report/view.ts`), which read the validator's `support`. Weak citations are never shown as support.

## 3. Information architecture

```
/            Landing: hero → proof strip → featured reports → four steps → real report excerpt (tabs) → audience lift (real top mover) → is / isn't → FAQ → closing band
/new         Compact hero → brief form with a sticky rail → featured reports → closing band
/r/[id]      Running: the live research view. Finished: the report.
   Cover · meta row · sticky nav: Overview · Concepts · Signals · Findings · Evidence · Method
   [Evidence drawer opens from any E# chip]
```

## 4. Pages

### 4.1 Landing
- The hero keeps "Stop guessing what your audience *loves*."
- **Featured cards** (`components/app/featured-reports.tsx`) show the status, market and goal, the top code-written finding, the three concept names by angle, and real result and category counts.
- **Real excerpts** (`featuredExcerpt()` in `lib/db/runs.ts`, read in SQL with no whole-report load):
  - one concept's cultural insight, with its tier and the ledger rows it cites;
  - the biggest audience-lift mover, with its real audience and baseline ranks.
- If the database is unreachable, a ruled box says so and nothing is drawn in its place.

### 4.2 Brief composer (`/new`)
- The form comes first. It has five numbered sections, each with a "why Sondo asks" line. Optional fields are marked, and Constraints is collapsed unless it has content.
- **Sticky rail:** "How Sondo will read this" (modeled and not modeled), a "Needed to start" checklist of the five required fields, and the run budget.
- **Error summary:** a failed submit lists each invalid field as a link that focuses it, and the first field is focused. Messages are the shared Zod messages.
- The `Brief` contract is unchanged.

### 4.3 Live research (`components/run/run-live.tsx`)
- **Staged timeline:** Planning → Qloo research → Critique → Concepts → Claim validation, with numbered markers, a connector, the real step label and the real elapsed time per stage.
- **Qloo queries:** 24 budget cells (labelled "a budget, not a progress bar"), plus a feed of the last 12 calls showing kind, category, result count, latency and whether it was cached or failed. These come only from public `qloo` events (`summarizeRun().recentQloo`).
- Also shown: evidence-by-category bars, the research plan, the claim-validation result and adaptive decisions.
- **Never shown:** percentages, model text or estimated progress. Stage changes are announced through `aria-live`. A "reconnecting" notice appears if the stream drops. The clock starts after mount.

### 4.4 Report (`components/report/*`)
1. **Cover:** a seeded meadow strip per run id, with the brand, market, goal and date. Below it: the status chip, "Grounded in N Qloo results across K categories" (`ledgerStats`), copy-link and new-brief actions, and the sticky section nav.
2. **Overview:**
   - Key findings: `keyFindings()`, strongest first and one per category, each with named E# chips.
   - The brief, and what Qloo modeled / not modeled.
   - Opportunities in the data.
3. **Concepts:** a tablist (arrow keys, Home/End, `#concept-<angle>` deep links) over one editorial article per angle:
   - the positioning and the grounding level;
   - **The idea**, **Who it's for** and **Where it shows up** (tiered opportunities and channels);
   - an **evidence rail**, "Why it could work" (the insight and the claims);
   - **How it differs** (the angle's role and the categories it draws on) and **What's uncertain** (assumptions and risks).
   - A missing angle renders as a ruled "Not written" placeholder.
4. **Signals:**
   - **Audience lift:** a dumbbell of baseline rank → audience rank, from `liftRows()`.
   - **Distinctiveness:** a scatter of popularity (axis stretched toward 1, ticks at 0.9 / 0.99 / 0.999) against position in the audience query, with labelled quadrants, from `distinctivenessPoints()`.
   - Both are labelled Sondo heuristic and have a "Show as a table" fallback. The section appears only when there is enough data.
5. **Findings:** grouped by strength. Strong is open; moderate and weak are counted disclosures.
6. **Evidence:** the ledger (`ledger.tsx`). The category filter and "show all" are radio and checkbox inputs read by CSS `:has()`, with no client JS. The first 12 rows show.
7. **Method:** claim-validation counts, "What this is, and isn't", run details and the Qloo trace.
8. **Evidence drawer:** the name, a rank meter drawn from rank/of, affinity and popularity (raw Qloo values), lift and quadrant (heuristic), the query and "Cited in".

## 5. States
| State | Treatment |
|---|---|
| Loading report | Skeleton in the report's own shape (cover, meta, nav, findings, tabs) |
| Running | The live research view (§4.3) |
| Partial | Amber banner with the stored reasons. Concepts carry grounding badges; missing angles show "Not written". |
| Interrupted / failed / cancelled (no report) | `PageState` with the run id, the status banner and the stages reached (from stored events), plus next actions. Nothing is shown as a finding. |
| Brand not found | Inline warning: the research relies on the anchors and market. |
| Not enough signal data | Signals section hidden; key findings fall back to a ruled note. |
| Featured store unreachable | Ruled box saying so. No invented card. |
| Rate-limited / paused | Composer notice plus a link to featured reports. |
| 404 / error | Meadow `PageState` with a way out. Unknown report ids keep a real HTTP 404. |

## 6. Accessibility and responsiveness
- Real tablists (concepts, landing tabs) with roving tabindex and arrow keys.
- The drawer is a Radix Dialog: it traps focus, closes on Escape and returns focus to the chip.
- Ledger filters are native radios. Visible focus rings everywhere. Charts have table equivalents, and lift uses ▲ and text, not colour alone.
- Checked at 375, 768, 1280 and 1440. On mobile the concept tabs scroll horizontally, lift rows stack, and the section nav scrolls.
- `prefers-reduced-motion` disables all animation.

## 7. Design QA checklist
- [x] No number on screen without a ledger source. Derived metrics are labelled.
- [x] Every chart answers its stated question and has a table fallback.
- [x] Featured, partial and interrupted reports checked at 375 and 1280 with real stored runs.
- [x] Live view checked on a real run (Phase 4 results in ROADMAP.md).
- [x] No banned visual patterns (§1). No hydration warnings on `/` or `/new`.
