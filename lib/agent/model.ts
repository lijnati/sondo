/**
 * Model adapter over AI SDK 7 `generateText` (APIs verified in node_modules/ai/docs).
 * Server-only by convention: the gateway key is read by the SDK from the environment
 * and never passes through Sondo code. Every call is reserved against the run budget,
 * bound to the run's AbortSignal and a per-call timeout, and recorded with token usage.
 */
import { APICallError, generateText, NoOutputGeneratedError, Output, type LanguageModel, type ToolSet } from "ai";
import type { z } from "zod";

import { BudgetError, type ModelStage, type RunTracker } from "./budget";

export type ModelErrorKind = "provider" | "no_output" | "budget" | "aborted";

export class AgentModelError extends Error {
  override readonly name = "AgentModelError";
  constructor(
    readonly kind: ModelErrorKind,
    readonly stage: ModelStage,
    message: string,
  ) {
    super(message);
  }
}

export interface ModelDeps {
  /** Gateway "provider/model" string in production; a MockLanguageModelV4 in tests. */
  model: LanguageModel;
  modelId: string;
  /** Strings that must never appear in diagnostics (e.g. the gateway key). */
  secrets?: string[];
}

/** Rough token estimate for budget checks before a call (≈ 4 characters per token). */
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

function redact(message: string, secrets: readonly string[]): string {
  let m = message;
  for (const s of secrets) if (s) m = m.split(s).join("<redacted>");
  return m.replace(/\s+/g, " ").trim().slice(0, 240);
}

function toModelError(err: unknown, stage: ModelStage, tracker: RunTracker, secrets: readonly string[]): AgentModelError {
  if (err instanceof AgentModelError) return err;
  if (err instanceof BudgetError) return new AgentModelError("budget", stage, err.message);
  if (tracker.signal.aborted) {
    const reason = tracker.signal.reason;
    return new AgentModelError("aborted", stage, reason instanceof Error ? reason.message : "Run cancelled");
  }
  if (NoOutputGeneratedError.isInstance(err)) return new AgentModelError("no_output", stage, "Model returned no valid structured output");
  const name = err instanceof Error ? err.name : "";
  if (/NoObjectGenerated|TypeValidation|JSONParse|InvalidToolInput|NoSuchTool/.test(name)) {
    return new AgentModelError("no_output", stage, `Model output failed validation (${name})`);
  }
  if (APICallError.isInstance(err)) {
    const status = err.statusCode ? ` ${err.statusCode}` : "";
    return new AgentModelError("provider", stage, redact(`Provider error${status}: ${err.message}`, secrets));
  }
  if (name === "AbortError" || name === "TimeoutError") return new AgentModelError("provider", stage, `Model call timed out after the per-call limit`);
  return new AgentModelError("provider", stage, redact(err instanceof Error ? `${name}: ${err.message}` : "Unknown model error", secrets));
}

function gatewayCost(providerMetadata: unknown): number | undefined {
  const g = (providerMetadata as { gateway?: { cost?: unknown } } | undefined)?.gateway;
  const n = typeof g?.cost === "string" ? Number(g.cost) : typeof g?.cost === "number" ? g.cost : undefined;
  return n !== undefined && Number.isFinite(n) ? n : undefined;
}

interface CallInput {
  stage: ModelStage;
  instructions: string;
  prompt: string;
}

async function run<T>(
  deps: ModelDeps,
  tracker: RunTracker,
  input: CallInput,
  invoke: (common: Parameters<typeof generateText>[0]) => Promise<{ value: T; usage: unknown; providerMetadata: unknown }>,
): Promise<T> {
  const secrets = deps.secrets ?? [];
  try {
    tracker.reserveModelCall(input.stage, estimateTokens(input.instructions + input.prompt));
  } catch (err) {
    throw toModelError(err, input.stage, tracker, secrets);
  }
  const t0 = Date.now();
  try {
    const { value, usage, providerMetadata } = await invoke({
      model: deps.model,
      instructions: input.instructions,
      prompt: input.prompt,
      maxOutputTokens: tracker.budget.maxOutputTokens[input.stage],
      maxRetries: 1,
      timeout: tracker.budget.llmTimeoutMs,
      abortSignal: tracker.signal,
    });
    const u = usage as { inputTokens?: number; outputTokens?: number; outputTokenDetails?: { reasoningTokens?: number } } | undefined;
    const cost = gatewayCost(providerMetadata);
    tracker.recordModelCall({
      stage: input.stage,
      ms: Date.now() - t0,
      ...(u?.inputTokens !== undefined ? { inputTokens: u.inputTokens } : {}),
      ...(u?.outputTokens !== undefined ? { outputTokens: u.outputTokens } : {}),
      ...(u?.outputTokenDetails?.reasoningTokens !== undefined ? { reasoningTokens: u.outputTokenDetails.reasoningTokens } : {}),
      ...(cost !== undefined ? { gatewayCostUsd: cost } : {}),
      ok: true,
    });
    return value;
  } catch (err) {
    const e = toModelError(err, input.stage, tracker, secrets);
    const usage = (err as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
    tracker.recordModelCall({
      stage: input.stage,
      ms: Date.now() - t0,
      ...(usage?.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage?.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      ok: false,
      error: `${e.kind}: ${e.message}`,
    });
    throw e;
  }
}

/** One structured-output call, validated against `schema` by the SDK. */
export function generateStructured<S extends z.ZodType>(
  deps: ModelDeps,
  tracker: RunTracker,
  input: CallInput & { schema: S; name: string },
): Promise<z.output<S>> {
  return run(deps, tracker, input, async (common) => {
    const r = await generateText({ ...common, output: Output.object({ schema: input.schema, name: input.name }) });
    return { value: r.output as z.output<S>, usage: r.usage, providerMetadata: r.providerMetadata };
  });
}

export interface ProposedCall {
  toolName: string;
  input: unknown;
}

/**
 * One tool-proposal call. Tools have no `execute`, so the SDK only returns the model's
 * proposals; Sondo's dispatcher validates and executes them (or rejects them).
 */
export function proposeToolCalls(deps: ModelDeps, tracker: RunTracker, input: CallInput & { tools: ToolSet }): Promise<ProposedCall[]> {
  return run(deps, tracker, input, async (common) => {
    const r = await generateText({ ...common, tools: input.tools, toolChoice: "required" });
    return { value: r.toolCalls.map((c) => ({ toolName: c.toolName, input: c.input })), usage: r.usage, providerMetadata: r.providerMetadata };
  });
}
