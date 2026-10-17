/**
 * Run-stream contracts from ARCHITECTURE.md §9. Types only; the agent nodes and
 * validateClaims() are Phase 2. The evidence model lives in lib/evidence/types.ts.
 */
import type { ToolCallRecord } from "@/lib/qloo/types";

export type { EvidenceId, EvidenceItem, Quadrant } from "@/lib/evidence/types";

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
