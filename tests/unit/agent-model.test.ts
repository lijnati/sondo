import { APICallError, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { DEFAULT_AGENT_BUDGET, priceFor, RunTracker, type AgentBudget } from "@/lib/agent/budget";
import { AgentModelError, generateStructured, proposeToolCalls, type ModelDeps } from "@/lib/agent/model";

const usage = (input = 100, output = 50, reasoning?: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: output, text: output - (reasoning ?? 0), reasoning },
});

function textModel(text: string, u = usage()) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage: u, warnings: [] }),
  });
}

const trackers: RunTracker[] = [];
function tracker(budget: Partial<AgentBudget> = {}, price = priceFor("openai/gpt-5-mini"), signal?: AbortSignal) {
  const t = new RunTracker({ ...DEFAULT_AGENT_BUDGET, ...budget }, price, signal);
  trackers.push(t);
  return t;
}
afterEach(() => trackers.splice(0).forEach((t) => t.dispose()));

const Schema = z.object({ answer: z.string() });
const input = { stage: "plan" as const, instructions: "Return JSON.", prompt: "Say hi.", schema: Schema, name: "answer" };

describe("generateStructured", () => {
  it("returns schema-valid output and records tokens and estimated cost", async () => {
    const t = tracker();
    const deps: ModelDeps = { model: textModel(JSON.stringify({ answer: "hi" }), usage(1000, 400, 300)), modelId: "openai/gpt-5-mini" }; // native mode by model id
    await expect(generateStructured(deps, t, input)).resolves.toEqual({ answer: "hi" });
    expect(t.usage).toMatchObject({ calls: 1, inputTokens: 1000, outputTokens: 400, reasoningTokens: 300, costSource: "price_table" });
    // 1000 × $0.25/M + 400 × $2/M
    expect(t.usage.estimatedCostUsd).toBeCloseTo(0.00105, 8);
  });

  it("maps invalid JSON to a no_output error and still records the call", async () => {
    const t = tracker();
    const err = await generateStructured({ model: textModel("{not json"), modelId: "m/x", structuredMode: "output" }, t, input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentModelError);
    expect((err as AgentModelError).kind).toBe("no_output");
    expect(t.usage.byStage[0]).toMatchObject({ stage: "plan", ok: false });
  });

  it("maps schema-mismatched JSON to no_output", async () => {
    const t = tracker();
    const err = await generateStructured({ model: textModel(JSON.stringify({ wrong: 1 })), modelId: "m/x", structuredMode: "output" }, t, input).catch((e: unknown) => e);
    expect((err as AgentModelError).kind).toBe("no_output");
  });

  it("maps provider failures without leaking secrets", async () => {
    const secret = "synthetic-gateway-key-123";
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new APICallError({ message: `upstream rejected key ${secret}`, url: "https://gateway.example.test", requestBodyValues: {}, statusCode: 429, isRetryable: false });
      },
    });
    const err = (await generateStructured({ model, modelId: "m/x", secrets: [secret], structuredMode: "output" }, tracker(), input).catch((e: unknown) => e)) as AgentModelError;
    expect(err.kind).toBe("provider");
    expect(err.message).toContain("429");
    expect(err.message).not.toContain(secret);
  });

  it("enforces the model-call budget before calling the provider", async () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        calls++;
        return { content: [{ type: "text", text: JSON.stringify({ answer: "x" }) }], finishReason: { unified: "stop", raw: undefined }, usage: usage(), warnings: [] };
      },
    });
    const t = tracker({ llmCalls: 1 });
    await generateStructured({ model, modelId: "m/x", structuredMode: "output" }, t, input);
    const err = (await generateStructured({ model, modelId: "m/x", structuredMode: "output" }, t, input).catch((e: unknown) => e)) as AgentModelError;
    expect(err.kind).toBe("budget");
    expect(calls).toBe(1);
  });

  it("refuses a call whose worst-case cost would exceed the run limit", async () => {
    const t = tracker({ runCostLimitUsd: 0.001 }); // strategize worst case: 12000 × $2/M = $0.024
    const err = (await generateStructured({ model: textModel("{}"), modelId: "openai/gpt-5-mini" }, t, { ...input, stage: "strategize" }).catch((e: unknown) => e)) as AgentModelError;
    expect(err.kind).toBe("budget");
    expect(err.message).toMatch(/run limit/);
  });

  it("does not block on cost for a $0 model", async () => {
    const t = tracker({ runCostLimitUsd: 0 }, priceFor("nvidia/nemotron-3.5-lightning-free"));
    await expect(generateStructured({ model: textModel(JSON.stringify({ answer: "ok" })), modelId: "nvidia/nemotron-3.5-lightning-free", structuredMode: "output" }, t, input)).resolves.toEqual({ answer: "ok" });
    expect(t.usage.estimatedCostUsd).toBe(0);
  });

  it("propagates run cancellation into the model call", async () => {
    const ac = new AbortController();
    const t = tracker({}, null, ac.signal);
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_, reject) => {
          abortSignal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
        }),
    });
    const p = generateStructured({ model, modelId: "m/x", structuredMode: "output" }, t, input).catch((e: unknown) => e);
    setTimeout(() => ac.abort(new Error("User cancelled")), 5);
    const err = (await p) as AgentModelError;
    expect(err.kind).toBe("aborted");
    expect(err.message).toBe("User cancelled");
  });

  it("prefers gateway-reported cost when present", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify({ answer: "x" }) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: usage(),
        providerMetadata: { gateway: { cost: "0.0042" } },
        warnings: [],
      }),
    });
    const t = tracker();
    await generateStructured({ model, modelId: "openai/gpt-5-mini" }, t, input);
    expect(t.usage).toMatchObject({ estimatedCostUsd: 0.0042, costSource: "gateway" });
  });
});

describe("generateStructured via a forced tool call (models without native JSON output)", () => {
  function toolModel(input: string | null) {
    return new MockLanguageModelV4({
      doGenerate: async (options) => {
        expect(options.toolChoice).toEqual({ type: "tool", toolName: "answer" });
        return {
          content: input === null ? [{ type: "text", text: "sorry" }] : [{ type: "tool-call", toolCallId: "t1", toolName: "answer", input }],
          finishReason: { unified: input === null ? "stop" : "tool-calls", raw: undefined },
          usage: usage(),
          warnings: [],
        };
      },
    });
  }

  it("defaults to tool mode for models without known native support", async () => {
    const out = await generateStructured({ model: toolModel(JSON.stringify({ answer: "via tool" })), modelId: "nvidia/nemotron-3.5-lightning-free" }, tracker(), input);
    expect(out).toEqual({ answer: "via tool" });
  });

  it("maps a missing or invalid submission to no_output and records the call", async () => {
    const t = tracker();
    const e1 = (await generateStructured({ model: toolModel(null), modelId: "x/free" }, t, input).catch((e: unknown) => e)) as AgentModelError;
    expect(e1.kind).toBe("no_output");
    const e2 = (await generateStructured({ model: toolModel(JSON.stringify({ wrong: 1 })), modelId: "x/free" }, t, input).catch((e: unknown) => e)) as AgentModelError;
    expect(e2.kind).toBe("no_output");
    expect(t.usage.byStage.map((s) => s.ok)).toEqual([false, false]);
    // The SDK's ToolChoiceViolationError carries no usage, so only the second call is counted.
    expect(t.usage.inputTokens).toBe(100);
  });
});

describe("proposeToolCalls", () => {
  it("returns the model's proposals without executing anything", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          { type: "tool-call", toolCallId: "c1", toolName: "exploreCategory", input: JSON.stringify({ category: "podcast", reason: "weak" }) },
          { type: "tool-call", toolCallId: "c2", toolName: "stop", input: JSON.stringify({ reason: "enough" }) },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage: usage(),
        warnings: [],
      }),
    });
    const tools = {
      exploreCategory: tool({ description: "x", inputSchema: z.object({ category: z.string(), reason: z.string() }) }),
      stop: tool({ description: "y", inputSchema: z.object({ reason: z.string() }) }),
    };
    const calls = await proposeToolCalls({ model, modelId: "m/x", structuredMode: "output" }, tracker(), { stage: "adapt", instructions: "i", prompt: "p", tools });
    expect(calls).toEqual([
      { toolName: "exploreCategory", input: { category: "podcast", reason: "weak" } },
      { toolName: "stop", input: { reason: "enough" } },
    ]);
  });
});

describe("RunTracker", () => {
  it("aborts the shared signal at the hard deadline", async () => {
    const t = tracker({ hardDeadlineMs: 10 });
    await new Promise((r) => setTimeout(r, 30));
    expect(t.signal.aborted).toBe(true);
    expect((t.signal.reason as Error).message).toMatch(/deadline/);
  });

  it("reports the soft deadline", () => {
    let now = 0;
    const t = new RunTracker({ ...DEFAULT_AGENT_BUDGET, softDeadlineMs: 100 }, null, undefined, () => now);
    trackers.push(t);
    expect(t.pastSoftDeadline()).toBe(false);
    now = 150;
    expect(t.pastSoftDeadline()).toBe(true);
  });
});
