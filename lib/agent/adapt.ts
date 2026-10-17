/**
 * Stage C: adaptive research. Each round inspects the critique of what has been
 * retrieved and decides what (if anything) to research next.
 *  - Round 1: the model proposes tool calls (tools without `execute`).
 *  - Round 2: deterministic rules on the updated critique.
 * Every proposal passes the dispatcher (known tool, schema, known E#, allowed category,
 * no duplicates, budget) before anything runs, and every outcome is recorded.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { QlooError } from "@/lib/qloo/errors";
import type { EntityType } from "@/lib/qloo/types";

import type { RunTracker } from "./budget";
import { critique, type Critique, type FlagCode } from "./critique";
import { ledgerDigest } from "./digest";
import { AgentModelError, proposeToolCalls, type ModelDeps, type ProposedCall } from "./model";
import { DEFAULT_CATEGORIES } from "./plan";
import { ADAPT_INSTRUCTIONS, adaptPrompt } from "./prompts";
import { bridge, exploreCategory, nicheLens, qlooCallsLeft, recordDecision, tasteThemes, type ResearchState } from "./research";
import type { AdaptiveAction } from "./schemas";

const Reason = z.string().min(1).max(200);
const EvidenceRef = z.string().regex(/^E\d{1,4}$/);

/** Flags that justify more research even when evidence is technically sufficient. */
const WEAKNESS: ReadonlySet<FlagCode> = new Set(["empty_category", "failed_category", "audience_not_distinctive", "all_mainstream"]);

function inputSchemas(allowed: readonly EntityType[]) {
  const Cat = z.enum(allowed as [EntityType, ...EntityType[]]);
  return {
    exploreCategory: z.object({ category: Cat, reason: Reason }),
    nicheLens: z.object({ category: Cat, reason: Reason }),
    bridge: z.object({ evidenceId: EvidenceRef, targetCategory: Cat, reason: Reason }),
    tasteThemes: z.object({ parentCategory: Cat.nullable(), reason: Reason }),
    stop: z.object({ reason: Reason }),
  };
}

/** The tool menu offered to the model. No `execute`: proposals come back to the dispatcher. */
export function adaptiveTools(allowed: readonly EntityType[]): ToolSet {
  const s = inputSchemas(allowed);
  return {
    exploreCategory: tool({ description: "Research a category not yet explored (target and market baseline).", inputSchema: s.exploreCategory }),
    nicheLens: tool({ description: "Re-query an explored category for less popular entities (popularity ≤ 0.6).", inputSchema: s.nicheLens }),
    bridge: tool({ description: "Use a retrieved entity (by E#) as the seed for another category.", inputSchema: s.bridge }),
    tasteThemes: tool({ description: "Retrieve cultural taste themes (tags), optionally within one category.", inputSchema: s.tasteThemes }),
    stop: tool({ description: "Stop researching: the evidence is sufficient for strategy.", inputSchema: s.stop }),
  };
}

export interface AdaptContext {
  st: ResearchState;
  tracker: RunTracker;
  model: ModelDeps;
  /** Categories the brief permits. */
  allowed: EntityType[];
}

type Validated = { ok: true; action: AdaptiveAction; reason: string; cost: number; key: string } | { ok: false; reason: string; action?: AdaptiveAction };

function actionKey(a: AdaptiveAction): string {
  switch (a.tool) {
    case "exploreCategory":
      return `explore:${a.category}`;
    case "nicheLens":
      return `niche:${a.category}`;
    case "bridge":
      return `bridge:${a.evidenceId}:${a.targetCategory}`;
    case "tasteThemes":
      return `taste:${a.parentCategory ?? "all"}`;
    default:
      return a.tool;
  }
}

/** Dispatcher check for one proposal (from the model or from rules). */
export function validateProposal(ctx: AdaptContext, call: ProposedCall): Validated {
  const schemas = inputSchemas(ctx.allowed);
  if (!(call.toolName in schemas)) return { ok: false, reason: `Unknown tool "${call.toolName}".` };
  const parsed = schemas[call.toolName as keyof typeof schemas].safeParse(call.input);
  if (!parsed.success) return { ok: false, reason: `Invalid arguments: ${parsed.error.issues[0]?.message ?? "schema mismatch"}.` };
  const input = parsed.data as Record<string, unknown> & { reason: string };
  const { st } = ctx;
  const perExplore = st.plan.ages.length || st.plan.gender ? 2 : 1;

  let action: AdaptiveAction;
  let cost = 1;
  switch (call.toolName) {
    case "exploreCategory": {
      const category = input.category as EntityType;
      action = { tool: "exploreCategory", category };
      if (st.categories.has(category)) return { ok: false, action, reason: `${category} is already researched.` };
      cost = perExplore;
      break;
    }
    case "nicheLens": {
      const category = input.category as EntityType;
      action = { tool: "nicheLens", category };
      break;
    }
    case "bridge": {
      const evidenceId = input.evidenceId as string;
      const targetCategory = input.targetCategory as EntityType;
      action = { tool: "bridge", evidenceId, targetCategory };
      const item = st.s.ledger.get(evidenceId as `E${number}`);
      if (!item) return { ok: false, action, reason: `${evidenceId} is not in the evidence ledger.` };
      if (item.entity.kind !== "entity") return { ok: false, action, reason: `${evidenceId} is a taste tag, not an entity; it cannot seed a bridge.` };
      break;
    }
    case "tasteThemes":
      action = { tool: "tasteThemes", parentCategory: (input.parentCategory as EntityType | null) ?? null };
      break;
    default:
      return { ok: true, action: { tool: "stop" }, reason: input.reason, cost: 0, key: "stop" };
  }
  const key = actionKey(action);
  if (st.done.has(key)) return { ok: false, action, reason: "Already executed in this run." };
  if (cost > qlooCallsLeft(st)) return { ok: false, action, reason: `Needs ${cost} Qloo call(s); ${qlooCallsLeft(st)} left.` };
  return { ok: true, action, reason: input.reason, cost, key };
}

async function execute(ctx: AdaptContext, a: AdaptiveAction): Promise<number> {
  const { st } = ctx;
  switch (a.tool) {
    case "exploreCategory":
      return exploreCategory(st, a.category);
    case "nicheLens":
      return nicheLens(st, a.category);
    case "bridge":
      return bridge(st, a.evidenceId, a.targetCategory);
    case "tasteThemes":
      return tasteThemes(st, a.parentCategory);
    default:
      return 0;
  }
}

/** Validate then run a batch of proposals for one round; returns evidence items added. */
async function dispatch(ctx: AdaptContext, round: 1 | 2, proposedBy: "model" | "rule", proposals: { call: ProposedCall; reason?: string }[]) {
  const max = ctx.tracker.budget.maxAdaptiveActions;
  let added = 0;
  let stopped = false;
  const runs: Promise<void>[] = [];
  proposals.forEach(({ call, reason }, i) => {
    const v = validateProposal(ctx, call);
    const why = v.ok ? v.reason : reason ?? String((call.input as { reason?: unknown } | null)?.reason ?? "");
    if (i >= max) {
      recordDecision(ctx.st, { round, proposedBy, action: v.action ?? { tool: "stop" }, reason: why, outcome: "rejected", outcomeReason: `Over the ${max}-action limit per round.`, evidenceAdded: 0 });
      return;
    }
    if (!v.ok) {
      recordDecision(ctx.st, { round, proposedBy, action: v.action ?? { tool: "stop" }, reason: why, outcome: "rejected", outcomeReason: v.reason, evidenceAdded: 0 });
      return;
    }
    if (v.action.tool === "stop") {
      stopped = true;
      recordDecision(ctx.st, { round, proposedBy, action: v.action, reason: v.reason, outcome: "executed", outcomeReason: "Research ended by this decision.", evidenceAdded: 0 });
      return;
    }
    ctx.st.done.add(v.key);
    const decision = recordDecision(ctx.st, { round, proposedBy, action: v.action, reason: v.reason, outcome: "executed", evidenceAdded: 0 });
    runs.push(
      execute(ctx, v.action).then(
        (n) => {
          decision.evidenceAdded = n;
          decision.outcomeReason = n ? `Added ${n} evidence item(s).` : "Ran, but Qloo returned no results.";
          added += n;
        },
        (err: unknown) => {
          if (err instanceof QlooError && (err.kind === "unauthorized" || err.kind === "aborted")) throw err;
          decision.outcomeReason = `Failed: ${err instanceof QlooError ? err.kind : err instanceof Error ? err.message : "error"}.`;
        },
      ),
    );
  });
  await Promise.all(runs);
  return { added, stopped };
}

/** Deterministic round: map critique flags to at most two corrective actions. */
export function ruleProposals(ctx: AdaptContext, crit: Critique): { call: ProposedCall; reason: string }[] {
  const out: { call: ProposedCall; reason: string }[] = [];
  const { st } = ctx;
  const unexplored = DEFAULT_CATEGORIES.filter((c) => ctx.allowed.includes(c) && !st.categories.has(c));
  const push = (toolName: string, input: Record<string, unknown>, reason: string) => {
    if (out.length < 2) out.push({ call: { toolName, input: { ...input, reason } }, reason });
  };
  for (const f of crit.flags) {
    if ((f.code === "empty_category" || f.code === "failed_category") && unexplored[0]) {
      push("exploreCategory", { category: unexplored.shift() }, `${f.category} returned no usable signal; trying another category.`);
    } else if (f.code === "audience_not_distinctive" && f.category && !st.done.has(`niche:${f.category}`)) {
      push("nicheLens", { category: f.category }, `${f.category} barely changes with the audience; looking past mainstream results.`);
    }
  }
  if (crit.flags.some((f) => f.code === "all_mainstream")) {
    const best = [...crit.coverage].sort((a, b) => b.items - a.items)[0];
    if (best && !st.done.has(`niche:${best.category}`)) push("nicheLens", { category: best.category }, "All lists are mainstream; looking for distinctive signals.");
  }
  if (!crit.sufficient) {
    const lead = crit.flags.find((f) => f.code === "bridge_candidate");
    const target = unexplored[0] ?? [...crit.coverage].sort((a, b) => a.items - b.items)[0]?.category;
    if (lead?.evidenceId && target) push("bridge", { evidenceId: lead.evidenceId, targetCategory: target }, `Following ${lead.evidenceId}, which over-indexes for this audience, into ${target}.`);
  }
  return out;
}

async function modelRound(ctx: AdaptContext, crit: Critique) {
  const { st, tracker } = ctx;
  // Keep at least one call for strategy (and ideally one for repair).
  if (tracker.llmCallsLeft() < 2) return null;
  try {
    const calls = await proposeToolCalls(ctx.model, tracker, {
      stage: "adapt",
      instructions: ADAPT_INSTRUCTIONS,
      prompt: adaptPrompt({
        plan: st.plan,
        flags: crit.flags,
        digest: ledgerDigest(st.s.ledger, { perCategory: 6, max: 80 }),
        callsLeft: qlooCallsLeft(st),
        explored: [...st.categories.keys()],
        allowed: ctx.allowed.filter((c) => !st.categories.has(c)),
      }),
      tools: adaptiveTools(ctx.allowed),
    });
    return calls.map((call) => ({ call }));
  } catch (err) {
    if (err instanceof AgentModelError && err.kind === "aborted") throw err;
    st.warnings.push(`Adaptive model round failed (${err instanceof AgentModelError ? err.kind : "error"}); continuing with rule-based decisions.`);
    return null;
  }
}

/** Run up to `adaptiveRounds` rounds; returns the final critique. */
export async function runAdaptive(ctx: AdaptContext): Promise<Critique> {
  const { st, tracker } = ctx;
  let crit = critique(st);
  for (let round = 1 as 1 | 2; round <= Math.min(2, tracker.budget.adaptiveRounds); round = (round + 1) as 1 | 2) {
    const weak = crit.flags.filter((f) => WEAKNESS.has(f.code));
    const stop = (reason: string) => recordDecision(st, { round, proposedBy: "rule", action: { tool: "stop" }, reason, outcome: "executed", evidenceAdded: 0 });
    if (tracker.pastSoftDeadline()) {
      stop("Soft time limit reached; skipping further research.");
      break;
    }
    if (qlooCallsLeft(st) < 1) {
      stop("Qloo call budget exhausted.");
      break;
    }
    if (crit.sufficient && weak.length === 0) {
      stop(`Evidence is sufficient (${crit.coverage.filter((c) => c.items >= 5).length} categories with signal) and no weaknesses were flagged.`);
      break;
    }
    let proposals = round === 1 ? await modelRound(ctx, crit) : null;
    let by: "model" | "rule" = "model";
    if (!proposals) {
      proposals = ruleProposals(ctx, crit);
      by = "rule";
    }
    if (proposals.length === 0) {
      stop("No useful follow-up research available for the flagged weaknesses.");
      break;
    }
    const { added, stopped } = await dispatch(ctx, round, by, proposals);
    crit = critique(st);
    if (stopped || added === 0) break;
  }
  return crit;
}
