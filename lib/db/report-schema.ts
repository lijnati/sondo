/**
 * Zod mirror of AgentRunResult for the database boundary: every report is parsed before
 * it is written and again when it is read back. The compile-time check at the bottom
 * fails if AgentRunResult gains a shape this schema rejects; the round-trip test in
 * tests/unit/db-runs.test.ts fails if the schema silently drops a field.
 */
import { z } from "zod";

import { AgeBucketEnum, Brief, EntityTypeEnum } from "@/lib/agent/brief";
import { ANGLES, type AgentRunResult } from "@/lib/agent/schemas";

const EvidenceId = z.string().regex(/^E\d{1,4}$/);
const RefId = z.string().regex(/^ref_[\w-]+$/);
const Support = z.enum(["direct", "contextual", "weak"]);

const EvidenceItem = z.object({
  id: EvidenceId,
  callId: z.string(),
  query: z.object({
    filterType: z.string(),
    signalSummary: z.string(),
    variant: z.enum(["target", "baseline", "deepen"]),
    inputRefs: z.array(RefId),
  }),
  entity: z.object({
    kind: z.enum(["entity", "tag"]),
    qlooId: z.string(),
    name: z.string(),
    type: z.string(),
    imageUrl: z.string().optional(),
    tags: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
  rank: z.number().int().min(1),
  of: z.number().int().min(0),
  affinity: z.number().optional(),
  popularity: z.number().optional(),
  explainability: z.array(z.object({ ref: RefId, contribution: z.number() })).optional(),
  missing: z.array(z.enum(["affinity", "popularity", "tags", "image"])).optional(),
  derived: z
    .object({
      lift: z.number().optional(),
      newInTarget: z.boolean().optional(),
      quadrant: z.enum(["mainstream_fit", "distinctive_fit", "weak_mainstream", "long_tail"]).optional(),
    })
    .optional(),
});

const ResolvedRef = z.object({
  ref: RefId,
  kind: z.enum(["entity", "tag", "audience", "locality"]),
  qlooId: z.string(),
  name: z.string(),
  entityType: EntityTypeEnum.optional(),
  popularity: z.number().optional(),
  matchConfidence: z.enum(["exact", "close", "weak"]),
  sourceCallId: z.string(),
});

const ToolCallRecord = z.object({
  callId: z.string(),
  node: z.string(),
  tool: z.string(),
  path: z.string(),
  params: z.record(z.string(), z.string()),
  status: z.union([z.number(), z.literal("timeout"), z.literal("error")]),
  latencyMs: z.number(),
  cached: z.boolean(),
  resultCount: z.number(),
  retry: z.number(),
  startedAt: z.string(),
  error: z.string().optional(),
});

const PlannedAnchor = z.object({
  name: z.string(),
  types: z.array(EntityTypeEnum),
  alternateTypes: z.array(EntityTypeEnum),
  role: z.enum(["brand", "anchor", "peer"]),
});

const ResearchPlan = z.object({
  source: z.enum(["model", "fallback"]),
  anchors: z.array(PlannedAnchor),
  ages: z.array(AgeBucketEnum),
  gender: z.enum(["male", "female"]).optional(),
  location: z.string(),
  categories: z.array(EntityTypeEnum),
  researchQuestions: z.array(z.string()),
  notModeled: z.array(z.string()),
  rationale: z.string(),
  adjustments: z.array(z.string()),
});

const AdaptiveAction = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("exploreCategory"), category: EntityTypeEnum }),
  z.object({ tool: z.literal("nicheLens"), category: EntityTypeEnum }),
  z.object({ tool: z.literal("bridge"), evidenceId: z.string(), targetCategory: EntityTypeEnum }),
  z.object({ tool: z.literal("tasteThemes"), parentCategory: EntityTypeEnum.nullable() }),
  z.object({ tool: z.literal("retryAnchor"), name: z.string(), types: z.array(EntityTypeEnum) }),
  z.object({ tool: z.literal("stop") }),
]);

const Decision = z.object({
  id: z.string(),
  round: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  proposedBy: z.enum(["model", "rule"]),
  action: AdaptiveAction,
  reason: z.string(),
  outcome: z.enum(["executed", "rejected", "skipped"]),
  outcomeReason: z.string().optional(),
  evidenceAdded: z.number(),
});

const Finding = z.object({
  id: z.string().regex(/^F\d{1,3}$/),
  kind: z.enum(["audience_lift", "distinctive", "affinity", "intersection", "theme", "weak", "conflict", "gap"]),
  statement: z.string(),
  evidenceIds: z.array(z.string()),
  category: z.string().optional(),
  strength: z.enum(["strong", "moderate", "weak"]),
});

const ValidatedClaim = z.object({
  text: z.string(),
  kind: z.enum(["evidence", "hypothesis"]),
  evidenceIds: z.array(EvidenceId),
  support: Support,
});

const ValidatedOpportunity = z.object({
  title: z.string(),
  rationale: ValidatedClaim,
  findingIds: z.array(z.string()),
});

const ValidatedConcept = z.object({
  angle: z.enum(ANGLES),
  name: z.string(),
  positioning: z.string(),
  intendedAudience: z.string(),
  culturalInsight: ValidatedClaim,
  concept: z.string(),
  opportunities: z.array(
    z.object({
      kind: z.enum(["partnership", "creative", "placement", "event"]),
      idea: z.string(),
      evidenceIds: z.array(EvidenceId),
      support: Support,
    }),
  ),
  channels: z.array(z.string()),
  claims: z.array(ValidatedClaim),
  assumptions: z.array(z.string()),
  risks: z.array(z.string()),
  grounding: z.enum(["grounded", "partial", "insufficient_evidence"]),
  citedCategories: z.array(z.string()),
  textCitations: z.array(z.string()),
  notes: z.array(z.string()),
});

const LlmUsage = z.object({
  calls: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  reasoningTokens: z.number(),
  estimatedCostUsd: z.number().nullable(),
  costSource: z.enum(["gateway", "price_table", "unknown"]),
  byStage: z.array(
    z.object({ stage: z.string(), ms: z.number(), inputTokens: z.number(), outputTokens: z.number(), ok: z.boolean(), error: z.string().optional() }),
  ),
});

export const StoredReport = z.object({
  runId: z.string(),
  status: z.enum(["completed", "partial", "failed", "cancelled"]),
  model: z.string(),
  brief: Brief,
  plan: ResearchPlan.optional(),
  decisions: z.array(Decision),
  findings: z.array(Finding),
  opportunities: z.array(ValidatedOpportunity),
  concepts: z.array(ValidatedConcept).max(3),
  evidence: z.array(EvidenceItem).readonly(),
  refs: z.array(ResolvedRef),
  trace: z.array(ToolCallRecord),
  validation: z.object({
    claimsChecked: z.number(),
    citationsAutoAttached: z.number(),
    downgradedToHypothesis: z.number(),
    removed: z.number(),
    mismatchedCitations: z.number(),
    repairAttempted: z.boolean(),
    violations: z.array(z.string()),
  }),
  warnings: z.array(z.string()),
  limitations: z.array(z.string()),
  usage: z.object({
    qloo: z.object({ calls: z.number(), cached: z.number(), budget: z.number() }),
    llm: LlmUsage,
    durationMs: z.number(),
  }),
  startedAt: z.string(),
  finishedAt: z.string(),
});

/** Validates an untrusted value (a DB row or a run result) as a report. */
export function parseStoredReport(value: unknown): AgentRunResult {
  // The regexes above enforce the E#/ref_ template-literal types the TS interface uses.
  return StoredReport.parse(value) as unknown as AgentRunResult;
}

// Compile-time: every AgentRunResult must be acceptable to the schema.
type Assignable<A, B> = A extends B ? true : false;
const _resultFitsSchema: Assignable<AgentRunResult, z.input<typeof StoredReport>> = true;
void _resultFitsSchema;
