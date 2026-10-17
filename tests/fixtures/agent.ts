/**
 * SYNTHETIC agent fixtures: a fake Qloo HTTP backend (fictional names, fake ids, shapes
 * matching the live probe) and a scripted mock model. Deterministic; no network.
 * Passing tests with these fixtures is NOT evidence of live API behavior.
 */
import { MockLanguageModelV4 } from "ai/test";

import { createQlooClient, type QlooClient } from "@/lib/qloo/client";
import type { ToolCallRecord } from "@/lib/qloo/types";

export const KNOWN_ANCHORS: Record<string, string> = {
  "fixture brand alpha": "urn:entity:brand",
  "fixture artist one": "urn:entity:artist",
  "fixture show": "urn:entity:tv_show",
};

export interface FakeQlooOptions {
  /** filter.type suffixes that return empty lists (e.g. ["podcast"]). */
  empty?: string[];
  status401?: boolean;
  /** Names to use for target entities (e.g. a prompt-injection string). */
  hostileName?: string;
  delayMs?: number;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function entity(id: string, name: string, type: string, popularity: number, affinity: number, shared: boolean) {
  return {
    entity_id: id,
    name,
    subtype: `urn:entity:${type}`,
    popularity,
    query: { affinity },
    tags: [
      ...(shared ? [{ id: "urn:tag:keyword:fixture_shared", name: "Fixture Shared Theme", type: "urn:tag:keyword" }] : []),
      { id: `urn:tag:genre:fixture_${type}`, name: `Fixture ${type} genre`, type: "urn:tag:genre" },
    ],
  };
}

export function fakeQlooFetch(opts: FakeQlooOptions = {}) {
  const calls: URL[] = [];
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    if (opts.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, opts.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(init.signal?.reason);
        });
      });
    }
    if (opts.status401) return json({ error: "No API key found in request" }, 401);
    const q = url.searchParams;
    if (url.pathname === "/search") {
      const query = (q.get("query") ?? "").toLowerCase();
      const known = KNOWN_ANCHORS[query];
      const types = (q.get("types") ?? "").split(",");
      if (known && types.includes(known)) return json({ results: [{ entity_id: `anchor-${query.replace(/\s+/g, "-")}`, name: q.get("query"), types: [known], popularity: 0.9, tags: [] }] });
      // Unknown names get an unrelated popular result, like the live API.
      return json({ results: [{ entity_id: "unrelated-1", name: "Totally Unrelated Megabrand", types: ["urn:entity:brand"], popularity: 0.99, tags: [] }] });
    }
    if (url.pathname === "/v2/insights") {
      const ft = q.get("filter.type") ?? "";
      if (ft === "urn:tag") {
        return json({ success: true, results: { tags: [1, 2, 3].map((i) => ({ tag_id: `urn:tag:keyword:theme_${i}`, name: `Fixture Theme ${i}`, subtype: "urn:tag:keyword:media", types: [], popularity: 0.4, query: { affinity: 0.9 - i / 100 } })) } });
      }
      if (ft === "urn:demographics") {
        const ids = (q.get("signal.interests.entities") ?? "").split(",");
        return json({ success: true, results: { demographics: ids.map((id) => ({ entity_id: id, query: { age: { "24_and_younger": 0.1, "25_to_29": 0.2, "30_to_34": 0.1, "35_to_44": -0.1, "45_to_54": -0.2, "55_and_older": -0.4 }, gender: { male: -0.1, female: 0.1 } } })) } });
      }
      const type = ft.replace("urn:entity:", "");
      if (opts.empty?.includes(type)) return json({ success: true, results: { entities: [] } });
      const isTarget = q.has("signal.demographics.age");
      const niche = q.has("filter.popularity.max");
      const seeds = q.get("signal.interests.entities") ?? "";
      const bridged = seeds.split(",").some((s) => s.startsWith("ent-") || s.startsWith("niche-") || s.startsWith("bridge-"));
      const prefix = niche ? "niche" : bridged ? "bridge" : "ent";
      const order = isTarget ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] : [5, 6, 7, 0, 8, 9, 1, 2, 3, 4];
      const entities = order.map((i, rank) => {
        const name = i === 0 && opts.hostileName && isTarget ? opts.hostileName : `Fixture ${type} ${prefix} ${i}`;
        // Every third item is below-mainstream so distinctive signals exist.
        const pop = niche ? 0.3 + i / 100 : i % 3 === 1 ? 0.5 : 0.97;
        return entity(`${prefix}-${type}-${i}`, name, type, pop, 0.95 - rank / 100, i < 2);
      });
      return json({ success: true, results: { entities } });
    }
    return json({}, 404);
  };
  return { fetchFn, calls };
}

export function fakeQlooFactory(opts: FakeQlooOptions = {}) {
  const fake = fakeQlooFetch(opts);
  const factory = ({ maxCalls, onCall }: { maxCalls: number; onCall: (r: ToolCallRecord) => void }): QlooClient =>
    createQlooClient({ apiKey: "synthetic-qloo-key", fetch: fake.fetchFn as unknown as typeof fetch, budget: { maxCalls, minIntervalMs: 0, timeoutMs: 2_000 }, onCall });
  return { factory, calls: fake.calls };
}

// ── scripted model ────────────────────────────────────────────────────────

type Stage = "plan" | "adapt" | "strategize" | "repair";

export interface ModelScript {
  plan?: object | "invalid";
  /** Tool calls for the adaptive round, or a function of the prompt text. */
  adapt?: { toolName: string; input: unknown }[] | ((prompt: string) => { toolName: string; input: unknown }[]);
  strategize?: object | "invalid" | ((prompt: string) => unknown);
  repair?: object | ((prompt: string) => unknown);
  /** Throw a provider-style error for these stages. */
  failStages?: Stage[];
  /** On the first call of these stages, answer in prose instead of submitting the tool (live free-model behavior). */
  noSubmitOnce?: Stage[];
}

const usage = { inputTokens: { total: 500, noCache: 500, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 300, text: 300, reasoning: undefined } };

function stageOf(system: string, toolNames: string[]): Stage {
  // Structured output via a forced tool call ("tool" mode) uses one schema-named tool.
  if (toolNames.length && !toolNames.includes("research_plan") && !toolNames.includes("campaign_strategy")) return "adapt";
  if (system.includes("research planner")) return "plan";
  if (system.includes("fixing a campaign strategy")) return "repair";
  return "strategize";
}

export function scriptedModel(script: ModelScript) {
  const seen: { stage: Stage; prompt: string }[] = [];
  const skipped = new Set<Stage>();
  const model = new MockLanguageModelV4({
    doGenerate: async (options) => {
      const system = options.prompt.filter((m) => m.role === "system").map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
      const user = options.prompt
        .filter((m) => m.role === "user")
        .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("\n");
      const toolNames = (options.tools ?? []).map((t) => t.name);
      const stage = stageOf(system, toolNames);
      seen.push({ stage, prompt: user });
      if (script.failStages?.includes(stage)) {
        const { APICallError } = await import("ai");
        throw new APICallError({ message: "synthetic upstream failure", url: "https://gateway.example.test", requestBodyValues: {}, statusCode: 503, isRetryable: false });
      }
      if (stage === "adapt") {
        const calls = typeof script.adapt === "function" ? script.adapt(user) : (script.adapt ?? [{ toolName: "stop", input: { reason: "enough" } }]);
        return {
          content: calls.map((c, i) => ({ type: "tool-call" as const, toolCallId: `call-${i}`, toolName: c.toolName, input: JSON.stringify(c.input) })),
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage,
          warnings: [],
        };
      }
      const value = script[stage];
      const resolved = typeof value === "function" ? (value as (p: string) => unknown)(user) : value;
      const text = resolved === "invalid" ? "{ not valid json" : JSON.stringify(resolved ?? defaultFor(stage, user));
      const schemaTool = toolNames.find((n) => n === "research_plan" || n === "campaign_strategy");
      if (schemaTool && script.noSubmitOnce?.includes(stage) && !skipped.has(stage)) {
        skipped.add(stage);
        return { content: [{ type: "text" as const, text: "Here is my strategy in prose..." }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
      }
      if (schemaTool) {
        return {
          content: [{ type: "tool-call" as const, toolCallId: "structured-0", toolName: schemaTool, input: text }],
          finishReason: { unified: "tool-calls" as const, raw: undefined },
          usage,
          warnings: [],
        };
      }
      return { content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: undefined }, usage, warnings: [] };
    },
  });
  return { model, seen };
}

/** E# ids per category, parsed from the evidence block the agent sent to the model. */
export function evidenceByCategory(prompt: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of prompt.matchAll(/^(E\d+) \| ([a-z_]+) \|/gm)) {
    const list = out.get(m[2] as string) ?? [];
    list.push(m[1] as string);
    out.set(m[2] as string, list);
  }
  return out;
}

export const defaultPlan = {
  anchors: [{ name: "Fixture Brand Alpha", type: "brand", alternateTypes: [] }],
  peerBrands: [],
  ages: ["25_to_29", "30_to_34"],
  gender: null,
  categories: ["artist", "podcast", "tv_show", "brand"],
  researchQuestions: ["What over-indexes for this audience?"],
  notModeled: ["sustainability values"],
  rationale: "synthetic plan",
};

/** A well-formed strategy that cites distinct evidence per concept, built from the prompt. */
export function groundedStrategy(prompt: string) {
  const by = evidenceByCategory(prompt);
  // Only categories deep enough to give each concept distinct items.
  const cats = [...by.keys()].filter((c) => (by.get(c)?.length ?? 0) >= 7);
  const pick = (ci: number, from: number) => {
    const ids: string[] = [];
    for (let k = 0; k < 3; k++) {
      const list = by.get(cats[(ci + k) % cats.length] as string) ?? [];
      const id = list[from + k];
      if (id) ids.push(id);
    }
    return ids;
  };
  const angles = ["mainstream_anchor", "distinctive_niche", "cross_category_bridge"] as const;
  return {
    opportunities: [{ title: "Shared cultural theme", rationale: { text: "The audience's signals cluster around a shared theme.", kind: "evidence", evidenceIds: pick(0, 0).slice(0, 2) }, findingIds: ["F1"] }],
    concepts: angles.map((angle, i) => {
      const ids = pick(i, i * 2);
      return {
        angle,
        name: `Concept ${["Alpha", "Beta", "Gamma"][i]}`,
        positioning: "A positioning built on shared cultural taste.",
        intendedAudience: "Young adults in the market",
        culturalInsight: { text: "These signals rank highly for this audience.", kind: "evidence", evidenceIds: ids.slice(0, 2) },
        concept: "A campaign around the cited cultural signals.",
        opportunities: [{ kind: "partnership", idea: "Collaborate with a cited partner.", evidenceIds: ids.slice(0, 1) }],
        channels: ["creator collaboration"],
        claims: [{ text: "The cited items over-index for this audience.", kind: "evidence", evidenceIds: ids }],
        assumptions: ["Partners are open to collaboration."],
        risks: ["Affinity is not purchase intent."],
      };
    }),
  };
}

function defaultFor(stage: Stage, prompt: string): unknown {
  if (stage === "plan") return defaultPlan;
  return groundedStrategy(prompt);
}
