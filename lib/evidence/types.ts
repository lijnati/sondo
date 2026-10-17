/**
 * Evidence model (ARCHITECTURE.md §4). Phase 1b additions: `entity.kind`,
 * `query.inputRefs`, `missing`. Endpoint, params and retrieval time live on the
 * linked ToolCallRecord (`callId`) rather than being duplicated per item.
 */
import type { AgeBucket, RefId } from "@/lib/qloo/types";

export type EvidenceId = `E${number}`;

export type Quadrant = "mainstream_fit" | "distinctive_fit" | "weak_mainstream" | "long_tail";

export type EvidenceVariant = "target" | "baseline" | "deepen";

/** Fields Qloo did not return for this item — shown as "not available", never filled. */
export type MissingField = "affinity" | "popularity" | "tags" | "image";

/** Created only inside normalize() from a real, schema-validated Qloo response. */
export interface EvidenceItem {
  id: EvidenceId;
  callId: string;
  query: {
    /** Qloo filter.type URN, e.g. "urn:entity:podcast" or "urn:tag". */
    filterType: string;
    /** Human-readable signal description, e.g. "2 anchors · ages 25_to_29 · New York". */
    signalSummary: string;
    variant: EvidenceVariant;
    /** Sondo refs used as signals (entities, tags, audiences). */
    inputRefs: RefId[];
  };
  entity: {
    kind: "entity" | "tag";
    qlooId: string;
    name: string;
    /** Entity URN (e.g. "urn:entity:artist") or tag subtype (e.g. "urn:tag:genre:media"). */
    type: string;
    imageUrl?: string;
    tags: { id: string; name: string }[];
  };
  /** 1-based position in that response. */
  rank: number;
  of: number;
  /**
   * Copied verbatim from `query.affinity` when present. Qloo normalizes it per query
   * (QLOO_RESEARCH.md §7): compare ranks within a query, never raw scores across
   * queries, and never read it as a probability or purchase intent.
   */
  affinity?: number;
  /** Qloo popularity percentile 0–1, copied verbatim. */
  popularity?: number;
  /** Per input entity, Qloo's contribution score (feature.explainability). */
  explainability?: { ref: RefId; contribution: number }[];
  missing?: MissingField[];
  /** Sondo heuristics — always labelled as such in the UI. */
  derived?: { lift?: number; newInTarget?: boolean; quadrant?: Quadrant };
}

/**
 * Qloo `urn:demographics` output for a signal set. Values are copied verbatim and are
 * relative affinities on a −1..1 scale (demographics-use-case.md) — not audience shares.
 */
export interface DemographicProfile {
  callId: string;
  qlooId: string;
  ref?: RefId;
  age: Partial<Record<AgeBucket, number>>;
  gender: { male?: number; female?: number };
}
