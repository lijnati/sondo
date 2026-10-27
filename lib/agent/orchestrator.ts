/**
 * Sondo agent run (Phase 2): brief → plan → research → adaptive research → evaluation →
 * strategy → deterministic validation. Bounded by AgentBudget; one AbortSignal stops
 * every Qloo request and model call. Always returns an honest AgentRunResult, including
 * partial, failed and cancelled runs.
 */
import { randomUUID } from "node:crypto";

import { QlooError } from "@/lib/qloo/errors";
import type { QlooClient } from "@/lib/qloo/client";
import { createSession } from "@/lib/qloo/operations";
import { ENTITY_TYPES, type ToolCallRecord } from "@/lib/qloo/types";

import { runAdaptive } from "./adapt";
import { Brief } from "./brief";
import { BudgetError, DEFAULT_AGENT_BUDGET, RunTracker, type AgentBudget } from "./budget";
import { critique, type Critique } from "./critique";
import { findingsDigest, ledgerDigest } from "./digest";
import { AgentModelError, generateStructured, type ModelDeps } from "./model";
import { clampPlan, fallbackPlan } from "./plan";
import { PLAN_INSTRUCTIONS, planPrompt, REPAIR_INSTRUCTIONS, repairPrompt, STRATEGIZE_INSTRUCTIONS, strategizePrompt } from "./prompts";
import { anchorDemographics, exploreCategory, newResearchState, resolveAnchors, tasteThemes, type ResearchState } from "./research";
import {
  ResearchPlanDraft,
  StrategyOutput,
  type AgentRunResult,
  type AgentRunStatus,
  type ResearchPlan,
  type ValidatedConcept,
  type ValidatedOpportunity,
  type ValidationSummary,
} from "./schemas";
import type { RunEvent } from "./types";
import { ageBounds, checkStrategy, describeViolations, finalizeStrategy, type Violation } from "./validate";

export interface AgentDeps {
  /** Builds the run's Qloo client with the given call budget and trace sink. */
  qloo: (opts: { maxCalls: number; onCall: (r: ToolCallRecord) => void }) => QlooClient;
  model: ModelDeps;
  /** USD per million tokens, or null when unknown (token caps still apply). */
  price: { input: number; output: number } | null;
  budget?: Partial<AgentBudget>;
}

export interface RunOptions {
  onEvent?: (e: RunEvent) => void;
  signal?: AbortSignal;
  runId?: string;
}

const STATIC_LIMITATIONS = [
  "Qloo affinity is cultural-taste relevance within a query, not purchase intent, audience share, conversion or ROI.",
  "Audience lift and the distinctiveness quadrant are Sondo heuristics computed from ranks and popularity.",
  "Only entity anchors, Qloo age buckets, binary gender and a locality are modeled; other audience attributes are not.",
  "Campaign concepts are hypotheses grounded in affinity data; validate them before committing budget.",
];

/** Headroom a strategy retry needs beyond one model call, for validation and the final write. */
const RETRY_MARGIN_MS = 10_000;

const groundedCount = (concepts: readonly { grounding: string }[]) => concepts.filter((c) => c.grounding === "grounded").length;

/** Violations the single repair call should fix (auto-citation is handled deterministically). */
const REPAIRABLE: ReadonlySet<Violation["code"]> = new Set([
  "unknown_evidence",
  "missing_citation",
  "citation_mismatch",
  "weak_support",
  "numeric",
  "forbidden_phrase",
  "duplicate_angle",
  "too_few_concepts",
  "overlap",
  "weak_grounding",
  "opportunity_without_evidence",
  "unknown_finding",
]);

export class BriefValidationError extends Error {
  override readonly name = "BriefValidationError";
}

export async function runAgent(briefInput: unknown, deps: AgentDeps, opts: RunOptions = {}): Promise<AgentRunResult> {
  const parsedBrief = Brief.safeParse(briefInput);
  if (!parsedBrief.success) {
    const first = parsedBrief.error.issues[0];
    throw new BriefValidationError(`Invalid brief at ${first?.path.join(".") || "root"}: ${first?.message ?? "invalid"}`);
  }
  const brief = parsedBrief.data;
  const budget: AgentBudget = { ...DEFAULT_AGENT_BUDGET, ...deps.budget, maxOutputTokens: { ...DEFAULT_AGENT_BUDGET.maxOutputTokens, ...deps.budget?.maxOutputTokens } };
  const runId = opts.runId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const tracker = new RunTracker(budget, deps.price, opts.signal);
  const trace: ToolCallRecord[] = [];
  const emit = (e: RunEvent) => opts.onEvent?.(e);
  const qloo = deps.qloo({
    maxCalls: budget.qlooCalls,
    onCall: (r) => {
      trace.push(r);
      emit({ t: "tool.call", record: r });
    },
  });
  const session = createSession(qloo, { node: "agent", signal: tracker.signal });
  const warnings: string[] = [];
  const allowed = ENTITY_TYPES.filter((t) => !brief.constraints.excludeCategories.includes(t));

  let plan: ResearchPlan | undefined;
  let st: ResearchState | undefined;
  let crit: Critique | undefined;
  let concepts: ValidatedConcept[] = [];
  let opportunities: ValidatedOpportunity[] = [];
  let validation: ValidationSummary = { claimsChecked: 0, citationsAutoAttached: 0, downgradedToHypothesis: 0, removed: 0, mismatchedCitations: 0, repairAttempted: false, violations: [] };
  let failure: string | undefined;

  emit({ t: "run.started", runId, budget: { qloo: budget.qlooCalls, llm: budget.llmCalls } });
  const stage = async <T>(node: Parameters<typeof emitNode>[0], fn: () => Promise<T>, summary?: (r: T) => string): Promise<T> => {
    const t0 = Date.now();
    emitNode(node, "started");
    const r = await fn();
    emitNode(node, "finished", Date.now() - t0, summary?.(r));
    return r;
  };
  function emitNode(node: "planResearch" | "resolve" | "explore" | "deepen" | "critique" | "strategize" | "validateClaims" | "repair", phase: "started" | "finished", ms?: number, summary?: string) {
    emit({ t: phase === "started" ? "node.started" : "node.finished", node, ...(ms !== undefined ? { ms } : {}), ...(summary ? { summary } : {}) });
  }
  const llmEvent = () => {
    const last = tracker.usage.byStage.at(-1);
    if (last) emit({ t: "llm.call", stage: last.stage as never, ok: last.ok, ms: last.ms, inputTokens: last.inputTokens, outputTokens: last.outputTokens, ...(last.error ? { error: last.error } : {}) });
  };

  try {
    // ── Stage A: plan ──────────────────────────────────────────────────────
    plan = await stage("planResearch", async () => {
      try {
        const draft = await generateStructured(deps.model, tracker, { stage: "plan", instructions: PLAN_INSTRUCTIONS, prompt: planPrompt(brief), schema: ResearchPlanDraft, name: "research_plan" });
        llmEvent();
        return clampPlan(draft, brief);
      } catch (err) {
        llmEvent();
        if (err instanceof AgentModelError && err.kind === "aborted") throw err;
        warnings.push(`Planning model call failed (${err instanceof AgentModelError ? `${err.kind}: ${err.message}` : "error"}); using a deterministic plan from the brief.`);
        return fallbackPlan(brief);
      }
    }, (p) => `${p.source} plan · ${p.categories.join(", ")}`);
    emit({ t: "plan.ready", source: plan.source, categories: plan.categories, anchors: plan.anchors.map((a) => a.name), adjustments: plan.adjustments });

    // ── Stage B: resolve + explore ────────────────────────────────────────
    const state = newResearchState(session, plan, emit);
    st = state;
    await stage("resolve", () => resolveAnchors(state), () => `${state.seeds.length} seed(s) resolved, ${state.unresolved.length} unresolved`);
    await stage("explore", async () => {
      await Promise.all([...state.plan.categories.map((c) => exploreCategory(state, c)), tasteThemes(state, null).catch(() => 0), anchorDemographics(state)]);
      state.done.add("taste:all");
      for (const c of state.plan.categories) state.done.add(`explore:${c}`);
    }, () => `${session.ledger.size} evidence items`);

    // ── Stage C: adaptive research ───────────────────────────────────────
    crit = await stage("deepen", () => runAdaptive({ st: state, tracker, model: deps.model, allowed }), (c) => `${state.decisions.length} decision(s); sufficient: ${c.sufficient}`);
    if (tracker.usage.byStage.some((b) => b.stage === "adapt")) llmEvent();

    // ── Stage D: evaluate ────────────────────────────────────────────────
    crit = await stage("critique", async () => critique(state), (c) => `${c.findings.length} findings`);
    emit({ t: "finding.added", count: crit.findings.length });

    // ── Stage E: strategy + validation ───────────────────────────────────
    const usable = crit.coverage.filter((c) => c.items > 0).length >= 2;
    if (!usable) {
      warnings.push("Not enough Qloo evidence to write grounded strategies; returning research only.");
    } else if (tracker.llmCallsLeft() < 1) {
      warnings.push("Model call budget exhausted before strategy; returning research only.");
    } else {
      const ctx = { ledger: session.ledger, findingIds: new Set(crit.findings.map((f) => f.id)), requireThree: crit.sufficient, allowedNumbers: ageBounds(state.plan.ages) };
      const digest = ledgerDigest(session.ledger);
      const findings = findingsDigest(crit.findings);
      const strategize = (evidence: string) =>
        generateStructured(deps.model, tracker, {
          stage: "strategize",
          instructions: STRATEGIZE_INSTRUCTIONS,
          prompt: strategizePrompt({ brief, plan: state.plan, findings, digest: evidence, notModeled: state.plan.notModeled }),
          schema: StrategyOutput,
          name: "campaign_strategy",
        });
      const draft = await stage("strategize", async () => {
        try {
          const out = await strategize(digest);
          llmEvent();
          return out;
        } catch (err) {
          llmEvent();
          if (err instanceof AgentModelError && err.kind === "aborted") throw err;
          const why = err instanceof AgentModelError ? `${err.kind}: ${err.message}` : "error";
          // A strategy is worth more than a repair: spend the repair call on one retry
          // with a compact evidence digest (live: the free model sometimes fails to submit
          // or times out). Only when a full model call still fits before the hard deadline.
          const retryable = err instanceof AgentModelError && (err.kind === "no_output" || err.kind === "provider");
          const timeLeft = tracker.budget.hardDeadlineMs - tracker.elapsedMs() >= tracker.budget.llmTimeoutMs + RETRY_MARGIN_MS;
          if (retryable && timeLeft && tracker.llmCallsLeft() >= 1) {
            warnings.push(`Strategy model call failed (${why}); retried once with a compact evidence digest.`);
            try {
              const out = await strategize(ledgerDigest(session.ledger, { perCategory: 5, max: 50 }));
              llmEvent();
              return out;
            } catch (retryErr) {
              llmEvent();
              if (retryErr instanceof AgentModelError && retryErr.kind === "aborted") throw retryErr;
            }
          }
          warnings.push(`Strategy model call failed (${why}); returning research only.`);
          return null;
        }
      });

      if (draft) {
        let current = draft;
        let repaired = false;
        const hard = checkStrategy(current, ctx).filter((v) => REPAIRABLE.has(v.code));
        if (hard.length && tracker.llmCallsLeft() >= 1 && !tracker.signal.aborted) {
          repaired = true;
          await stage("repair", async () => {
            try {
              current = await generateStructured(deps.model, tracker, {
                stage: "repair",
                instructions: REPAIR_INSTRUCTIONS,
                prompt: repairPrompt({ previous: current, violations: describeViolations(hard), digest, findings }),
                schema: StrategyOutput,
                name: "campaign_strategy",
              });
              llmEvent();
            } catch (err) {
              llmEvent();
              if (err instanceof AgentModelError && err.kind === "aborted") throw err;
              warnings.push("Repair call failed; applying deterministic fixes to the original draft.");
            }
          });
        }
        const final = await stage("validateClaims", async () => {
          const out = finalizeStrategy(current, ctx);
          if (current === draft) return out;
          // A repair can come back thinner than the draft. Both pass the same validator,
          // so keep whichever is better grounded (ties go to the repair).
          const original = finalizeStrategy(draft, ctx);
          if (groundedCount(original.concepts) > groundedCount(out.concepts)) {
            warnings.push("The repaired draft was less grounded than the original; kept the original draft (both validated).");
            return original;
          }
          return out;
        });
        concepts = final.concepts;
        opportunities = final.opportunities;
        validation = { ...final.summary, repairAttempted: repaired };
        emit({ t: "claims.validated", checked: validation.claimsChecked, autoCited: validation.citationsAutoAttached, downgraded: validation.downgradedToHypothesis, removed: validation.removed, repaired });
      }
    }
  } catch (err) {
    if (err instanceof QlooError && err.kind === "unauthorized") failure = "Qloo rejected the API key; the run was stopped.";
    else if (tracker.signal.aborted) failure = undefined; // handled as cancelled / deadline below
    else if (err instanceof AgentModelError || err instanceof QlooError || err instanceof BudgetError) failure = `${err.name}: ${err.message}`;
    else failure = "Unexpected agent error.";
    if (failure) warnings.push(failure);
  } finally {
    tracker.dispose();
  }

  // Research done so far is still worth returning, with an honest status.
  if (st && !crit) crit = critique(st);
  const reason = tracker.signal.reason;
  const deadline = reason instanceof BudgetError && reason.limit === "deadline";
  const cancelled = tracker.signal.aborted && !deadline;
  if (deadline) warnings.push("The run hit its time limit; results are partial.");
  if (cancelled) warnings.push("The run was cancelled; results are partial.");
  const stats = qloo.stats();
  if (stats.halted === "rate_limited") warnings.push("Qloo rate limit reached; some research was skipped.");

  const status: AgentRunStatus = cancelled
    ? "cancelled"
    : failure && session.ledger.size === 0
      ? "failed"
      : !deadline && !failure && concepts.length === 3 && concepts.every((c) => c.grounding === "grounded") && crit?.sufficient
        ? "completed"
        : "partial";

  const limitations = [...STATIC_LIMITATIONS];
  if (st?.unresolved.length) limitations.push(`Not found in Qloo: ${st.unresolved.join(", ")}.`);
  if (plan?.notModeled.length) limitations.push(`Not modeled: ${plan.notModeled.join("; ")}.`);
  if (crit && !crit.sufficient) limitations.push("Evidence coverage was below Sondo's sufficiency threshold; treat strategies as exploratory.");

  emit({ t: "run.finished", runId, status });
  return {
    runId,
    status,
    model: deps.model.modelId,
    brief,
    ...(plan ? { plan } : {}),
    decisions: st?.decisions ?? [],
    findings: crit?.findings ?? [],
    opportunities,
    concepts,
    evidence: session.ledger.all(),
    refs: session.refs.all(),
    trace,
    validation,
    warnings: [...new Set([...warnings, ...(st?.warnings ?? [])])],
    limitations,
    usage: {
      qloo: { calls: stats.callsUsed, cached: trace.filter((t) => t.cached).length, budget: budget.qlooCalls },
      llm: tracker.usage,
      durationMs: tracker.elapsedMs(),
    },
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}
