# QLOO_RESEARCH.md — Capabilities, endpoints, constraints, feasibility

Status as of **2026-10-17**. Live evidence comes from the spike (§9, 30 requests) and the Phase 1b capability probe and exploration runs (§10, about 120 requests through the real data layer). Sections 1–8 describe what is *documented*; §9–10 record what was *observed*. **Where they differ, §10 wins.**

**Legend**
- 📄 Documented in an official source
- 🧪 Verified by a live request (none yet)
- ⚠ Sources conflict or are ambiguous
- ❓ Undocumented. Must be observed live.

**Sources**
- [HG] Hackathon developer guide, https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide (`updatedAt 2026-10-07`). **Authoritative for host, auth, endpoints and errors.**
- [DP] `github.com/qloo/docs-public` @ `d4a0eb9` (2026-02-25). This is a markdown mirror of docs.qloo.com. Cited files: `reference/parameters.md`, `reference/available-parameters-by-entity-type.md`, `reference/insights-api-deep-dive.md`, `reference/taste-analysis.md`, `reference/demographics-use-case.md`, `reference/insights-with-location-use-case.md`, `reference/basic-insights-use-case.md`, `reference/heatmaps-use-case.md`, `reference/get-search.md`, `reference/get-tags.md`, `reference/get-audiences.md`, `reference/analysis-compare.md`, `docs/interpreting-affinity-scores.md`, `docs/affinity-score-methodology.md`, `docs/faqs.md`.
- ⚠ **`openapi-schema.json` in docs-public is not Qloo's API spec.** It is the generic OpenAPI 3.1 *meta-schema* (`$id: https://spec.openapis.org/oas/3.1/schema/2022-10-07`, no `paths`). So **there is no machine-readable Qloo spec**. We write our own Zod schemas from the markdown references, then validate them against live responses.

---

## 1. Host and authentication
| Fact | Status |
|---|---|
| Base URL **`https://hackathon.api.qloo.com`**. Hackathon keys fail (401) on `api.qloo.com` and `staging.api.qloo.com`. | 📄 [HG] |
| Header **`X-Api-Key: <key>`**. Not Bearer, not a query parameter. | 📄 [HG] |
| **GET with query-string params only.** "A POST with a JSON body fails." | 📄 [HG] |
| Rate and monthly quota limits exist. **No numbers are published.** Increases are available per user via Discord #api-help. | 📄 [HG] ❓ numbers |
| Keys stay active through judging and are deactivated afterwards | 📄 [HG] |
| Private server-side caching is allowed with no time limit. **Never put Qloo response data in a public repo.** | 📄 [HG] |
| The full response is always returned, including verbose `akas`. Fields can't be filtered. | 📄 [HG] |

Because only GET is allowed, every **POST-only parameter is unusable**: `signal.interests.entities.query`, `filter.exclude.entities.query`, multi-locality arrays for `*.location.query`, and per-tag weight objects. Entities must be resolved through `/search` first.

## 2. Endpoints

| Endpoint | Purpose for Sondo | Status |
|---|---|---|
| `GET /search?query=&types=&take=` | Resolve brand and anchor names to `entity_id`. Takes `take` 1–100 and `sort_by` match/distance/popularity. 404 means no results. | 📄 [HG][DP] |
| `GET /v2/tags?filter.query=&filter.tag.types=&take≤50` | Resolve interest, genre and cuisine tags. There is no static tag list [HG FAQ]. | 📄 |
| `GET /v2/tags/types` | Tag namespaces | 📄 [DP] ❓ on hackathon host |
| `GET /v2/audiences?filter.audience.types=&take≤50` | Audience IDs for `signal.demographics.audiences` | 📄 [DP] ❓ on hackathon host |
| `GET /v2/audiences/types` | Audience categories (communities, hobbies_and_interests, life_stage, lifestyle_preferences_beliefs, spending_habits, professional_area, …) | 📄 [DP] ❓ |
| `GET /v2/insights` (**core**) | Recommendations and affinities. `filter.type` is **required**. | 📄 [HG][DP] |
| `GET /v2/analysis/compare?a.signal.interests.entities=&b.signal.interests.entities=` | Compare two entity groups | 📄 [DP] ❓ response shape ❓ on hackathon host |
| `GET /v2/trending`, `/trends/category`, `/trends/entity` | Trends | 📄 [DP] ❓. Not in the MVP. |
| `/recommendations`, `/recs` | Legacy, **unsupported** | 📄 [HG] |
| `/v2/insights/search` | **Invalid path** | 📄 [HG] |

[HG] says "all Qloo endpoints are available" but only names `/v2/insights`, `/search` and `/v2/tags`. Everything else is ❓ until the spike runs.

## 3. Insights `filter.type` values
[HG] lists **artist, book, brand, destination, movie, person, place, podcast, tv_show, video_game** (all `urn:entity:*`). It adds: "403: Unsupported filter.type".

| Conflict | Detail | Status |
|---|---|---|
| ⚠ `urn:entity:video_game` vs `urn:entity:videogame` | [HG] uses the underscore form. The [DP] deep-dive enum and trending enum use `videogame`. | Spike checks both. Not needed for the MVP. |
| ⚠ `urn:tag` (taste analysis) | [DP] `taste-analysis.md` documents `filter.type=urn:tag`. [HG] doesn't list it, but says "Taste Analysis is a use of the Insights API". **It could return 403 on the hackathon host.** | ❓ Spike `insights:urn:tag` |
| ⚠ `urn:demographics` | [DP] `demographics-use-case.md` returns age and gender affinity distributions (range −1 to +1). Not listed in [HG]. | ❓ Spike `insights:urn:demographics` |
| `urn:heatmap` | [DP] `heatmaps-use-case.md`. Not listed in [HG]. Not in the MVP. | ❓ |

## 4. Insights parameters relevant to Sondo (all 📄 [DP] unless noted)

**Signals (what to base results on)**
- `signal.interests.entities`: comma-separated entity IDs, plus `signal.interests.entities.weight`.
- `signal.interests.tags`: comma-separated tag IDs, plus `.weight`.
- `signal.demographics.age`: enum, comma list of **`24_and_younger | 25_to_29 | 30_to_34 | 35_to_44 | 45_to_54 | 55_and_older`**, plus `.weight`.
- `signal.demographics.gender`: **`male | female`** only, plus `.weight`.
- `signal.demographics.audiences`: audience IDs from `/v2/audiences`, plus `.weight`. [HG] notes the FAQ has no list of valid values, so IDs must come from the lookup.
- `signal.location`: WKT POINT/POLYGON or a locality ID. `signal.location.query`: a fuzzy locality name ("Austin", "Lower East Side"). 400 if no locality is found. `signal.location.weight`, `signal.location.radius` (not recommended).
  - ⚠ The location use-case guide documents `signal.location*` for any `filter.type` (its example uses movie). The **per-type parameter matrix doesn't list `signal.location*` for any type**, and [HG] says invalid params are **silently ignored**. ❓ Spike `insights:signal.location.query` compares this against `insights:location-only` and checks for `query.locality` in the response.

**Filters (what kind of results)**
- `filter.type` (required), `filter.tags` plus `operator.filter.tags` (union by default, or intersection), `filter.exclude.tags`, `filter.exclude.entities`.
- `filter.popularity.min/max` (0–1 percentile). Useful for a "niche only" lens.
- `filter.results.entities`: score a *specific* set of entities against the signal. This is the documented way to "assess the affinity of an entity towards input". Useful to score the user's brand against an audience.
- **Place/destination only:** `filter.location`, `filter.location.query`, `filter.location.radius` (meters; 0 means strict), `filter.geocode.country_code|admin1_region|name`, `filter.price_level.min/max`, and others.
- Type-specific: `filter.release_year.*` (movie/tv), `filter.content_rating`, `filter.publication_year.*` (book), and others.

**Output**
- `take` (1–50, default 20), `page`, `offset`.
- `feature.explainability=true`: per result, `query.explainability` gives each **input entity's contribution (0–1)**. Top level, it gives aggregate influence for the top-N results. A warning is returned if it can't be computed.
- `bias.trends` = off|low|medium|high. Only some categories support it.
- `diversify.by`, `sort_by` (affinity|distance).

## 5. Response shape (documented examples only)
From [DP] `basic-insights-use-case.md` and `insights-with-location-use-case.md`:
```
{ success, results: { entities: [ {
    name, entity_id, type: "urn:entity", subtype: "urn:entity:movie",
    properties: { description, image.url, release_year, …, akas[], short_descriptions[] },
    popularity: 0.998,                     // 0–1 percentile
    tags: [ { id, name, type } ],
    query: { measurements: { audience_growth: -0.04 } },   // seen in one example
    disambiguation, external: { imdb, wikidata, … }
} ] }, duration }
```
- ❓ **`query.affinity` doesn't appear in any documented Insights entity example.** Heatmaps show `affinity` and `affinity_rank` (0–1). The concept docs describe affinity as "0–100 … expressed as a percentage" (the UI scale). **Whether, where and on what scale per-entity affinity is returned is the single most important check** (spike `ranges: query.affinity`). Fallback: rank position plus `popularity` plus explainability (see §8).
- Taste analysis returns `results.tags[] { tag_id, name, types, subtype, tag_value, query }`. In the documented example `query` is `{}`, so ❓ whether tag affinity is populated.
- Demographics returns `results.demographics[] { entity_id, query: { age: {bucket: −1..1}, gender: {male, female} } }`.
- Empty results come back as **200 with `entities: []`**, either from invalid params for the type (silently ignored) or from having no data [HG].

## 6. Errors [HG]
| Code | Meaning |
|---|---|
| 401 | Wrong host, or missing or bad `X-Api-Key` |
| 403 | Unsupported `filter.type` |
| 404 / "No path matching request parameters" | Wrong path or method |
| 400 "at least one valid signal or filter is required" | Invalid tag or audience values |
| 400 | Locality query not found [DP] |
| 429 | Rate limit [DP] |
| 200 + empty | Silently ignored params, or no data |

## 7. Interpreting affinity (what we may and may not claim)
From [DP] `interpreting-affinity-scores.md`, `affinity-score-methodology.md` and `faqs.md`:
- The meaning **depends on the query type**:
  - Entity signal: **cosine similarity of embeddings**, built from co-occurrence of anonymized behavioral signals.
  - Location: relevance of an entity *in that place compared with regional and global baselines*.
  - Taste analysis: how relevant a tag is to the taste vector.
- Scores are **normalized per query**. "Compare brands based on their relative position in the results, not just the raw score." Small gaps (91 vs 92) are not meaningful. Adding filters or demographics can lower absolute scores.
- "Not based on survey data or percentages of a sample." A score of 95 does **not** mean 95% of people.
- Data sources: TasteDive panel, third party, Qloo's entity DB, and licensed anonymized transactions. Qloo does not use PII.

**Sondo therefore must not claim:** purchase intent, conversion or ROI, causal campaign effects, audience size or share, "X% of your audience", or comparisons of raw scores across different queries. **Sondo may claim:** "Among [audience signal set], X ranks #n with high affinity (Qloo, query Q)", "X over-indexes for this audience compared with the location baseline (rank lift, Sondo-derived)", and "X has high affinity but low mainstream popularity (Sondo-derived heuristic)".

## 8. Capability matrix for Sondo

| Sondo need | Qloo mechanism | Status | Risk / fallback |
|---|---|---|---|
| Resolve brand and anchors | `/search` | 📄 | **A small or new brand may not exist in Qloo.** Fallback: seed with user anchors, peer brands and category tags. Never invent an ID. |
| Cross-category affinity | `/v2/insights` with `filter.type=X` and `signal.interests.entities` | 📄 core | Low |
| Audience shaping: age and gender | `signal.demographics.age/gender` | 📄 | Only 6 age buckets and binary gender. Any other attribute is flagged "not modeled". |
| Audience shaping: psychographic | `signal.demographics.audiences` via `/v2/audiences` | 📄 ❓ host | If unavailable, use age, gender and interest anchors only |
| Location / market | `signal.location.query` (all types?), `filter.location.query` (place/destination) | 📄 ⚠ | If the signal is ignored for non-place types, restrict location claims to place/destination and say so |
| Evidence strength | `query.affinity` ❓, rank 📄, `popularity` 📄 | ❓ | If affinity is absent, use rank-based evidence only. The UI shows rank and percentile, never a fabricated score. |
| Why a result appeared | `feature.explainability` | 📄 ❓ | Optional enrichment |
| Taste themes | `filter.type=urn:tag` | ⚠ ❓ | Fallback: aggregate `tags[]` across returned entities (frequency-weighted, Sondo-derived) |
| Demographic profile of the brand | `filter.type=urn:demographics` | ⚠ ❓ | Fallback: skip the section and show "not available on hackathon API" |
| Brand vs competitor | `/v2/analysis/compare` | 📄 ❓ shape | Fallback: two parallel Insights queries diffed deterministically |
| Audience lift | Two Insights calls (target signals vs baseline) | Derived | The key novel lens. Uses only core features. |
| Purchase intent, reach, ROI | — | **Not available** | Out of scope. Must not be claimed. |

## 9. Live feasibility spike
- Script: `spike/qloo-feasibility.ts`. Zero dependencies, Node ≥ 23.6 (native TS stripping). Typechecked with `tsc --strict --noUncheckedIndexedAccess --erasableSyntaxOnly` (passes).
- Run: `QLOO_API_KEY=… node spike/qloo-feasibility.ts` (PowerShell: `$env:QLOO_API_KEY="…"; node spike/qloo-feasibility.ts`)
- Safety: hackathon host only, at most 32 requests, 300 ms spacing, 15 s timeout, **aborts on the first 401**, stops on 429, never prints or writes the key.
- Output: `spike/output/feasibility-summary.json` contains statuses, latencies, counts, key-paths and numeric ranges. **No names, IDs or payloads**, so it's safe to commit.
- Dry run without a key (2026-10-15): exits with code 2 and makes no network calls. ✅

**Live results (2026-10-17, 30 requests, 29 OK, 1 intentional 400, no 401/403):**

| Check ID | Question answered | Result |
|---|---|---|
| `search:*` | Host and auth work. Brand resolution quality. What `/search` returns for an unknown brand. | 🧪 200 for all. Brands and artists resolve with `popularity` and `tags`. **An unknown brand returns unrelated popular brands, not 404**, so resolution needs a match-confidence check. |
| `tags:outdoor`, `audiences:*` | Tag and audience lookup availability and shape | 🧪 `/v2/tags` 200 (5 results). `/v2/audiences` search 200 (5 results). `/v2/audiences/types` 200. **Corrected in Phase 1b:** the shape is `results.audience_types[] {type, parents[]}` (10 types). |
| `insights:brand→{artist,movie,tv_show,podcast,place,book}` | Cross-category coverage, empties, **`query.affinity` presence and scale** | 🧪 All 6 types returned 10 results. **`query.affinity` is present on every result** (observed 0.90–0.98, clustered). `popularity` is present. `query.measurements.audience_growth` is present on most types and often 0. Book results have no tags. |
| `insights:explainability` | `query.explainability` shape | 🧪 200. `query.explainability` is present per result and at the top level (`$.query.explainability`). |
| `insights:demographics-signal`, `insights:audience-signal` | Demographic and audience signals change results | 🧪 200. The top-3 artists changed completely compared with the brand-only query. One comparison only, so it's suggestive, not measured. |
| `insights:signal.location.query`, `insights:filter.location.query`, `insights:location-only` | Location works for non-place types, or is silently ignored | 🧪 All 200 and all echo `query` at the top level. `signal.location.query` on artist only **reordered** the top 3 (weak effect). Location-only artist queries return locally relevant results (affinity ≈ 1.0). `filter.location.query` (place) returns local places. |
| `insights:urn:tag`, `insights:urn:demographics` | Taste analysis and demographics allowed on the hackathon host | 🧪 `urn:tag` 200 (10 tags with `query.affinity`). `urn:demographics` 200. **Corrected in Phase 1b:** the spike checked the wrong keys. The shape is `results.demographics[] {entity_id, query.age.<6 buckets>, query.gender.{male,female}}`, so it **works** (see §10). |
| `analysis:compare` | Compare availability and shape | 🧪 200, 24 results (tag-like). Shape still to map in Phase 1b. |
| `type-spelling:*` | `video_game` vs `videogame` | 🧪 **`urn:entity:videogame` works. `urn:entity:video_game` → 400** ("not supported for filter.type"). Note: 400, not the documented 403. |
| `failure:*` | Documented error and silent-ignore behavior | 🧪 An invalid tag returns **200 with 20 results** (silently ignored, not the documented 400). An unsupported param returns 200 (silently ignored). |
| `latency:repeat-*` | p50/p90 latency and variance. Sets our timeout and concurrency. | 🧪 Repeated query took about 1.4 s each time with no visible caching effect. Overall p50 662 ms, p90 1641 ms, max 3790 ms. |

**Go/no-go gates from the spike (needed before Phase 1 sign-off):**
1. **G1 (must):** `/search` resolves well-known brands, and `/v2/insights` returns non-empty results across ≥ 4 entity types for a brand signal.
2. **G2 (must):** each result carries a usable evidence field, either `query.affinity` or at least a stable rank plus `popularity`.
3. **G3 (should):** age and gender signals measurably change the ranking. This is required for "audience lift".
4. **G4 (should):** `signal.location.query` changes results for at least one non-place type. If not, scope location to place/destination.
5. **G5 (nice):** `urn:tag`, `urn:demographics`, compare and audiences are available.
6. p90 latency under 3 s, so a 30–40 call run fits in under 60 s with concurrency 4.

**Gate outcomes (2026-10-17):** G1 ✅ pass · G2 ✅ pass (`query.affinity` + `popularity`) · G3 🟡 likely (single comparison; confirm with eval briefs) · G4 🟡 weak for non-place types (scope location claims to place/destination plus location-only queries) · G5 🟡 partial (`urn:tag`, compare, audiences, tags OK; `urn:demographics` later confirmed in §10) · latency ✅ p90 1.6 s.

**Superseded by §10 for G3, G4 and G5.** **Design implications:** affinity values cluster tightly, so the UI leads with rank within a query, not raw affinity. Never trust a 200 as proof a param was applied. Brand resolution needs `matchConfidence` because search never returns empty for nonsense.

## 10. Verified capability matrix (Phase 1b, 2026-10-17)

Source: `pnpm probe` (28 live calls through `lib/qloo/*`, sanitized output in `scripts/output/probe-summary.json`) and `pnpm explore` on 3 scenarios (17–20 calls each). Legend: 🧪 verified live · 🟡 partial · ❌ unavailable.

| Capability | Status | Observation | Sondo usage |
|---|---|---|---|
| `/search` entity resolution | 🧪 | Brands, artists and podcasts resolve exactly. A nonsense query returns 3 unrelated results (never 404 in practice). An unknown-but-real name (e.g. a magazine searched as `brand`) returns nothing trusted. | `searchEntities`. Only `exact`/`close` matches are used as anchors. |
| Cross-category `/v2/insights` | 🧪 | 7 of 7 tested types returned 10 results for a brand signal (artist, movie, tv_show, podcast, book, place, brand). | `insights()` |
| `query.affinity` | 🧪 | Present on every result in every category. Clustered tightly within a query (e.g. 0.948–0.954). | Copied verbatim. The UI leads with rank. |
| `popularity` | 🧪 | Present on almost all results; some TV items lack it. Most lists sit at 0.95–1.0. | Copied verbatim; missing stays missing. |
| `feature.explainability` | 🧪 | 10 of 10 results carry `query.explainability.signal.interests.entities[] {entity_id, score}`. **Not in the per-type doc matrix.** | Mapped to refs in `EvidenceItem.explainability`. |
| Age/gender signals (G3) | 🧪 | Top-10 overlap with the brand-only baseline was 20% (artist) and 40% (podcast). | Audience lift is meaningful. |
| `signal.location.query` on non-place types (G4) | 🧪 | Location-only artist lists differ by city (NYC vs LA overlap 40%). Brand + location vs brand: podcast overlap 20%, artist overlap 80% (weaker). **Not in the per-type doc matrix.** | Allowed via the live-verified allowlist. Claims stay rank-based. |
| `filter.location.query` (place) | 🧪 | Returns local places. "New York" can resolve to the state (a Poughkeepsie hotel appeared); "New York City" stayed in the city. | Place categories use it. Briefs should name the city precisely. |
| `/v2/tags` | 🧪 | `results.tags[] {id, name, type, parents[]}` | `searchTags` |
| `/v2/audiences`, `/v2/audiences/types` | 🧪 | 10 audience types. An audience signal shifted the artist top-10 (60% overlap with baseline). | `searchAudiences`. Audience IDs come only from lookups. |
| Taste analysis (`urn:tag`) | 🧪 | 10 tags with `query.affinity`; `tag_id`, `subtype`, `types[]`. Tag names sometimes carry stray whitespace. | `tasteAnalysis` → tag evidence |
| `urn:demographics` | 🧪 | 6 of 6 age buckets plus gender, on a −1..1 scale. Several unrelated anchors showed a strong 30–34 dip, so read it as relative and model-specific, never as audience share. | `demographics()` → `DemographicProfile` |
| `/v2/analysis/compare` | 🟡 | 200 with 24–25 tag-like items with `query.score`. **The score's scale and meaning are undocumented.** | `compare()` is experimental and never becomes evidence. |
| `urn:entity:videogame` | 🧪 / ❌ | `videogame` works; `video_game` returns 400 (the docs say `video_game`, and say 403 for unsupported types). | Not used in the MVP. |

**Response-shape variance seen live (handled in `lib/qloo/schemas.ts`):** `tags: null` on some place results, and tag entries without `id` on some artist results. Tags are parsed leniently. Items missing required fields are skipped with a warning, and **Qloo's original rank positions are preserved**.

**Rate limiting:** a run with 4 concurrent requests and no spacing got 2 × 429 in 20 calls (the retries recovered). At concurrency 3 with no spacing there was 1 × 429. With 250 ms pacing between request starts there were 0 × 429 in a 20-call run (the spike's 300 ms spacing also saw none in 30 calls). Defaults are now concurrency 3, `minIntervalMs` 250, and 1 retry honouring `Retry-After`. The quota itself is still unpublished.

**Latency (probe):** p50 622 ms, p90 3.3 s, **max 10.6 s**, which is close to the 12 s timeout. The slow calls were the first queries for a category. Exploration runs: p50 0.7–1.0 s, max 2.7–4.3 s once paced.

**Docs vs live conflicts (resolved in favour of live):**
1. `signal.location.query` and `feature.explainability` work on entity types even though the per-type matrix omits them.
2. `videogame` is the working spelling, not `video_game`.
3. An unsupported type returns 400, not 403.
4. An invalid tag signal returns 200 with results, not the documented 400.
5. `/search` returns unrelated results instead of 404 for nonsense.

**Entity-resolution hazard (Phase 2 live run, 2026-10-17):** retrying an unresolved anchor across *all* types produced an exact-name match on an unrelated entity in another category. "Monocle" (a magazine), retried after failing as a brand, matched a **place** named Monocle that was apparently in Ukraine, and every downstream query skewed toward Ukrainian designers and artists. It recurred once more when the *model's* plan listed `place` as an alternate type. Rules now: retries use only the plan's alternate types, **never `place` or `destination`**, and untyped anchor searches exclude `place`. After the fix, "Monocle" resolved to the podcast *The Monocle Weekly* (close match), the actual Monocle media brand. An exact name is not proof of the right entity.

