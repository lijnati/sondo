# DESIGN.md — Visual direction, page architecture, interaction

## 1. Direction: Neo-Swiss editorial precision
Sondo should feel like a **research publication produced by an instrument**: a printed strategy memo crossed with Linear's precision. Confidence comes from typography, grid and real data, not decoration.

**Principles**
1. **Evidence is the ornament.** The most visually prominent things are real Qloo results and citations, never stock illustration.
2. **Grid first.** A 12-column grid, an 8 px base unit, generous margins and hard alignment.
3. **One accent, used as a signal.** Accent marks evidence, live activity and selection. Nothing else.
4. **Honest data.** No chart without a question it answers. No number the ledger doesn't contain. Derived metrics are labelled.
5. **Quiet motion.** Motion explains state changes (progress, reveal, focus) and is never ambient.

**Banned:** purple or blue gradient heroes, glassmorphism, glowing blobs, fake dashboard screenshots, invented metrics ("10× ROI"), 3D objects, emoji bullets, and stock shadcn dashboard templates.

## 2. Tokens (Tailwind v4 `@theme`)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAFAF9` | `#0B0B0C` | page |
| `--surface` | `#FFFFFF` | `#141416` | cards, drawers |
| `--ink` | `#111111` | `#EDEDED` | primary text |
| `--ink-2` | `#55555A` | `#A1A1A6` | secondary |
| `--rule` | `#E6E6E3` | `#26262A` | 1 px hairlines (the main structural device) |
| `--accent` | `#E5482D` (Swiss signal red-orange) | `#FF5A3C` | evidence chips, live state, focus |
| `--pos` / `--neg` | `#1F7A4D` / `#B42318` | adjusted | lift up/down only |

- **Type:** Geist Sans with a tight display scale: 56/64 display (−2% tracking), 32/40 h1, 22/28 h2, 15/24 body, 13/20 meta. **Geist Mono** for evidence IDs (`E12`), parameters, latency and the trace. Tabular numerals everywhere numbers align.
- **Radius** 6 px (inputs and chips), 10 px (cards). Shadows are almost absent: rules and whitespace separate content.
- **Motion:** 150–220 ms with `cubic-bezier(.2,.8,.2,1)`. `prefers-reduced-motion` disables reveals.

## 3. Information architecture

```
/            Landing
/new         Brief composer (+ 3 featured examples)
/r/[id]      Run → Report (same URL: live progress, then report)
   ├─ Overview      (exec summary, audience profile, modeled / not-modeled)
   ├─ Signals       (per-category ranked lists, lift, distinctiveness map)
   ├─ Strategies    (3 strategies + comparison table)
   └─ Evidence      (ledger table + tool trace)
   [Evidence drawer opens from any E# chip on any tab]
```

## 4. Pages

### 4.1 Landing (`/`)
- **Hero:** left-aligned display headline "Stop guessing what your audience loves." A one-sentence subhead names Qloo explicitly ("grounded in Qloo's cultural graph"). Primary CTA "Build a cultural brief" and secondary "See an example report".
- **Proof strip (instead of a fake dashboard):** a *real* excerpt from a featured report. One strategy card with live E# chips, rendered from stored data and clickable into the example.
- **How it works:** 4 numbered columns on the grid: Brief → Research (Qloo) → Critique → Strategies. Each has a hairline diagram, not icons-in-circles.
- **What Sondo is / isn't:** a two-column honesty block ("cultural affinity, not purchase intent"). Builds trust with judges.
- Footer with repo link, license, "Powered by Qloo" attribution and a non-affiliation note.

### 4.2 Brief composer (`/new`)
- A single column of about 640 px plus a sticky right rail (desktop) titled "How Sondo will read this". The rail updates live as the user types, showing which fields map to Qloo signals.
- Fields: Brand name; Brand description (textarea); Audience (age-bucket multi-select chips **exactly matching Qloo's 6 buckets**, optional gender, free-text psychographics); Market (locality text); Goal (segmented control); Cultural anchors (token input, up to 6); Constraints (exclude categories, tone).
- **Featured examples:** 3 cards above the form. Choosing one pre-fills it and links to its cached report.
- Validation is inline (Zod messages in plain English). The submit button shows the budget: "~60–90 s · up to 40 Qloo queries".

### 4.3 Live research (`/r/[id]`, running state)
- **Left (8 cols): the run timeline.** Nodes as rows (Plan → Resolve → Explore → Deepen → Critique → Strategize → Validate). Each row shows a status dot (accent pulse when active), its elapsed time and a one-line summary ("Resolved 4 of 5 anchors · 'Zzqx' not found in Qloo").
- **Plan card** appears after node 1. It shows the modeled signals as chips and a **Not modeled** list in muted style. This is the honesty moment.
- **Right (4 cols): live tool trace.** A mono, compact feed of Qloo calls (`GET /v2/insights filter.type=podcast · 412 ms · 18 results · cached`). It auto-scrolls and can be paused on hover.
- **Category tiles** fill in as evidence lands (name chips appear with a 120 ms stagger). There's no fake progress bar, because progress comes from real node events.
- If the user leaves and returns, the page shows the persisted state.

### 4.4 Report: Overview
- Masthead: brand, market, goal, date, run status (complete or partial), and "Grounded in N Qloo results across K categories" (computed from the ledger).
- Executive summary (LLM text with E# chips).
- **Audience profile:** the signals used (age buckets, gender, Qloo audiences, locality) and the *Not modeled* list.
- Banners when relevant: brand not found, partial run, unavailable endpoint.

### 4.5 Report: Signals
- **Category columns** (artists, TV, film, podcasts, brands, places): ranked lists showing rank, name and thumbnail when Qloo provides one, an affinity bar *only if affinity exists* (otherwise rank only), a popularity percentile in mono, and a lift arrow (▲3 / new).
- **Audience lift chart** (justified: "what is specific to this audience?"). A slope or dumbbell plot of baseline rank → target rank for the top movers in a chosen category.
- **Distinctiveness map** (justified: "where are the under-exploited levers?"). A 2-axis scatter of affinity (or rank) against popularity percentile, with the quadrants labelled and "Sondo heuristic" in the caption. Points are clickable and open the evidence drawer.
- Empty category: a ruled box saying "No Qloo signal for this audience in Podcasts", with the query that was tried and what Sondo did next.

### 4.6 Report: Strategies and comparison
- Three strategy columns on desktop (stacked on mobile), each as an editorial card: kicker (Mainstream anchor / Distinctive niche / Cross-category bridge), title, thesis, territory, partners (with E# chips), placements, creative direction, risks, and **How to validate**.
- **Comparison table** below: rows for primary categories, evidence count, mainstream ↔ distinctive balance (from the derived quadrants), main risk and validation effort. Cells are factual and taken from the data.

### 4.7 Evidence inspection and tool trace
- **E# chip:** mono, accent outline. Hover shows a tooltip with name, category, rank/of and affinity if present. Click opens the **drawer**.
- **Evidence drawer** (Sheet, right side): entity name and image, category, rank/of, affinity (raw Qloo value and scale note), popularity percentile, derived metrics (labelled), the Qloo query that produced it (filter type plus signals, in readable form), a link to the trace row, and "Cited in" (which claims use it).
- **Evidence tab:** a sortable ledger table plus the full tool trace (call, params, status, latency, cache hit, retry). This is the technical-implementation showcase.

## 5. States
| State | Treatment |
|---|---|
| Loading (report fetch) | Skeleton lines matching the final layout. No spinners in content areas. |
| Running | Timeline plus trace (4.3) |
| Partial | Amber hairline banner naming what's missing and why. The available content still renders. |
| Brand not found | Inline banner explaining that the strategy relies on anchors |
| Empty category | Ruled empty box with the attempted query |
| Endpoint unavailable | Muted note "Not available on the hackathon API". Never a stack trace. |
| Rate-limited / quota | "Live runs are paused. Explore featured reports." The CTA still works. |
| Validation dropped claims | A footnote counting removed unsupported claims (shows the system's rigor) |
| Fatal error | Plain-language message, run ID in mono, retry button |

## 6. Accessibility and responsiveness
- WCAG AA contrast, including the accent on the background. Full keyboard path for the brief, chips and drawer. Visible focus rings in the accent color.
- Charts have text equivalents (a table toggle). Color is never the only carrier: lift uses arrows and signs.
- Breakpoints: 375 / 768 / 1280 / 1536. On mobile the trace collapses into a "Show tool calls (N)" disclosure.

## 7. Design QA checklist (Phase 4)
- [ ] No number on screen without a ledger source. Derived metrics are labelled.
- [ ] Every chart answers its stated question and has a table fallback.
- [ ] Featured report screenshots look good at 1280 and 375.
- [ ] Empty, partial and error states were seen in a real run, not just in storybook.
- [ ] No banned visual patterns (§1).
