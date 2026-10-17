/**
 * Per-run limits and accounting (Phase 2). One AbortController per run is shared by
 * every Qloo request and model call, so a deadline or user cancel stops everything.
 *
 * The cost figure is an ESTIMATE from token usage × a price table (or the gateway's
 * reported cost when present). It is not a billing cap: set a budget on the AI
 * Gateway key itself as the real safety net.
 */
import type { LlmUsage } from "./schemas";

export type ModelStage = "plan" | "adapt" | "strategize" | "repair";

export interface AgentBudget {
  qlooCalls: number;
  llmCalls: number;
  adaptiveRounds: number;
  /** Max actions the model may propose in one adaptive round. */
  maxAdaptiveActions: number;
  /** After this, optional stages (adaptive rounds) are skipped. */
  softDeadlineMs: number;
  /** After this, everything is aborted and a partial result is returned. */
  hardDeadlineMs: number;
  llmTimeoutMs: number;
  runCostLimitUsd: number;
  /** Includes reasoning tokens for reasoning models. */
  maxOutputTokens: Record<ModelStage, number>;
}

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  qlooCalls: 24,
  llmCalls: 4,
  adaptiveRounds: 2,
  maxAdaptiveActions: 4,
  softDeadlineMs: 120_000,
  hardDeadlineMs: 180_000,
  llmTimeoutMs: 60_000,
  runCostLimitUsd: 0.15,
  maxOutputTokens: { plan: 3_000, adapt: 2_000, strategize: 8_000, repair: 8_000 },
};

/** USD per million tokens. Source: AI Gateway catalogue (fetched 2026-10-17). */
export const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  "nvidia/nemotron-3.5-lightning-free": { input: 0, output: 0 },
  "openai/gpt-5-mini": { input: 0.25, output: 2 },
  "anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5 },
};

export function priceFor(modelId: string, override?: { input?: number; output?: number }): { input: number; output: number } | null {
  if (override?.input !== undefined && override.output !== undefined) return { input: override.input, output: override.output };
  return PRICE_TABLE[modelId] ?? null;
}

export class BudgetError extends Error {
  override readonly name = "BudgetError";
  constructor(
    readonly limit: "llm_calls" | "cost" | "deadline",
    message: string,
  ) {
    super(message);
  }
}

export class RunTracker {
  readonly controller = new AbortController();
  private readonly started: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private llmCalls = 0;
  private gatewayCost = 0;
  private sawGatewayCost = false;
  readonly usage: LlmUsage = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedCostUsd: null,
    costSource: "unknown",
    byStage: [],
  };

  constructor(
    readonly budget: AgentBudget,
    private readonly price: { input: number; output: number } | null,
    external?: AbortSignal,
    private readonly now: () => number = Date.now,
  ) {
    this.started = now();
    this.timer = setTimeout(() => this.controller.abort(new BudgetError("deadline", "Run hit its hard deadline")), budget.hardDeadlineMs);
    if (external) {
      if (external.aborted) this.controller.abort(external.reason);
      else external.addEventListener("abort", () => this.controller.abort(external.reason), { once: true });
    }
    if (price) {
      this.usage.estimatedCostUsd = 0;
      this.usage.costSource = "price_table";
    }
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  elapsedMs(): number {
    return this.now() - this.started;
  }

  pastSoftDeadline(): boolean {
    return this.elapsedMs() >= this.budget.softDeadlineMs;
  }

  llmCallsLeft(): number {
    return this.budget.llmCalls - this.llmCalls;
  }

  /** Throws BudgetError if a call to this stage would break a limit. Reserves the call. */
  reserveModelCall(stage: ModelStage, estimatedInputTokens: number): void {
    if (this.signal.aborted) throw new BudgetError("deadline", "Run already stopped");
    if (this.llmCalls >= this.budget.llmCalls) {
      throw new BudgetError("llm_calls", `Model call budget of ${this.budget.llmCalls} reached before ${stage}`);
    }
    if (this.price) {
      const worst = (estimatedInputTokens * this.price.input + this.budget.maxOutputTokens[stage] * this.price.output) / 1e6;
      const spent = this.usage.estimatedCostUsd ?? 0;
      if (spent + worst > this.budget.runCostLimitUsd) {
        throw new BudgetError("cost", `Estimated cost would exceed the $${this.budget.runCostLimitUsd} run limit at ${stage}`);
      }
    }
    this.llmCalls++;
  }

  recordModelCall(entry: {
    stage: ModelStage;
    ms: number;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    gatewayCostUsd?: number;
    ok: boolean;
    error?: string;
  }): void {
    const inT = entry.inputTokens ?? 0;
    const outT = entry.outputTokens ?? 0;
    this.usage.calls++;
    this.usage.inputTokens += inT;
    this.usage.outputTokens += outT;
    this.usage.reasoningTokens += entry.reasoningTokens ?? 0;
    this.usage.byStage.push({
      stage: entry.stage,
      ms: entry.ms,
      inputTokens: inT,
      outputTokens: outT,
      ok: entry.ok,
      ...(entry.error ? { error: entry.error } : {}),
    });
    if (entry.gatewayCostUsd !== undefined) {
      this.sawGatewayCost = true;
      this.gatewayCost += entry.gatewayCostUsd;
    }
    if (this.sawGatewayCost) {
      this.usage.estimatedCostUsd = this.gatewayCost;
      this.usage.costSource = "gateway";
    } else if (this.price) {
      this.usage.estimatedCostUsd = (this.usage.inputTokens * this.price.input + this.usage.outputTokens * this.price.output) / 1e6;
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
  }
}
