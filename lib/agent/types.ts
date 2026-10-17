/**
 * Evidence and run-stream contracts from ARCHITECTURE.md §4 and §9. Types only;
 * the agent nodes, ledger and validateClaims() are Phase 2.
 */
import type { ToolCallRecord } from "@/lib/qloo/types";

export type EvidenceId = `E${number}`;

export type Quadrant = "mainstream_fit" | "distinctive_fit" | "weak_mainstream" | "long_tail";

/** Created only inside normalize() from a real Qloo response. */
export interface EvidenceItem {
  id: EvidenceId;
  callId: string;
  query: { filterType: string; signalSummary: string; variant: "target" | "baseline" | "deepen" };
  entity: {
    qlooId: string;
    name: string;
    type: string;
    imageUrl?: string;
    tags: { id: string; name: string }[];
  };
  /** 1-based position in that response. */
  rank: number;
  of: number;
  /** Copied verbatim from `query.affinity` when present (spike: present on insights results). */
  affinity?: number;
  /** Qloo percentile 0–1, copied verbatim. */
  popularity?: number;
  explainability?: { ref: string; contribution: number }[];
  /** Sondo heuristics — always labelled as such in the UI. */
  derived?: { lift?: number; newInTarget?: boolean; quadrant?: Quadrant };
}

export type NodeName =
  | "validateBrief"
  | "planResearch"
  | "resolve"
  | "explore"
  | "deepen"
  | "normalize"
  | "critique"
  | "strategize"
  | "validateClaims"
  | "repair"
  | "assembleReport";

export type RunStatus = "complete" | "partial" | "failed";

/** NDJSON stream contract for POST /api/runs (Phase 3). `plan.ready` lands with the plan schema in Phase 2. */
export type RunEvent =
  | { t: "run.started"; runId: string; budget: { qloo: number; llm: number } }
  | { t: "node.started" | "node.finished"; node: NodeName; ms?: number; summary?: string }
  | { t: "tool.call"; record: ToolCallRecord }
  | { t: "evidence.added"; count: number; category: string }
  | { t: "warning"; code: string; message: string }
  | { t: "run.finished"; runId: string; status: RunStatus };
