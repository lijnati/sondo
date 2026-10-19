/**
 * The last gate before a run is stored as `completed`: re-check the result against its
 * own ledger (lib/agent/eval-metrics.ts) instead of trusting the agent's status. Anything
 * that fails is stored as `partial`, with the reasons added to the report's warnings.
 */
import type { AgentBudget } from "@/lib/agent/budget";
import { runMetrics } from "@/lib/agent/eval-metrics";
import type { AgentRunResult } from "@/lib/agent/schemas";

export function integrityCheck(r: AgentRunResult, budget: AgentBudget): { ok: boolean; reasons: string[] } {
  const m = runMetrics(r.brief.brandName, "complete", r, budget);
  const reasons: string[] = [];
  if (m.citations.invalid) reasons.push(`${m.citations.invalid} citation(s) not in the evidence ledger`);
  if (m.citations.residualMismatches) reasons.push(`${m.citations.residualMismatches} citation(s) unrelated to their claim`);
  if (m.unsupportedEvidenceClaims) reasons.push(`${m.unsupportedEvidenceClaims} evidence claim(s) without a relevant citation`);
  if (m.concepts !== 3 || m.grounding.grounded !== 3) reasons.push("fewer than three grounded concepts");
  if (!m.budgets.qloo) reasons.push("Qloo call budget exceeded");
  if (!m.budgets.llm) reasons.push("model call budget exceeded");
  if (!m.budgets.adaptiveRounds) reasons.push("adaptive round budget exceeded");
  if (!m.budgets.wallClock) reasons.push("time budget exceeded");
  // An unknown cost (no price for the model) is not a failure; a known overrun is.
  if (r.usage.llm.estimatedCostUsd !== null && !m.budgets.cost) reasons.push("estimated cost limit exceeded");
  return { ok: reasons.length === 0, reasons };
}
