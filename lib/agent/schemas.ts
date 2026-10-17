/**
 * Agent artifacts (Phase 2). LLM-facing schemas keep every field required (nullable
 * instead of optional) so strict structured-output providers accept them. Evidence is
 * never duplicated here: artifacts reference ledger items by `E#` only.
 */
import { z } from "zod";

import type { EvidenceItem } from "@/lib/evidence/types";
import type { ResolvedRef, ToolCallRecord } from "@/lib/qloo/types";

import { AgeBucketEnum, type Brief, EntityTypeEnum } from "./brief";

export const EvidenceIdSchema = z.string().regex(/^E\d{1,4}$/, "evidence ids look like E12");

// ── Stage A: research plan ────────────────────────────────────────────────

/** What the model drafts. Code clamps it (plan.ts) before anything runs. */
export const ResearchPlanDraft = z.object({
  anchors: z
    .array(
      z.object({
        name: z.string().max(80),
        type: EntityTypeEnum,
        alternateTypes: z.array(EntityTypeEnum).max(2),
      }),
    )
    .max(6),
  peerBrands: z.array(z.string().max(80)).max(3),
  ages: z.array(AgeBucketEnum).max(3),
  gender: z.enum(["male", "female"]).nullable(),
  categories: z.array(EntityTypeEnum).min(1).max(6),
  researchQuestions: z.array(z.string().max(200)).min(1).max(4),
  notModeled: z.array(z.string().max(120)).max(8),
  rationale: z.string().max(500),
});
export type ResearchPlanDraft = z.infer<typeof ResearchPlanDraft>;

export interface PlannedAnchor {
  name: string;
  /** Empty = search across all MVP categories in one /search call. */
  types: z.infer<typeof EntityTypeEnum>[];
  alternateTypes: z.infer<typeof EntityTypeEnum>[];
  role: "brand" | "anchor" | "peer";
}

export interface ResearchPlan {
  source: "model" | "fallback";
  anchors: PlannedAnchor[];
  ages: z.infer<typeof AgeBucketEnum>[];
  gender?: "male" | "female";
  location: string;
  categories: z.infer<typeof EntityTypeEnum>[];
  researchQuestions: string[];
  notModeled: string[];
  rationale: string;
  /** What the clamp changed in the model's draft, and why. */
  adjustments: string[];
}

// ── Stage C: adaptive decisions ───────────────────────────────────────────

export type AdaptiveAction =
  | { tool: "exploreCategory"; category: z.infer<typeof EntityTypeEnum> }
  | { tool: "nicheLens"; category: z.infer<typeof EntityTypeEnum> }
  | { tool: "bridge"; evidenceId: string; targetCategory: z.infer<typeof EntityTypeEnum> }
  | { tool: "tasteThemes"; parentCategory: z.infer<typeof EntityTypeEnum> | null }
  | { tool: "retryAnchor"; name: string; types: z.infer<typeof EntityTypeEnum>[] }
  | { tool: "stop" };

export interface Decision {
  id: string;
  /** 0 = entity-resolution fallback, 1 = model round, 2 = rule round. */
  round: 0 | 1 | 2;
  proposedBy: "model" | "rule";
  action: AdaptiveAction;
  reason: string;
  outcome: "executed" | "rejected" | "skipped";
  outcomeReason?: string;
  evidenceAdded: number;
}

// ── Stage D: findings (deterministic) ─────────────────────────────────────

export type FindingKind =
  | "audience_lift"
  | "distinctive"
  | "affinity"
  | "intersection"
  | "theme"
  | "weak"
  | "conflict"
  | "gap";

export interface CulturalFinding {
  id: `F${number}`;
  kind: FindingKind;
  /** Code-written, digit-free statement. Numbers are rendered from the ledger. */
  statement: string;
  evidenceIds: string[];
  category?: string;
  strength: "strong" | "moderate" | "weak";
}

// ── Stage E: opportunities and concepts (model, then validated) ───────────

export const Claim = z.object({
  text: z.string().min(1).max(260),
  /** "evidence" = asserted from Qloo results (must cite). "hypothesis" = strategic bet. */
  kind: z.enum(["evidence", "hypothesis"]),
  evidenceIds: z.array(EvidenceIdSchema).max(6),
});
export type Claim = z.infer<typeof Claim>;

export const ANGLES = ["mainstream_anchor", "distinctive_niche", "cross_category_bridge"] as const;

export const CulturalOpportunity = z.object({
  title: z.string().max(90),
  rationale: Claim,
  findingIds: z.array(z.string().regex(/^F\d{1,3}$/)).max(5),
});
export type CulturalOpportunity = z.infer<typeof CulturalOpportunity>;

export const CampaignConcept = z.object({
  angle: z.enum(ANGLES),
  name: z.string().max(80),
  positioning: z.string().max(260),
  intendedAudience: z.string().max(220),
  culturalInsight: Claim,
  concept: z.string().max(450),
  opportunities: z
    .array(
      z.object({
        kind: z.enum(["partnership", "creative", "placement", "event"]),
        idea: z.string().max(200),
        evidenceIds: z.array(EvidenceIdSchema).max(4),
      }),
    )
    .min(1)
    .max(4),
  channels: z.array(z.string().max(60)).min(1).max(5),
  claims: z.array(Claim).min(1).max(6),
  assumptions: z.array(z.string().max(180)).min(1).max(4),
  risks: z.array(z.string().max(180)).min(1).max(4),
});
export type CampaignConcept = z.infer<typeof CampaignConcept>;

export const StrategyOutput = z.object({
  opportunities: z.array(CulturalOpportunity).min(1).max(5),
  concepts: z.array(CampaignConcept).min(1).max(3),
});
export type StrategyOutput = z.infer<typeof StrategyOutput>;

export type GroundingLevel = "grounded" | "partial" | "insufficient_evidence";

export interface ValidatedConcept extends CampaignConcept {
  grounding: GroundingLevel;
  /** Distinct ledger categories cited by this concept. */
  citedCategories: string[];
  /** E# auto-cited because a ledger entity is named in the concept's free text. */
  textCitations: string[];
  notes: string[];
}

// ── Run result ────────────────────────────────────────────────────────────

export type AgentRunStatus = "completed" | "partial" | "failed" | "cancelled";

export interface ValidationSummary {
  claimsChecked: number;
  citationsAutoAttached: number;
  downgradedToHypothesis: number;
  removed: number;
  repairAttempted: boolean;
  violations: string[];
}

export interface LlmUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  /** USD. `source` says whether this came from the gateway or the local price table. */
  estimatedCostUsd: number | null;
  costSource: "gateway" | "price_table" | "unknown";
  byStage: { stage: string; ms: number; inputTokens: number; outputTokens: number; ok: boolean; error?: string }[];
}

export interface AgentRunResult {
  runId: string;
  status: AgentRunStatus;
  model: string;
  brief: Brief;
  plan?: ResearchPlan;
  decisions: Decision[];
  findings: CulturalFinding[];
  opportunities: CulturalOpportunity[];
  concepts: ValidatedConcept[];
  evidence: readonly EvidenceItem[];
  refs: ResolvedRef[];
  trace: ToolCallRecord[];
  validation: ValidationSummary;
  warnings: string[];
  limitations: string[];
  usage: {
    qloo: { calls: number; cached: number; budget: number };
    llm: LlmUsage;
    durationMs: number;
  };
  startedAt: string;
  finishedAt: string;
}
