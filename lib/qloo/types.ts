/**
 * Qloo tool-layer contracts from ARCHITECTURE.md §3. Types only: the client,
 * per-type param allowlists, response schemas and normalize() land in Phase 1b,
 * built from the live shapes recorded in spike/output/feasibility-summary.json.
 */

/**
 * Entity types Sondo explores. Each maps to `urn:entity:<type>`.
 * Spike 2026-10-17: the video game type is spelled `videogame` (`video_game` → 400).
 * It is not used by the MVP, so it is intentionally absent here.
 */
export const ENTITY_TYPES = ["artist", "book", "brand", "destination", "movie", "person", "place", "podcast", "tv_show"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Qloo's six age buckets, exactly (`signal.demographics.age`). */
export const AGE_BUCKETS = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number];

/** Minted by Sondo when Qloo returns a result, so the LLM can only reference real things. */
export type RefId = `ref_${string}`;

export interface ResolvedRef {
  ref: RefId;
  kind: "entity" | "tag" | "audience" | "locality";
  /** From a parsed Qloo response — never from the LLM. */
  qlooId: string;
  name: string;
  entityType?: EntityType;
  /** Qloo percentile, 0–1. */
  popularity?: number;
  matchConfidence: "exact" | "close" | "weak";
  sourceCallId: string;
}

/** Audience shaping for an Insights query (ARCHITECTURE.md §3). */
export interface AudienceSignals {
  ages?: AgeBucket[];
  /** Qloo models binary gender only; set it only when the brief states it. */
  gender?: "male" | "female";
  audienceRefs?: RefId[];
  /** Passed as `signal.location.query` (live-verified; see QLOO_RESEARCH.md §10). */
  locationQuery?: string;
}

/** Key-free record of one Qloo request (path and params only). */
export interface ToolCallRecord {
  callId: string;
  node: string;
  tool: string;
  path: string;
  params: Record<string, string>;
  status: number | "timeout" | "error";
  latencyMs: number;
  cached: boolean;
  resultCount: number;
  retry: number;
  startedAt: string;
  error?: string;
}
