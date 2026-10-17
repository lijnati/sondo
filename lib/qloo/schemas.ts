/**
 * Zod schemas for the Qloo response fields Sondo reads — nothing more. Shapes come from
 * live key-paths (spike 2026-10-17, Phase 1b probe), not from guesses; unknown fields
 * are stripped. Numbers may be absent or null and stay undefined, never defaulted.
 */
import { z } from "zod";

import { QlooError } from "./errors";

const num = z.number().nullish().transform((v) => v ?? undefined);
const str = z.string().nullish().transform((v) => v ?? undefined);

/** Locate the result array; some endpoints nest it under a key that varies. */
function listUnder<T extends z.ZodType>(item: T, keys: readonly string[]) {
  return z.object({ results: z.unknown() }).transform((body, ctx) => {
    const r = body.results;
    if (Array.isArray(r)) return { item, raw: r as unknown[] };
    if (r && typeof r === "object") {
      for (const k of keys) {
        const v = (r as Record<string, unknown>)[k];
        if (Array.isArray(v)) return { item, raw: v as unknown[] };
      }
    }
    ctx.addIssue({ code: "custom", message: `expected results.{${keys.join("|")}}[]` });
    return z.NEVER;
  });
}

/**
 * Tags as returned live: sometimes `null`, sometimes with entries missing `id`
 * (Phase 1b probe). Malformed entries are dropped rather than failing the entity.
 */
function lenientTags<T extends z.ZodType>(tag: T) {
  return z
    .array(z.unknown())
    .nullish()
    .transform((arr) => (arr ?? []).flatMap((t) => {
      const r = tag.safeParse(t);
      return r.success ? [r.data as z.output<T>] : [];
    }));
}

// ── /search ────────────────────────────────────────────────────────────────
export const SearchItem = z.object({
  entity_id: z.string(),
  name: z.string(),
  types: z.array(z.string()).optional().default([]),
  popularity: num,
  disambiguation: str,
  tags: lenientTags(z.object({ tag_id: z.string(), name: z.string(), type: str })),
});
// /search: `results` is the array itself.
export const SearchResponse = listUnder(SearchItem, []);

// ── /v2/tags ──────────────────────────────────────────────────────────────
export const TagItem = z.object({
  id: z.string(),
  name: z.string(),
  type: str,
  popularity: num,
  parents: z.array(z.object({ type: z.string() })).optional().default([]),
});
export const TagsResponse = listUnder(TagItem, ["tags"]);

// ── /v2/audiences, /v2/audiences/types ───────────────────────────────────
export const AudienceItem = z.object({
  id: z.string(),
  name: z.string(),
  type: str,
  parents: z.array(z.object({ id: str, name: str, type: str })).optional().default([]),
});
export const AudiencesResponse = listUnder(AudienceItem, ["audiences", "entities"]);

export const AudienceTypeItem = z.object({
  type: z.string(),
  parents: z.array(z.object({ type: z.string() })).optional().default([]),
});
export const AudienceTypesResponse = listUnder(AudienceTypeItem, ["audience_types"]);

// ── /v2/insights: entity results ──────────────────────────────────────────
const ExplainEntry = z.object({ entity_id: z.string(), score: z.number() });
// Live key-path is `query.explainability.signal.interests.entities[]`; accept either the
// nested form or a literal dotted key, since key-path flattening can't tell them apart.
const Explainability = z
  .unknown()
  .transform((v) => {
    if (!v || typeof v !== "object") return undefined;
    const o = v as Record<string, unknown>;
    const nested = (o.signal as { interests?: { entities?: unknown } } | undefined)?.interests?.entities;
    return nested ?? o["signal.interests.entities"];
  })
  .pipe(z.array(ExplainEntry).optional());

export const InsightsEntity = z.object({
  entity_id: z.string(),
  name: z.string(),
  subtype: str,
  popularity: num,
  query: z
    .object({
      affinity: num,
      measurements: z.object({ audience_growth: num }).optional(),
      explainability: Explainability.optional(),
    })
    .optional(),
  tags: lenientTags(z.object({ id: z.string(), name: z.string(), type: str })),
  properties: z.object({ image: z.object({ url: str }).nullish() }).nullish(),
});
export const InsightsEntitiesResponse = listUnder(InsightsEntity, ["entities"]);

// ── /v2/insights filter.type=urn:tag (taste analysis) ─────────────────────
export const InsightsTag = z.object({
  tag_id: z.string(),
  name: z.string(),
  subtype: str,
  tag_value: str,
  types: z.array(z.string()).optional().default([]),
  popularity: num,
  query: z.object({ affinity: num }).nullish(),
});
export const InsightsTagsResponse = listUnder(InsightsTag, ["tags"]);

// ── /v2/insights filter.type=urn:demographics ─────────────────────────────
const AGE_KEYS = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;
export const InsightsDemographics = z.object({
  entity_id: z.string(),
  query: z.object({
    age: z.object(Object.fromEntries(AGE_KEYS.map((k) => [k, num])) as Record<(typeof AGE_KEYS)[number], typeof num>).optional(),
    gender: z.object({ male: num, female: num }).optional(),
  }),
});
export const InsightsDemographicsResponse = listUnder(InsightsDemographics, ["demographics"]);

// ── /v2/analysis/compare (experimental: score meaning undocumented) ────────
export const CompareItem = z.object({
  tag_id: str,
  entity_id: str,
  name: z.string(),
  subtype: str,
  popularity: num,
  query: z.object({ score: num }).nullish(),
});
export const CompareResponse = listUnder(CompareItem, ["tags", "entities"]);

export interface ParsedList<T> {
  items: T[];
  /** 1-based position of each item in Qloo's original list (preserved across skips). */
  positions: number[];
  /** Length of Qloo's original list. */
  total: number;
  /** Items skipped because a required field was missing or malformed. */
  skipped: number;
}

/**
 * Parse a list response. The container must match (else `invalid_response`); items that
 * fail validation are skipped and counted, unless every item fails.
 */
export function parseList<T extends z.ZodType>(
  schema: z.ZodType<{ item: T; raw: unknown[] }, unknown>,
  body: unknown,
  what: string,
): ParsedList<z.output<T>> {
  const container = schema.safeParse(body);
  if (!container.success) throw invalid(what, container.error);
  const { item, raw } = container.data;
  const items: z.output<T>[] = [];
  const positions: number[] = [];
  let firstError: z.ZodError | undefined;
  raw.forEach((r, i) => {
    const parsed = item.safeParse(r);
    if (parsed.success) {
      items.push(parsed.data as z.output<T>);
      positions.push(i + 1);
    } else firstError ??= parsed.error;
  });
  if (raw.length > 0 && items.length === 0 && firstError) throw invalid(what, firstError);
  return { items, positions, total: raw.length, skipped: raw.length - items.length };
}

function invalid(what: string, error: z.ZodError): QlooError {
  const first = error.issues[0];
  return new QlooError("invalid_response", `Unexpected ${what} response shape at ${first?.path.join(".") || "root"}: ${first?.message ?? "invalid"}`);
}
