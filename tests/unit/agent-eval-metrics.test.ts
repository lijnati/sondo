import { describe, expect, it } from "vitest";

import { DEFAULT_AGENT_BUDGET } from "@/lib/agent/budget";
import { runMetrics } from "@/lib/agent/eval-metrics";
import type { AgentRunResult, ValidatedConcept } from "@/lib/agent/schemas";
import { Ledger, type EvidenceDraft } from "@/lib/evidence/ledger";

// Synthetic run result: fictional names, fake ids.
function evidence() {
  const l = new Ledger();
  const d = (name: string, qlooId: string, filterType: string): EvidenceDraft => ({
    callId: "Q1",
    query: { filterType, signalSummary: "s", variant: "target", inputRefs: [] },
    entity: { kind: "entity", qlooId, name, type: filterType, tags: [] },
    rank: 1,
    of: 10,
  });
  l.add([d("Fixture Artist One", "a1", "urn:entity:artist"), d("Fixture Podcast", "p1", "urn:entity:podcast"), d("Fixture Cafe", "c1", "urn:entity:place")]);
  return l.all();
}

function concept(patch: Partial<ValidatedConcept> = {}): ValidatedConcept {
  return {
    angle: "mainstream_anchor",
    name: "Concept",
    positioning: "p",
    intendedAudience: "a",
    culturalInsight: { text: "Fixture Artist One and Fixture Podcast stand out.", kind: "evidence", evidenceIds: ["E1", "E2"], support: "direct" },
    concept: "c",
    opportunities: [{ kind: "event", idea: "A night at Fixture Cafe.", evidenceIds: ["E3"], support: "direct" }],
    channels: ["events"],
    claims: [],
    assumptions: ["x"],
    risks: ["y"],
    grounding: "grounded",
    citedCategories: ["artist", "place", "podcast"],
    textCitations: [],
    notes: [],
    ...patch,
  };
}

function result(patch: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    runId: "r",
    status: "completed",
    model: "fixture/model",
    brief: {} as AgentRunResult["brief"],
    decisions: [],
    findings: [],
    opportunities: [],
    concepts: [concept()],
    evidence: evidence(),
    refs: [],
    trace: [],
    validation: { claimsChecked: 1, citationsAutoAttached: 0, downgradedToHypothesis: 0, removed: 0, mismatchedCitations: 0, repairAttempted: false, violations: [] },
    warnings: [],
    limitations: [],
    usage: {
      qloo: { calls: 10, cached: 0, budget: 24 },
      llm: { calls: 3, inputTokens: 1, outputTokens: 1, reasoningTokens: 0, estimatedCostUsd: 0, costSource: "price_table", byStage: [] },
      durationMs: 50_000,
    },
    startedAt: "",
    finishedAt: "",
    ...patch,
  };
}

describe("runMetrics", () => {
  it("passes a completed run with valid, relevant citations within budget", () => {
    const m = runMetrics("b", "complete", result(), DEFAULT_AGENT_BUDGET);
    expect(m).toMatchObject({ pass: true, citations: { total: 3, invalid: 0, residualMismatches: 0 }, unsupportedEvidenceClaims: 0 });
  });

  it("re-checks integrity itself instead of trusting claim labels", () => {
    const bad = concept({
      claims: [
        { text: "Fixture Artist One fans.", kind: "evidence", evidenceIds: ["E99"], support: "direct" }, // invalid id
        { text: "A pop-up at a neighborhood bakery and cafe.", kind: "evidence", evidenceIds: ["E1"], support: "direct" }, // mismatch
      ],
    });
    const m = runMetrics("b", "complete", result({ concepts: [bad] }), DEFAULT_AGENT_BUDGET);
    expect(m.pass).toBe(false);
    expect(m.citations.invalid).toBe(1);
    expect(m.citations.residualMismatches).toBe(1);
    expect(m.unsupportedEvidenceClaims).toBe(2);
  });

  it("fails a run that exceeds a budget or has unknown cost", () => {
    const over = result({ usage: { ...result().usage, qloo: { calls: 25, cached: 0, budget: 24 } } });
    expect(runMetrics("b", "complete", over, DEFAULT_AGENT_BUDGET).budgets.qloo).toBe(false);
    const unknown = result({ usage: { ...result().usage, llm: { ...result().usage.llm, estimatedCostUsd: null, costSource: "unknown" } } });
    expect(runMetrics("b", "complete", unknown, DEFAULT_AGENT_BUDGET).pass).toBe(false);
  });

  it("accepts an explained partial result for a degrade brief, but not a silent one", () => {
    const partial = result({ status: "partial", concepts: [], limitations: ["Not found in Qloo: Fixture Unknown Co."] });
    expect(runMetrics("b", "degrade", partial, DEFAULT_AGENT_BUDGET).pass).toBe(true);
    expect(runMetrics("b", "degrade", { ...partial, limitations: [] }, DEFAULT_AGENT_BUDGET).pass).toBe(false);
    expect(runMetrics("b", "complete", partial, DEFAULT_AGENT_BUDGET).pass).toBe(false);
  });
});
