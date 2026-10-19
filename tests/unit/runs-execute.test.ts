/**
 * executeRun: the real orchestrator over SYNTHETIC Qloo fixtures and a scripted model,
 * persisted to in-process Postgres. Proves wiring, persistence, cancellation and event
 * hygiene — not live API behavior.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { Brief } from "@/lib/agent/brief";
import { DEFAULT_AGENT_BUDGET, type AgentBudget } from "@/lib/agent/budget";
import type { AgentDeps } from "@/lib/agent/orchestrator";
import type { AgentRunResult } from "@/lib/agent/schemas";
import type { RunEvent } from "@/lib/agent/types";
import { createRun, getRun, listEvents, requestCancel } from "@/lib/db/runs";
import type { Db } from "@/lib/db/sql";
import { PublicRunEvent, type SequencedEvent } from "@/lib/runs/events";
import { executeRun, toPublicEvent } from "@/lib/runs/execute";
import { newRunId } from "@/lib/runs/ids";
import { integrityCheck } from "@/lib/runs/integrity";

import { fakeQlooFactory, scriptedModel, type FakeQlooOptions, type ModelScript } from "../fixtures/agent";
import { testDb } from "../fixtures/db";

const brief = Brief.parse({
  brandName: "Fixture Footwear",
  brandDescription: "A fictional sustainable sneaker brand for city walkers.",
  audience: { description: "Culturally engaged young adults", ages: ["25_to_29", "30_to_34"] },
  market: "New York City",
  objective: "launch",
  anchors: [{ name: "Fixture Brand Alpha", type: "brand" }, { name: "Fixture Artist One", type: "artist" }],
});

const SECRET = "sk-test-secret-value-123";
const limits = { perIpPerDay: 50, dailyCap: 50, maxConcurrent: 10, staleAfterMs: 240_000 };

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await testDb());
});
beforeEach(async () => {
  await db.query("truncate runs cascade");
});
afterAll(async () => close());

function deps(script: ModelScript = {}, qloo: FakeQlooOptions = {}, budget: Partial<AgentBudget> = {}): AgentDeps {
  const { model } = scriptedModel(script);
  return { qloo: fakeQlooFactory(qloo).factory, model: { model, modelId: "mock/model", secrets: [SECRET] }, price: { input: 0, output: 0 }, budget };
}

async function start(agent: AgentDeps, opts: { onEvent?: (e: SequencedEvent, id: string) => void; cancelPollMs?: number } = {}) {
  const id = newRunId();
  const created = await createRun(db, { id, brief, ipHash: "ip", source: "web" }, limits);
  expect(created.kind).toBe("created");
  const streamed: SequencedEvent[] = [];
  const outcome = await executeRun(id, brief, {
    db,
    agent,
    limits,
    flushMs: 20,
    cancelPollMs: opts.cancelPollMs ?? 20,
    onEvent: (e) => {
      streamed.push(e);
      opts.onEvent?.(e, id);
    },
  });
  return { id, outcome, streamed, row: await getRun(db, id, limits), stored: await listEvents(db, id, -1) };
}

describe("executeRun", () => {
  it("runs the agent, streams public events and persists a completed report", async () => {
    const { id, outcome, streamed, row, stored } = await start(deps());
    expect(outcome.status).toBe("completed");
    expect(row?.status).toBe("completed");
    expect(row?.report?.runId).toBe(id);
    expect(row?.report?.concepts).toHaveLength(3);

    // Stream and store carry the same, gap-free sequence.
    expect(stored.map((e) => e.seq)).toEqual(streamed.map((e) => e.seq));
    expect(stored.map((e) => e.seq)).toEqual(stored.map((_, i) => i));
    expect(stored[0]?.event.t).toBe("run.started");
    expect(stored.at(-1)?.event).toEqual({ t: "run.finished", runId: id, status: "completed" });
    for (const s of ["planning", "research", "critique", "strategy", "validation"]) {
      expect(stored.some((e) => e.event.t === "stage" && e.event.stage === s)).toBe(true);
    }
    expect(stored.some((e) => e.event.t === "qloo")).toBe(true);
    expect(stored.some((e) => e.event.t === "evidence")).toBe(true);
    for (const e of stored) expect(PublicRunEvent.safeParse(e.event).success).toBe(true);
  });

  it("keeps Qloo params, ids, secrets and error text out of public events", async () => {
    const { stored, row } = await start(deps({ failStages: ["plan"] }));
    const text = JSON.stringify(stored);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain("signal.");
    expect(text).not.toContain("filter.type");
    expect(text).not.toContain("urn:entity");
    for (const ref of row?.report?.refs ?? []) expect(text).not.toContain(ref.qlooId);
    expect(stored.some((e) => e.event.t === "model" && !e.event.ok)).toBe(true);
  });

  it("finishes and persists even when the client stream is gone", async () => {
    const { outcome, row } = await start(deps(), {
      onEvent: () => {
        throw new TypeError("Invalid state: Controller is already closed");
      },
    });
    expect(outcome.status).toBe("completed");
    expect(row?.status).toBe("completed");
  });

  it("stops on a cancel request from another instance and stores what it has", async () => {
    let requested = false;
    const { row, outcome } = await start(deps({}, { delayMs: 40 }), {
      onEvent: (e, id) => {
        if (!requested && e.event.t === "qloo") {
          requested = true;
          void requestCancel(db, id);
        }
      },
    });
    expect(outcome.status).toBe("cancelled");
    expect(row?.status).toBe("cancelled");
    expect(row?.report?.warnings.join(" ")).toContain("cancelled");
  });

  it("returns an honest partial at the hard deadline", async () => {
    const { row } = await start(deps({}, { delayMs: 30 }, { hardDeadlineMs: 50 }));
    expect(row?.status).toBe("partial");
    expect(row?.report?.warnings.join(" ")).toContain("time limit");
  });

  it("fails cleanly when Qloo rejects the key", async () => {
    const { row } = await start(deps({}, { status401: true }));
    expect(row?.status).toBe("failed");
    expect(row?.report?.warnings.join(" ")).toContain("Qloo rejected the API key");
  });

  it("never exceeds the agent budgets", async () => {
    const { row } = await start(deps());
    const usage = row?.report?.usage;
    expect(usage?.qloo.calls).toBeLessThanOrEqual(DEFAULT_AGENT_BUDGET.qlooCalls);
    expect(usage?.llm.calls).toBeLessThanOrEqual(DEFAULT_AGENT_BUDGET.llmCalls);
    expect(usage?.qloo.budget).toBe(DEFAULT_AGENT_BUDGET.qlooCalls);
  });
});

describe("integrityCheck", () => {
  let good: AgentRunResult;
  beforeAll(async () => {
    const r = await start(deps());
    good = r.row?.report as AgentRunResult;
  });

  it("passes a validated completed run", () => {
    expect(integrityCheck(good, DEFAULT_AGENT_BUDGET)).toEqual({ ok: true, reasons: [] });
  });

  it("fails an invented citation", () => {
    const bad = structuredClone(good);
    bad.concepts[0]!.claims[0]!.evidenceIds = ["E9999"];
    expect(integrityCheck(bad, DEFAULT_AGENT_BUDGET).ok).toBe(false);
  });

  it("fails fewer than three grounded concepts", () => {
    const bad = structuredClone(good);
    bad.concepts[1]!.grounding = "partial";
    expect(integrityCheck(bad, DEFAULT_AGENT_BUDGET).reasons.join(" ")).toContain("grounded");
  });

  it("fails a blown budget", () => {
    const bad = structuredClone(good);
    bad.usage.qloo.calls = 99;
    expect(integrityCheck(bad, DEFAULT_AGENT_BUDGET).ok).toBe(false);
  });
});

describe("toPublicEvent", () => {
  it("maps tool calls to product-level activity only", () => {
    const e: RunEvent = {
      t: "tool.call",
      record: { callId: "c1", node: "explore", tool: "insights", path: "/v2/insights", params: { "filter.type": "urn:entity:podcast", "signal.interests.entities": "abc" }, status: 200, latencyMs: 412, cached: true, resultCount: 18, retry: 0, startedAt: "2026-10-19T00:00:00Z", error: "x" },
    };
    expect(toPublicEvent(e, [])).toEqual({ t: "qloo", kind: "insights", category: "podcast", ok: true, cached: true, results: 18, ms: 412 });
  });

  it("drops model error text and the agent's own run.finished", () => {
    expect(toPublicEvent({ t: "llm.call", stage: "plan", ok: false, ms: 5, inputTokens: 10, outputTokens: 0, error: `boom ${SECRET}` }, [SECRET])).toEqual({ t: "model", stage: "plan", ok: false, ms: 5 });
    expect(toPublicEvent({ t: "run.finished", runId: "x", status: "completed" }, [])).toBeNull();
  });

  it("drops model-written decision reasons", () => {
    const out = toPublicEvent(
      { t: "decision", decision: { id: "D1", round: 1, proposedBy: "model", action: { tool: "nicheLens", category: "artist" }, reason: "secret thoughts", outcome: "executed", evidenceAdded: 4 } },
      [],
    );
    expect(out).toEqual({ t: "decision", proposedBy: "model", tool: "nicheLens", target: "artist", outcome: "executed", evidenceAdded: 4 });
  });

  it("redacts secrets in warnings", () => {
    expect(toPublicEvent({ t: "warning", code: "w", message: `key ${SECRET} leaked` }, [SECRET])).toEqual({ t: "warning", message: "key <redacted> leaked" });
  });
});

describe("partial explanations", () => {
  it("says why a run is partial", async () => {
    const { row } = await start(deps({}, { empty: ["artist", "brand", "movie", "podcast", "tv_show", "place", "book", "destination", "person"] }));
    expect(row?.status).toBe("partial");
    expect(row?.report?.warnings).toContainEqual(expect.stringMatching(/^Marked partial: .*fewer than three grounded concepts/));
  });
});

describe("final write resilience", () => {
  it("retries a transient database failure when storing the report", async () => {
    const id = newRunId();
    await createRun(db, { id, brief, ipHash: "ip", source: "web" }, limits);
    let failures = 2;
    const flaky: Db = {
      query: (text, params) => {
        if (text.startsWith("update runs set status") && failures-- > 0) return Promise.reject(new Error("Error connecting to database: TypeError: fetch failed"));
        return db.query(text, params);
      },
      transaction: (s) => db.transaction(s),
    };
    const { status } = await executeRun(id, brief, { db: flaky, agent: deps(), limits, flushMs: 20, cancelPollMs: 20, writeBackoffMs: [5, 5, 5] });
    expect(status).toBe("completed");
    expect((await getRun(db, id, limits))?.status).toBe("completed");
  });
});
