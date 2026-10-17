/**
 * Per-endpoint parameter allowlists. Qloo silently ignores unsupported params
 * (QLOO_RESEARCH.md §1), so anything not listed here is dropped *before* the request
 * and reported, rather than trusted because the response was a 200.
 *
 * Sources:
 *  - "doc": docs-public reference/available-parameters-by-entity-type.md, get-search.md,
 *    taste-analysis.md, analysis-compare.md (fetched 2026-10-17).
 *  - "live": not in the per-type matrix, but observed to change results on the hackathon
 *    host (spike 2026-10-17 / Phase 1b probe). See QLOO_RESEARCH.md §9–10.
 */
import type { EntityType } from "./types";

export type ParamValue = string | number | boolean | readonly (string | number)[];
export type ParamInput = Record<string, ParamValue | undefined>;

export type InsightsFilterType = EntityType | "tag" | "demographics";

/** Sondo type → Qloo `filter.type` URN. */
export const FILTER_TYPE_URN: Record<InsightsFilterType, string> = {
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  brand: "urn:entity:brand",
  destination: "urn:entity:destination",
  movie: "urn:entity:movie",
  person: "urn:entity:person",
  place: "urn:entity:place",
  podcast: "urn:entity:podcast",
  tv_show: "urn:entity:tv_show",
  tag: "urn:tag",
  demographics: "urn:demographics",
};

/** Qloo URN → Sondo EntityType (for parsing `subtype` / `types[]`). */
export function entityTypeFromUrn(urn: string | undefined): EntityType | undefined {
  if (!urn) return undefined;
  const found = (Object.entries(FILTER_TYPE_URN) as [InsightsFilterType, string][]).find(([, u]) => u === urn);
  const t = found?.[0];
  return t && t !== "tag" && t !== "demographics" ? t : undefined;
}

// Present for every entity type in the doc matrix.
const ENTITY_COMMON = [
  "filter.type",
  "bias.trends",
  "filter.exclude.entities",
  "filter.exclude.tags",
  "operator.exclude.tags",
  "filter.external.exists",
  "operator.filter.external.exists",
  "filter.parents.types",
  "filter.popularity.min",
  "filter.popularity.max",
  "filter.results.entities",
  "filter.tags",
  "operator.filter.tags",
  "offset",
  "signal.demographics.age",
  "signal.demographics.audiences",
  "signal.demographics.audiences.weight",
  "signal.demographics.gender",
  "signal.interests.entities",
  "signal.interests.tags",
  "take",
] as const;

/** Live-verified on the hackathon host but absent from the per-type matrix. */
export const LIVE_VERIFIED_INSIGHTS_PARAMS = ["signal.location.query", "feature.explainability"] as const;

const GEO_FILTERS = [
  "filter.geocode.name",
  "filter.geocode.admin1_region",
  "filter.geocode.admin2_region",
  "filter.geocode.country_code",
  "filter.location",
  "filter.location.radius",
  // Not in the matrix (which lists filter.location); spike: returns local places.
  "filter.location.query",
] as const;

const INSIGHTS_EXTRA: Record<InsightsFilterType, readonly string[]> = {
  artist: [],
  book: ["filter.publication_year.min", "filter.publication_year.max"],
  brand: [],
  destination: GEO_FILTERS,
  movie: [
    "filter.content_rating",
    "filter.release_year.min",
    "filter.release_year.max",
    "filter.release_country",
    "filter.rating.min",
    "filter.rating.max",
  ],
  person: ["filter.gender", "filter.date_of_birth.min", "filter.date_of_birth.max"],
  place: [...GEO_FILTERS, "filter.price_level.min", "filter.price_level.max"],
  podcast: [],
  tv_show: [
    "filter.content_rating",
    "filter.release_year.min",
    "filter.release_year.max",
    "filter.release_country",
    "filter.rating.min",
    "filter.rating.max",
  ],
  // taste-analysis.md
  tag: [],
  demographics: [],
};

// Taste analysis (urn:tag): documented signals + its own filters.
const TAG_ANALYSIS = [
  "filter.type",
  "filter.tag.types",
  "filter.parents.types",
  "signal.interests.entities",
  "signal.interests.tags",
  "signal.demographics.audiences",
  "signal.demographics.age",
  "signal.demographics.gender",
  "signal.location.query",
  "take",
] as const;

// urn:demographics (demographics-use-case.md; shape confirmed live).
const DEMOGRAPHICS = ["filter.type", "signal.interests.entities", "signal.interests.tags"] as const;

export function insightsAllowlist(type: InsightsFilterType): ReadonlySet<string> {
  if (type === "tag") return new Set(TAG_ANALYSIS);
  if (type === "demographics") return new Set(DEMOGRAPHICS);
  return new Set([...ENTITY_COMMON, ...LIVE_VERIFIED_INSIGHTS_PARAMS, ...INSIGHTS_EXTRA[type]]);
}

export type Endpoint = "/search" | "/v2/tags" | "/v2/audiences" | "/v2/audiences/types" | "/v2/analysis/compare";

export const ENDPOINT_ALLOWLIST: Record<Endpoint, ReadonlySet<string>> = {
  "/search": new Set([
    "query",
    "types",
    "filter.location",
    "filter.radius",
    "filter.exists",
    "filter.tags",
    "filter.exclude.tags",
    "filter.popularity",
    "operator.filter.tags",
    "page",
    "take",
    "sort_by",
  ]),
  "/v2/tags": new Set(["filter.query", "filter.tag.types", "filter.parents.types", "take", "page"]),
  "/v2/audiences": new Set(["filter.audience.types", "filter.parents.types", "take", "page"]),
  "/v2/audiences/types": new Set(["filter.parents.types", "take", "page"]),
  "/v2/analysis/compare": new Set(["a.signal.interests.entities", "b.signal.interests.entities"]),
};

/** Upper bounds Sondo applies (documented maxima are higher). */
export const TAKE_CAP: Record<string, number> = {
  "/v2/insights": 25,
  "/search": 25,
  "/v2/tags": 50,
  "/v2/audiences": 50,
  "/v2/audiences/types": 50,
};

export interface BuiltParams {
  params: Record<string, string>;
  dropped: string[];
}

function serialize(value: ParamValue): string {
  if (Array.isArray(value)) return value.map(String).join(",");
  return String(value);
}

/** Filter to the allowlist, cap `take`, comma-join arrays, sort keys. Never throws on unknowns. */
export function buildParams(path: string, allow: ReadonlySet<string>, input: ParamInput): BuiltParams {
  const params: Record<string, string> = {};
  const dropped: string[] = [];
  for (const key of Object.keys(input).sort()) {
    const raw = input[key];
    if (raw === undefined) continue;
    if (Array.isArray(raw) && raw.length === 0) continue;
    if (!allow.has(key)) {
      dropped.push(key);
      continue;
    }
    let value = serialize(raw);
    if (key === "take") {
      const cap = TAKE_CAP[path];
      const n = Math.trunc(Number(raw));
      value = String(Math.max(1, cap ? Math.min(n, cap) : n));
    }
    params[key] = value;
  }
  return { params, dropped };
}

/** Canonical query string (sorted keys) — also the cache key input. */
export function toQueryString(params: Record<string, string>): string {
  const qs = new URLSearchParams();
  for (const key of Object.keys(params).sort()) qs.set(key, params[key] as string);
  return qs.toString();
}
