/**
 * Pure helpers that turn a stored report into display decisions. Every number they
 * return is counted from the report's own ledger; nothing is estimated.
 */
import type { AgentRunResult, ClaimSupport, ValidatedClaim } from "@/lib/agent/schemas";
import { categoryLabel } from "@/lib/brief/labels";
import type { Quadrant } from "@/lib/evidence/types";
import type { StoredRunStatus } from "@/lib/runs/events";

export type Badge = { kind: "direct" | "contextual" | "hypothesis"; label: string; title: string };

/**
 * Directly supported = an evidence claim whose citation names the item. Contextual = it
 * names the item's tag or category. Anything else is a hypothesis, even if it cites
 * something: weak citations are never shown as support.
 */
export function claimBadge(c: Pick<ValidatedClaim, "kind" | "support">): Badge {
  if (c.kind === "evidence" && c.support === "direct") return { kind: "direct", label: "Directly supported", title: "The cited Qloo result is named in this claim." };
  if (c.kind === "evidence" && c.support === "contextual") return { kind: "contextual", label: "Contextual support", title: "The claim names a tag or category of the cited Qloo result." };
  return { kind: "hypothesis", label: "Hypothesis", title: "A strategic bet. Related evidence is listed, but the claim is not asserted from it." };
}

export function ideaBadge(support: ClaimSupport): Badge {
  if (support === "direct") return { kind: "direct", label: "Cited partner", title: "The idea names the cited Qloo result." };
  if (support === "contextual") return { kind: "contextual", label: "Contextual", title: "The idea names a tag or category of the cited Qloo result." };
  return { kind: "hypothesis", label: "Creative idea", title: "A creative recommendation, not an evidence claim." };
}

export function ledgerStats(r: Pick<AgentRunResult, "evidence">): { results: number; categories: string[] } {
  const categories = [...new Set(r.evidence.map((e) => categoryLabel(e.query.filterType)))];
  return { results: r.evidence.length, categories };
}

export interface StatusInfo {
  label: string;
  tone: "good" | "warn" | "bad";
  /** Plain-language explanation shown in the banner; empty for a clean completion. */
  headline?: string;
}

export function statusInfo(status: StoredRunStatus, failureCode: string | null): StatusInfo {
  switch (status) {
    case "completed":
      return { label: "Complete", tone: "good" };
    case "partial":
      return { label: "Partial", tone: "warn", headline: "This report is partial. What is shown passed validation, but some research or concepts are missing." };
    case "cancelled":
      return { label: "Cancelled", tone: "bad", headline: "This run was cancelled before it finished. Research collected up to that point is shown." };
    case "interrupted":
      return { label: "Interrupted", tone: "bad", headline: "This run stopped unexpectedly before its report was saved." };
    case "running":
      return { label: "Running", tone: "warn" };
    case "failed":
      return {
        label: "Failed",
        tone: "bad",
        headline:
          failureCode === "qloo_unauthorized"
            ? "The data provider rejected the request, so no research could run."
            : failureCode === "report_write_failed"
              ? "The run finished but its report could not be saved."
              : "This run failed before it produced a report.",
      };
  }
}

/** E# → where it is cited, for the evidence drawer's "Cited in" list. */
export function citationIndex(r: Pick<AgentRunResult, "concepts" | "opportunities" | "findings">): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (ids: readonly string[], where: string) => {
    for (const id of ids) {
      const list = out.get(id) ?? [];
      if (!list.includes(where)) list.push(where);
      out.set(id, list);
    }
  };
  for (const f of r.findings) add(f.evidenceIds, `Finding ${f.id}`);
  for (const o of r.opportunities) add(o.rationale.evidenceIds, `Opportunity: ${o.title}`);
  for (const c of r.concepts) {
    add(c.culturalInsight.evidenceIds, `${c.name}: insight`);
    for (const cl of c.claims) add(cl.evidenceIds, `${c.name}: claim`);
    for (const o of c.opportunities) add(o.evidenceIds, `${c.name}: ${o.kind}`);
    add(c.textCitations, `${c.name}: named in text`);
  }
  return out;
}

// ── Report sections (Phase 4) ─────────────────────────────────────────────
// Every value below is read or counted from the stored ledger. Lift and quadrants are
// Sondo heuristics computed at research time (lib/evidence/lift.ts); nothing is new here.

type Finding = AgentRunResult["findings"][number];
type Ledger = AgentRunResult["evidence"];

const STRENGTH_ORDER: Record<Finding["strength"], number> = { strong: 0, moderate: 1, weak: 2 };
/** Finding kinds that describe a signal worth leading with (not gaps or conflicts). */
const HEADLINE_KINDS = new Set<Finding["kind"]>(["audience_lift", "distinctive", "affinity", "intersection", "theme"]);

/**
 * Up to `n` findings to open the report with: strongest first, preferring a spread of
 * categories so one category can't fill the summary. Statements are code-written.
 */
export function keyFindings(findings: readonly Finding[], n = 4): Finding[] {
  const ranked = findings
    .filter((f) => HEADLINE_KINDS.has(f.kind) && f.strength !== "weak" && f.evidenceIds.length)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => STRENGTH_ORDER[a.f.strength] - STRENGTH_ORDER[b.f.strength] || a.i - b.i)
    .map((x) => x.f);
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const f of ranked) {
    const key = f.category ?? f.kind;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length === n) return out;
  }
  for (const f of ranked) {
    if (out.length === n) break;
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

export function findingsByStrength(findings: readonly Finding[]): { strength: Finding["strength"]; items: Finding[] }[] {
  return (["strong", "moderate", "weak"] as const).map((strength) => ({ strength, items: findings.filter((f) => f.strength === strength) })).filter((g) => g.items.length);
}

export interface LiftRow {
  id: string;
  name: string;
  category: string;
  /** Position in the audience query. */
  targetRank: number;
  /** Position in the baseline query; undefined when the item is new in the audience query. */
  baselineRank?: number;
  of: number;
  lift: number;
  newInTarget: boolean;
}

/**
 * Audience-query items that rank higher for the audience than in the market baseline,
 * biggest movers first, then items absent from the baseline. Baseline rank is the
 * target rank plus the stored lift (lift = baselineRank − targetRank).
 */
export function liftRows(evidence: Ledger, limit = 8): LiftRow[] {
  const rows = evidence
    .filter((e) => e.query.variant === "target" && e.entity.kind === "entity" && e.derived && (e.derived.newInTarget || (e.derived.lift ?? 0) > 0))
    .map((e): LiftRow => {
      const isNew = !!e.derived?.newInTarget;
      const lift = e.derived?.lift ?? 0;
      return {
        id: e.id,
        name: e.entity.name,
        category: categoryLabel(e.query.filterType),
        targetRank: e.rank,
        ...(isNew ? {} : { baselineRank: e.rank + lift }),
        of: e.of,
        lift,
        newInTarget: isNew,
      };
    });
  const moved = rows.filter((r) => !r.newInTarget).sort((a, b) => b.lift - a.lift || a.targetRank - b.targetRank);
  const fresh = rows.filter((r) => r.newInTarget).sort((a, b) => a.targetRank - b.targetRank);
  return [...moved, ...fresh].slice(0, limit);
}

export interface DistinctPoint {
  id: string;
  name: string;
  category: string;
  popularity: number;
  /** rank / of: 0 is the top of its query, 1 the bottom. */
  position: number;
  rank: number;
  of: number;
  quadrant: Quadrant;
}

/** Audience-query entities with both a popularity percentile and a quadrant. */
export function distinctivenessPoints(evidence: Ledger): DistinctPoint[] {
  return evidence
    .filter((e) => e.query.variant === "target" && e.entity.kind === "entity" && e.popularity !== undefined && e.derived?.quadrant)
    .map((e) => ({
      id: e.id,
      name: e.entity.name,
      category: categoryLabel(e.query.filterType),
      popularity: e.popularity!,
      position: e.of > 1 ? (e.rank - 1) / (e.of - 1) : 0,
      rank: e.rank,
      of: e.of,
      quadrant: e.derived!.quadrant!,
    }));
}

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  distinctive_fit: "Distinctive fit",
  mainstream_fit: "Mainstream fit",
  long_tail: "Long tail",
  weak_mainstream: "Weak / mainstream",
};
