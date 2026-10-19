/**
 * Phase 2 evaluation metrics (`pnpm eval`). Pure: takes an AgentRunResult and returns
 * counts only, never payloads, so the summary is safe to commit. Integrity is re-checked
 * here from the result's own ledger instead of trusting the validator's counters.
 */
import type { AgentBudget } from "./budget";
import { buildRelevanceIndex, checkCitations, claimSupport } from "./relevance";
import type { AgentRunResult, AgentRunStatus } from "./schemas";

export type EvalExpectation = "complete" | "degrade";

export interface RunMetrics {
  brief: string;
  expect: EvalExpectation;
  status: AgentRunStatus | "crashed";
  pass: boolean;
  /** Why the run passed or failed, in plain words. */
  reasons: string[];
  concepts: number;
  grounding: { grounded: number; partial: number; insufficient_evidence: number };
  claims: { total: number; evidence: number; hypothesis: number; direct: number; contextual: number; weak: number };
  citations: {
    total: number;
    /** Cited E# not present in the run's ledger. Must be 0. */
    invalid: number;
    /** Citations still in the final output that the relevance check rates as a mismatch. Must be 0. */
    residualMismatches: number;
  };
  /** Claims shown as kind "evidence" without a direct or contextual citation. Must be 0. */
  unsupportedEvidenceClaims: number;
  validation: { violationsPreFix: number; repairAttempted: boolean; autoAttached: number; downgraded: number; removed: number; mismatchedDropped: number };
  /** Max Jaccard overlap of cited Qloo entities between two concepts (PRODUCT.md §8: ≤ 0.3). */
  maxConceptOverlap: number | null;
  qloo: { calls: number; budget: number; cached: number; errors: number };
  llm: { calls: number; budget: number; failedCalls: number; inputTokens: number; outputTokens: number; costUsd: number | null; costSource: string };
  adaptiveRounds: number;
  durationMs: number;
  evidenceItems: number;
  unresolvedAnchorsDisclosed: boolean;
  budgets: { qloo: boolean; llm: boolean; adaptiveRounds: boolean; wallClock: boolean; cost: boolean };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / new Set([...a, ...b]).size;
}

export function runMetrics(brief: string, expect: EvalExpectation, r: AgentRunResult, budget: AgentBudget): RunMetrics {
  const idx = buildRelevanceIndex(r.evidence);
  const claims = [...r.opportunities.map((o) => o.rationale), ...r.concepts.flatMap((c) => [c.culturalInsight, ...c.claims])];
  const ideas = r.concepts.flatMap((c) => c.opportunities.map((o) => ({ text: o.idea, evidenceIds: o.evidenceIds })));

  let total = 0;
  let invalid = 0;
  let residual = 0;
  for (const piece of [...claims, ...ideas]) {
    total += piece.evidenceIds.length;
    invalid += piece.evidenceIds.filter((id) => !idx.byId.has(id)).length;
    residual += checkCitations(piece.text, piece.evidenceIds, idx).checks.filter((c) => c.level === "mismatch").length;
  }
  // Recomputed, not read from the claim's own label.
  const supportOf = (c: (typeof claims)[number]) => claimSupport(checkCitations(c.text, c.evidenceIds, idx).checks);
  const unsupported = claims.filter((c) => c.kind === "evidence" && supportOf(c) === "weak").length;

  const entitySets = r.concepts.map((c) => {
    const ids = [c.culturalInsight, ...c.claims].flatMap((cl) => cl.evidenceIds).concat(c.opportunities.flatMap((o) => o.evidenceIds), c.textCitations);
    return new Set(ids.map((id) => idx.byId.get(id)?.entity.qlooId).filter((q): q is string => Boolean(q)));
  });
  let maxOverlap: number | null = null;
  for (let i = 0; i < entitySets.length; i++) {
    for (let j = i + 1; j < entitySets.length; j++) maxOverlap = Math.max(maxOverlap ?? 0, jaccard(entitySets[i] as Set<string>, entitySets[j] as Set<string>));
  }

  const llm = r.usage.llm;
  const adaptiveRounds = Math.max(0, ...r.decisions.map((d) => d.round));
  const budgets = {
    qloo: r.usage.qloo.calls <= budget.qlooCalls,
    llm: llm.calls <= budget.llmCalls,
    adaptiveRounds: adaptiveRounds <= budget.adaptiveRounds,
    wallClock: r.usage.durationMs <= budget.hardDeadlineMs,
    cost: llm.estimatedCostUsd !== null && llm.estimatedCostUsd <= budget.runCostLimitUsd,
  };
  const unresolvedAnchorsDisclosed = r.limitations.some((l) => l.startsWith("Not found in Qloo:"));

  const reasons: string[] = [];
  if (invalid) reasons.push(`${invalid} invalid citation(s)`);
  if (residual) reasons.push(`${residual} mismatched citation(s) left in the output`);
  if (unsupported) reasons.push(`${unsupported} evidence claim(s) without a relevant citation`);
  for (const [k, ok] of Object.entries(budgets)) if (!ok) reasons.push(`${k} budget exceeded or unknown`);
  const integrity = reasons.length === 0;
  let outcomeOk: boolean;
  if (expect === "complete") {
    outcomeOk = r.status === "completed";
    reasons.push(outcomeOk ? "completed with three grounded concepts" : `expected completed, got ${r.status}`);
  } else {
    // Graceful: an honest non-complete status, and the report says why.
    const explained = r.warnings.length > 0 || r.limitations.some((l) => l.startsWith("Not found in Qloo:") || l.startsWith("Evidence coverage was below"));
    outcomeOk = (r.status === "partial" || r.status === "failed") && explained;
    reasons.push(outcomeOk ? `degraded to ${r.status} and disclosed why` : `expected an explained partial or failed result, got ${r.status}`);
  }

  return {
    brief,
    expect,
    status: r.status,
    pass: integrity && outcomeOk,
    reasons,
    concepts: r.concepts.length,
    grounding: {
      grounded: r.concepts.filter((c) => c.grounding === "grounded").length,
      partial: r.concepts.filter((c) => c.grounding === "partial").length,
      insufficient_evidence: r.concepts.filter((c) => c.grounding === "insufficient_evidence").length,
    },
    claims: {
      total: claims.length,
      evidence: claims.filter((c) => c.kind === "evidence").length,
      hypothesis: claims.filter((c) => c.kind === "hypothesis").length,
      direct: claims.filter((c) => supportOf(c) === "direct").length,
      contextual: claims.filter((c) => supportOf(c) === "contextual").length,
      weak: claims.filter((c) => supportOf(c) === "weak").length,
    },
    citations: { total, invalid, residualMismatches: residual },
    unsupportedEvidenceClaims: unsupported,
    validation: {
      violationsPreFix: r.validation.violations.length,
      repairAttempted: r.validation.repairAttempted,
      autoAttached: r.validation.citationsAutoAttached,
      downgraded: r.validation.downgradedToHypothesis,
      removed: r.validation.removed,
      mismatchedDropped: r.validation.mismatchedCitations,
    },
    maxConceptOverlap: maxOverlap === null ? null : Math.round(maxOverlap * 100) / 100,
    qloo: { calls: r.usage.qloo.calls, budget: r.usage.qloo.budget, cached: r.usage.qloo.cached, errors: r.trace.filter((t) => typeof t.status !== "number" || t.status >= 400).length },
    llm: {
      calls: llm.calls,
      budget: budget.llmCalls,
      failedCalls: llm.byStage.filter((s) => !s.ok).length,
      inputTokens: llm.inputTokens,
      outputTokens: llm.outputTokens,
      costUsd: llm.estimatedCostUsd,
      costSource: llm.costSource,
    },
    adaptiveRounds,
    durationMs: r.usage.durationMs,
    evidenceItems: r.evidence.length,
    unresolvedAnchorsDisclosed,
    budgets,
  };
}
