/**
 * Public run events: what the browser sees, streamed live and stored in run_events.
 * Mapped from the agent's internal RunEvent with everything private removed — no Qloo
 * params or ids, no error strings, no token counts, no model-written reasons. Events only
 * describe work that actually happened; the agent produces no reasoning to stream.
 * Client-safe: no server imports.
 */
import { z } from "zod";

export const STAGES = ["planning", "research", "critique", "strategy", "validation"] as const;
export type Stage = (typeof STAGES)[number];

export const STORED_STATUSES = ["running", "completed", "partial", "failed", "cancelled", "interrupted"] as const;
export type StoredRunStatus = (typeof STORED_STATUSES)[number];
export const TERMINAL_STATUSES: ReadonlySet<StoredRunStatus> = new Set(["completed", "partial", "failed", "cancelled", "interrupted"]);

/** Agent node → user-facing stage and step label. */
export const NODE_STAGE: Record<string, { stage: Stage; step: string }> = {
  planResearch: { stage: "planning", step: "Plan research" },
  resolve: { stage: "research", step: "Resolve brand and anchors" },
  explore: { stage: "research", step: "Explore categories" },
  deepen: { stage: "research", step: "Adaptive research" },
  critique: { stage: "critique", step: "Critique evidence" },
  strategize: { stage: "strategy", step: "Draft concepts" },
  repair: { stage: "strategy", step: "Repair flagged claims" },
  validateClaims: { stage: "validation", step: "Validate claims" },
};

const short = (max: number) => z.string().max(max);
const count = z.number().int().min(0);

export const PublicRunEvent = z.discriminatedUnion("t", [
  z.object({ t: z.literal("run.started"), runId: z.string(), budget: z.object({ qloo: count, llm: count }) }),
  z.object({
    t: z.literal("stage"),
    stage: z.enum(STAGES),
    phase: z.enum(["started", "finished"]),
    step: short(60).optional(),
    ms: count.optional(),
    summary: short(240).optional(),
  }),
  z.object({
    t: z.literal("plan"),
    source: z.enum(["model", "fallback"]),
    categories: z.array(short(40)).max(12),
    anchors: z.array(short(80)).max(12),
    adjustments: z.array(short(240)).max(12),
  }),
  z.object({
    t: z.literal("qloo"),
    kind: z.enum(["search", "insights", "tags", "audiences", "other"]),
    category: short(40).optional(),
    ok: z.boolean(),
    cached: z.boolean(),
    results: count,
    ms: count,
  }),
  z.object({ t: z.literal("evidence"), category: short(40), count }),
  z.object({
    t: z.literal("decision"),
    proposedBy: z.enum(["model", "rule"]),
    tool: short(40),
    target: short(80).optional(),
    outcome: z.enum(["executed", "rejected", "skipped"]),
    evidenceAdded: count,
  }),
  z.object({ t: z.literal("model"), stage: z.enum(["plan", "adapt", "strategize", "repair"]), ok: z.boolean(), ms: count }),
  z.object({ t: z.literal("findings"), count }),
  z.object({ t: z.literal("claims"), checked: count, autoCited: count, downgraded: count, removed: count, repaired: z.boolean() }),
  z.object({ t: z.literal("warning"), message: short(400) }),
  z.object({ t: z.literal("run.finished"), runId: z.string(), status: z.enum(STORED_STATUSES) }),
]);
export type PublicRunEvent = z.infer<typeof PublicRunEvent>;

export const SequencedEventSchema = z.object({ seq: count, event: PublicRunEvent });
export type SequencedEvent = z.infer<typeof SequencedEventSchema>;
