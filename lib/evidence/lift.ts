/**
 * Sondo heuristics (ARCHITECTURE.md §2.1). Deterministic, computed only from ranks and
 * popularity inside one query pair, and always labelled "Sondo heuristic" in the UI.
 */
import type { EvidenceItem, Quadrant } from "./types";

export interface LiftResult {
  qlooId: string;
  targetRank: number;
  baselineRank: number;
  /** Rank movement: positive = ranks higher for the target audience than the baseline. */
  lift: number;
  /** Absent from the baseline list (treated as rank `baselineSize + 1`). */
  newInTarget: boolean;
}

/** Pair a target query with its baseline (same filter.type, same anchors, no audience). */
export function computeLift(target: readonly EvidenceItem[], baseline: readonly EvidenceItem[]): LiftResult[] {
  const baseRank = new Map(baseline.map((b) => [b.entity.qlooId, b.rank]));
  // Qloo's original list length (items may have been skipped as malformed).
  const absentRank = (baseline[0]?.of ?? baseline.length) + 1;
  return target.map((t) => {
    const b = baseRank.get(t.entity.qlooId);
    const baselineRank = b ?? absentRank;
    return { qlooId: t.entity.qlooId, targetRank: t.rank, baselineRank, lift: baselineRank - t.rank, newInTarget: b === undefined };
  });
}

/** Share of the baseline list that also appears in the target list (0–1). */
export function overlap(a: readonly EvidenceItem[], b: readonly EvidenceItem[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const ids = new Set(a.map((x) => x.entity.qlooId));
  return b.filter((x) => ids.has(x.entity.qlooId)).length / b.length;
}

/**
 * Popularity percentile below which an entity counts as "distinctive". Absolute, not
 * per-list: live lists are often all ≥ 0.95, and a per-list median then labels 0.99
 * as niche (Phase 1b exploration). Tunable; always shown as a Sondo heuristic.
 */
export const DISTINCTIVE_POPULARITY_MAX = 0.9;

/**
 * Quadrant within one query. Fit uses rank position (top half), not raw affinity:
 * live affinities cluster tightly (0.90–0.98) and Qloo advises comparing positions.
 * Distinctive = popularity below DISTINCTIVE_POPULARITY_MAX. Items without popularity
 * get no quadrant rather than a guessed one.
 */
export function assignQuadrants(items: readonly EvidenceItem[], popularityMax = DISTINCTIVE_POPULARITY_MAX): Map<string, Quadrant> {
  const out = new Map<string, Quadrant>();
  for (const it of items) {
    if (it.popularity === undefined) continue;
    const highFit = it.rank <= Math.ceil(it.of / 2);
    const niche = it.popularity < popularityMax;
    out.set(it.id, highFit ? (niche ? "distinctive_fit" : "mainstream_fit") : niche ? "long_tail" : "weak_mainstream");
  }
  return out;
}
