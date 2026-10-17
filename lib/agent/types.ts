/**
 * Run-stream contracts from ARCHITECTURE.md §9, extended in Phase 2 for agent decisions.
 * Events describe what was proposed and what actually ran; they never carry model
 * reasoning, secrets or raw Qloo payloads. The evidence model lives in lib/evidence.
 */
import type { ToolCallRecord } from "@/lib/qloo/types";

import type { ModelStage } from "./budget";
import type { AgentRunStatus, Decision } from "./schemas";

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

/** @deprecated Phase 1 name; use AgentRunStatus. */
export type RunStatus = AgentRunStatus;

export type RunEvent =
  | { t: "run.started"; runId: string; budget: { qloo: number; llm: number } }
  | { t: "node.started" | "node.finished"; node: NodeName; ms?: number; summary?: string }
  | { t: "plan.ready"; source: "model" | "fallback"; categories: string[]; anchors: string[]; adjustments: string[] }
  | { t: "tool.call"; record: ToolCallRecord }
  | { t: "evidence.added"; count: number; category: string }
  | { t: "decision"; decision: Decision }
  | { t: "finding.added"; count: number }
  | { t: "llm.call"; stage: ModelStage; ok: boolean; ms: number; inputTokens: number; outputTokens: number; error?: string }
  | { t: "claims.validated"; checked: number; autoCited: number; downgraded: number; removed: number; repaired: boolean }
  | { t: "warning"; code: string; message: string }
  | { t: "run.finished"; runId: string; status: AgentRunStatus };
