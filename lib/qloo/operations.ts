/**
 * Typed Qloo operations (ARCHITECTURE.md §3). Callers pass Sondo refs, never raw IDs;
 * every ref and evidence item originates from a parsed response. Params outside the
 * endpoint/type allowlist are dropped and surfaced as warnings.
 */
import type { DemographicProfile, EvidenceItem, EvidenceVariant } from "@/lib/evidence/types";
import { Ledger } from "@/lib/evidence/ledger";
import { normalizeDemographics, normalizeEntities, normalizeTags } from "@/lib/evidence/normalize";

import type { QlooClient } from "./client";
import { QlooError } from "./errors";
import {
  buildParams,
  ENDPOINT_ALLOWLIST,
  entityTypeFromUrn,
  FILTER_TYPE_URN,
  insightsAllowlist,
  type Endpoint,
  type InsightsFilterType,
  type ParamInput,
} from "./params";
import { RefRegistry } from "./refs";
import {
  AudiencesResponse,
  AudienceTypesResponse,
  CompareResponse,
  InsightsDemographicsResponse,
  InsightsEntitiesResponse,
  InsightsTagsResponse,
  parseList,
  SearchResponse,
  TagsResponse,
} from "./schemas";
import type { AudienceSignals, EntityType, RefId, ResolvedRef, ToolCallRecord } from "./types";

/** One research run: shared client (budget), ref registry and evidence ledger. */
export interface QlooSession {
  client: QlooClient;
  refs: RefRegistry;
  ledger: Ledger;
  node?: string;
  signal?: AbortSignal;
}

export function createSession(client: QlooClient, opts: { node?: string; signal?: AbortSignal } = {}): QlooSession {
  return { client, refs: new RefRegistry(), ledger: new Ledger(), ...opts };
}

interface CallMeta {
  record: ToolCallRecord;
  /** Params dropped by the allowlist — they would have been silently ignored by Qloo. */
  warnings: string[];
}

async function call(s: QlooSession, path: string, allow: ReadonlySet<string>, input: ParamInput, tool: string) {
  const { params, dropped } = buildParams(path, allow, input);
  const warnings = dropped.map((p) => `Dropped "${p}": not supported on ${path}${input["filter.type"] ? ` for ${input["filter.type"]}` : ""}`);
  const res = await s.client.get(path, params, {
    tool,
    ...(s.node ? { node: s.node } : {}),
    ...(s.signal ? { signal: s.signal } : {}),
  });
  return { body: res.body, record: res.record, warnings };
}

const endpoint = (e: Endpoint) => ENDPOINT_ALLOWLIST[e];

function skippedWarning(skipped: number, what: string): string[] {
  return skipped > 0 ? [`Skipped ${skipped} malformed ${what} result${skipped === 1 ? "" : "s"}`] : [];
}

// ── Entity discovery ─────────────────────────────────────────────────────

export async function searchEntities(
  s: QlooSession,
  input: { query: string; types: EntityType[]; take?: number },
): Promise<CallMeta & { refs: ResolvedRef[] }> {
  let res;
  try {
    res = await call(s, "/search", endpoint("/search"), {
      query: input.query,
      types: input.types.map((t) => FILTER_TYPE_URN[t]),
      take: input.take ?? 5,
    }, "searchEntities");
  } catch (err) {
    // /search documents 404 as "no results".
    if (err instanceof QlooError && err.kind === "not_found" && err.record) {
      return { refs: [], warnings: [`No Qloo entity matched "${input.query}"`], record: err.record };
    }
    throw err;
  }
  const { items: items, skipped } = parseList(SearchResponse, res.body, "/search");
  const warnings = [...res.warnings, ...skippedWarning(skipped, "/search")];
  const refs = items.map((it) => {
    const entityType = it.types.map(entityTypeFromUrn).find((t): t is EntityType => t !== undefined);
    return s.refs.mint({
      kind: "entity",
      qlooId: it.entity_id,
      name: it.name,
      sourceCallId: res.record.callId,
      query: input.query,
      ...(entityType ? { entityType } : {}),
      ...(it.popularity !== undefined ? { popularity: it.popularity } : {}),
    });
  });
  return { refs, record: res.record, warnings };
}

// ── Tags and audiences ───────────────────────────────────────────────────

export async function searchTags(
  s: QlooSession,
  input: { query: string; tagTypes?: string[]; parentTypes?: EntityType[]; take?: number },
): Promise<CallMeta & { refs: ResolvedRef[] }> {
  const res = await call(s, "/v2/tags", endpoint("/v2/tags"), {
    "filter.query": input.query,
    "filter.tag.types": input.tagTypes,
    "filter.parents.types": input.parentTypes?.map((t) => FILTER_TYPE_URN[t]),
    take: input.take ?? 10,
  }, "searchTags");
  const { items: items, skipped } = parseList(TagsResponse, res.body, "/v2/tags");
  const warnings = [...res.warnings, ...skippedWarning(skipped, "/v2/tags")];
  const refs = items.map((it) =>
    s.refs.mint({ kind: "tag", qlooId: it.id, name: it.name, sourceCallId: res.record.callId, query: input.query }),
  );
  return { refs, record: res.record, warnings };
}

export async function listAudienceTypes(s: QlooSession): Promise<CallMeta & { types: string[] }> {
  const res = await call(s, "/v2/audiences/types", endpoint("/v2/audiences/types"), { take: 50 }, "listAudienceTypes");
  const { items: items, skipped } = parseList(AudienceTypesResponse, res.body, "/v2/audiences/types");
  const warnings = [...res.warnings, ...skippedWarning(skipped, "/v2/audiences/types")];
  return { types: items.map((i) => i.type), record: res.record, warnings };
}

export async function searchAudiences(
  s: QlooSession,
  input: { audienceTypes: string[]; take?: number },
): Promise<CallMeta & { refs: ResolvedRef[] }> {
  const res = await call(s, "/v2/audiences", endpoint("/v2/audiences"), {
    "filter.audience.types": input.audienceTypes,
    take: input.take ?? 20,
  }, "searchAudiences");
  const { items: items, skipped } = parseList(AudiencesResponse, res.body, "/v2/audiences");
  const warnings = [...res.warnings, ...skippedWarning(skipped, "/v2/audiences")];
  const refs = items.map((it) => s.refs.mint({ kind: "audience", qlooId: it.id, name: it.name, sourceCallId: res.record.callId }));
  return { refs, record: res.record, warnings };
}

// ── Insights ─────────────────────────────────────────────────────────────

export interface InsightsInput {
  seedRefs?: RefId[];
  tagRefs?: RefId[];
  audience?: AudienceSignals;
  filterTagRefs?: RefId[];
  excludeTagRefs?: RefId[];
  /** filter.location.query — place/destination only (dropped elsewhere). */
  placeLocationQuery?: string;
  popularityMax?: number;
  explain?: boolean;
  take?: number;
  variant?: EvidenceVariant;
}

function describeSignals(s: QlooSession, input: InsightsInput): string {
  const parts: string[] = [];
  const names = (refs?: RefId[]) => (refs ?? []).map((r) => s.refs.get(r)?.name ?? r);
  if (input.seedRefs?.length) parts.push(names(input.seedRefs).join(" + "));
  if (input.tagRefs?.length) parts.push(`tags: ${names(input.tagRefs).join(", ")}`);
  const a = input.audience;
  if (a?.ages?.length) parts.push(`ages ${a.ages.join(", ")}`);
  if (a?.gender) parts.push(a.gender);
  if (a?.audienceRefs?.length) parts.push(`audiences: ${names(a.audienceRefs).join(", ")}`);
  if (a?.locationQuery) parts.push(`in ${a.locationQuery}`);
  if (input.placeLocationQuery) parts.push(`places in ${input.placeLocationQuery}`);
  if (input.popularityMax !== undefined) parts.push(`popularity ≤ ${input.popularityMax}`);
  return parts.join(" · ") || "no signals";
}

function insightsParams(s: QlooSession, type: InsightsFilterType, input: InsightsInput): ParamInput {
  const a = input.audience;
  return {
    "filter.type": FILTER_TYPE_URN[type],
    "signal.interests.entities": input.seedRefs ? s.refs.qlooIds(input.seedRefs, "entity") : undefined,
    "signal.interests.tags": input.tagRefs ? s.refs.qlooIds(input.tagRefs, "tag") : undefined,
    "signal.demographics.age": a?.ages,
    "signal.demographics.gender": a?.gender,
    "signal.demographics.audiences": a?.audienceRefs ? s.refs.qlooIds(a.audienceRefs, "audience") : undefined,
    "signal.location.query": a?.locationQuery,
    "filter.tags": input.filterTagRefs ? s.refs.qlooIds(input.filterTagRefs, "tag") : undefined,
    "filter.exclude.tags": input.excludeTagRefs ? s.refs.qlooIds(input.excludeTagRefs, "tag") : undefined,
    "filter.location.query": input.placeLocationQuery,
    "filter.popularity.max": input.popularityMax,
    "feature.explainability": input.explain ? true : undefined,
    take: input.take ?? 10,
  };
}

function inputRefs(input: InsightsInput): RefId[] {
  return [...(input.seedRefs ?? []), ...(input.tagRefs ?? []), ...(input.audience?.audienceRefs ?? [])];
}

export interface EvidenceResult extends CallMeta {
  items: EvidenceItem[];
  empty: boolean;
  filterType: string;
}

/** Cross-category affinity: entities of `type` related to the given signals. */
export async function insights(s: QlooSession, type: EntityType, input: InsightsInput): Promise<EvidenceResult> {
  const filterType = FILTER_TYPE_URN[type];
  const res = await call(s, "/v2/insights", insightsAllowlist(type), insightsParams(s, type, input), "insights");
  const { items: parsed, skipped, positions, total } = parseList(InsightsEntitiesResponse, res.body, "/v2/insights");
  const warnings = [...res.warnings, ...skippedWarning(skipped, "/v2/insights")];
  const items = s.ledger.add(
    normalizeEntities(parsed, {
      callId: res.record.callId,
      positions,
      total,
      filterType,
      variant: input.variant ?? "target",
      signalSummary: describeSignals(s, input),
      inputRefs: inputRefs(input),
      refs: s.refs,
    }),
  );
  if (items.length === 0) warnings.push(`No Qloo results for ${filterType} with ${describeSignals(s, input)}`);
  return { items, empty: items.length === 0, filterType, record: res.record, warnings };
}

/** Taste analysis: tags (themes) with affinity to the signals. */
export async function tasteAnalysis(
  s: QlooSession,
  input: InsightsInput & { tagTypes?: string[]; parentTypes?: EntityType[] },
): Promise<EvidenceResult> {
  const filterType = FILTER_TYPE_URN.tag;
  const params = {
    ...insightsParams(s, "tag", input),
    "filter.tag.types": input.tagTypes,
    "filter.parents.types": input.parentTypes?.map((t) => FILTER_TYPE_URN[t]),
  };
  const res = await call(s, "/v2/insights", insightsAllowlist("tag"), params, "tasteAnalysis");
  const { items: parsed, skipped, positions, total } = parseList(InsightsTagsResponse, res.body, "/v2/insights urn:tag");
  const warnings = [...res.warnings, ...skippedWarning(skipped, "/v2/insights urn:tag")];
  const items = s.ledger.add(
    normalizeTags(parsed, {
      callId: res.record.callId,
      positions,
      total,
      filterType,
      variant: input.variant ?? "target",
      signalSummary: describeSignals(s, input),
      inputRefs: inputRefs(input),
      refs: s.refs,
    }),
  );
  if (items.length === 0) warnings.push("Taste analysis returned no tags");
  return { items, empty: items.length === 0, filterType, record: res.record, warnings };
}

/** Age/gender affinity distribution for the seed entities (−1..1, not audience share). */
export async function demographics(
  s: QlooSession,
  input: { seedRefs: RefId[] },
): Promise<CallMeta & { profiles: DemographicProfile[] }> {
  const res = await call(
    s,
    "/v2/insights",
    insightsAllowlist("demographics"),
    { "filter.type": FILTER_TYPE_URN.demographics, "signal.interests.entities": s.refs.qlooIds(input.seedRefs, "entity") },
    "demographics",
  );
  const { items: parsed, skipped } = parseList(InsightsDemographicsResponse, res.body, "/v2/insights urn:demographics");
  const warnings = [...res.warnings, ...skippedWarning(skipped, "/v2/insights urn:demographics")];
  return { profiles: normalizeDemographics(parsed, res.record.callId, s.refs), record: res.record, warnings };
}

/**
 * EXPERIMENTAL. /v2/analysis/compare returns tag-like items with `query.score`, whose
 * scale and meaning are undocumented. Results are exposed for exploration only and are
 * never turned into evidence or claims.
 */
export async function compare(
  s: QlooSession,
  input: { aRefs: RefId[]; bRefs: RefId[] },
): Promise<CallMeta & { items: { name: string; qlooId: string; subtype?: string; score?: number }[]; scoreNote: string }> {
  const res = await call(s, "/v2/analysis/compare", endpoint("/v2/analysis/compare"), {
    "a.signal.interests.entities": s.refs.qlooIds(input.aRefs, "entity"),
    "b.signal.interests.entities": s.refs.qlooIds(input.bRefs, "entity"),
  }, "compare");
  const { items: parsed, skipped } = parseList(CompareResponse, res.body, "/v2/analysis/compare");
  const warnings = [...res.warnings, ...skippedWarning(skipped, "/v2/analysis/compare")];
  const items = parsed.flatMap((it) => {
    const qlooId = it.tag_id ?? it.entity_id;
    if (!qlooId) return [];
    const score = it.query?.score;
    return [{ name: it.name, qlooId, ...(it.subtype ? { subtype: it.subtype } : {}), ...(score !== undefined ? { score } : {}) }];
  });
  return { items, scoreNote: "Score scale and meaning are undocumented by Qloo; exploration only.", record: res.record, warnings };
}
