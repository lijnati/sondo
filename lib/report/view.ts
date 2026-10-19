/**
 * Pure helpers that turn a stored report into display decisions. Every number they
 * return is counted from the report's own ledger; nothing is estimated.
 */
import type { AgentRunResult, ClaimSupport, ValidatedClaim } from "@/lib/agent/schemas";
import { categoryLabel } from "@/lib/brief/labels";
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
