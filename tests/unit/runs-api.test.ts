/**
 * /api/runs handlers with injected dependencies: in-process Postgres, SYNTHETIC Qloo
 * fixtures and a scripted model. Proves request handling and streaming — not live APIs.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AgentDeps } from "@/lib/agent/orchestrator";
import type { Db } from "@/lib/db/sql";
import { SequencedEventSchema, type PublicRunEvent } from "@/lib/runs/events";
import { cancelRunHandler, getRunHandler, postRunHandler, type RunsApiDeps } from "@/lib/runs/handlers";
import { createLineDecoder } from "@/lib/runs/ndjson";

import { fakeQlooFactory, scriptedModel, type FakeQlooOptions } from "../fixtures/agent";
import { testDb } from "../fixtures/db";

const brief = {
  brandName: "Fixture Footwear",
  brandDescription: "A fictional sustainable sneaker brand for city walkers.",
  audience: { description: "Culturally engaged young adults", ages: ["25_to_29", "30_to_34"] },
  market: "New York City",
  objective: "launch",
  anchors: [{ name: "Fixture Brand Alpha", type: "brand" }, { name: "Fixture Artist One", type: "artist" }],
};

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await testDb());
});
beforeEach(async () => {
  await db.query("truncate runs cascade");
});
afterAll(async () => close());

function api(over: Partial<RunsApiDeps["config"]> = {}, qloo: FakeQlooOptions = {}, agentOk = true) {
  const pending: Promise<unknown>[] = [];
  const deps: RunsApiDeps = {
    db,
    config: { liveRuns: true, ipSecret: "x".repeat(32), limits: { perIpPerDay: 5, dailyCap: 40, maxConcurrent: 2, staleAfterMs: 240_000 }, ...over },
    agentDeps: (): AgentDeps => {
      if (!agentOk) throw new Error("QLOO_API_KEY is not configured");
      const { model } = scriptedModel({});
      return { qloo: fakeQlooFactory(qloo).factory, model: { model, modelId: "mock/model" }, price: { input: 0, output: 0 } };
    },
    waitUntil: (p) => void pending.push(p),
    flushMs: 20,
    cancelPollMs: 20,
  };
  return { deps, settle: () => Promise.all(pending) };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("http://test/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

async function readEvents(res: Response) {
  const decoder = createLineDecoder();
  const events: PublicRunEvent[] = [];
  const reader = res.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.push(new TextDecoder().decode(value))) events.push(SequencedEventSchema.parse(JSON.parse(line)).event);
  }
  for (const line of decoder.end()) events.push(SequencedEventSchema.parse(JSON.parse(line)).event);
  return events;
}

describe("POST /api/runs", () => {
  it("streams a real run as NDJSON and persists it", async () => {
    const { deps, settle } = api();
    const res = await postRunHandler(post({ brief }), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const events = await readEvents(res);
    await settle();
    const first = events[0];
    expect(first?.t).toBe("run.started");
    const runId = first?.t === "run.started" ? first.runId : "";
    expect(res.headers.get("x-run-id")).toBe(runId);
    expect(events.at(-1)).toEqual({ t: "run.finished", runId, status: "completed" });

    const status = await getRunHandler(runId, new URL("http://test/api/runs/x?after=-1"), deps);
    const body = (await status.json()) as { status: string; done: boolean; events: unknown[] };
    expect(body.status).toBe("completed");
    expect(body.done).toBe(true);
    expect(body.events).toHaveLength(events.length);
    expect(JSON.stringify(body)).not.toContain("brandDescription");
  });

  it("keeps running when the client disconnects", async () => {
    const { deps, settle } = api();
    const res = await postRunHandler(post({ brief }), deps);
    const runId = res.headers.get("x-run-id") as string;
    await res.body!.cancel();
    await settle();
    const body = (await (await getRunHandler(runId, new URL("http://test/x"), deps)).json()) as { status: string };
    expect(body.status).toBe("completed");
  });

  it("rejects an invalid brief with field messages and creates nothing", async () => {
    const { deps } = api();
    const res = await postRunHandler(post({ brief: { ...brief, brandName: "", audience: { description: "x", ages: ["18_to_21"] } } }), deps);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; issues: { path: string; message: string }[] };
    expect(body.error).toBe("invalid_brief");
    expect(body.issues.map((i) => i.path)).toEqual(expect.arrayContaining(["brandName", "audience.description", "audience.ages.0"]));
    expect(await db.query("select 1 from runs")).toHaveLength(0);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    const { deps } = api();
    expect((await postRunHandler(post("{nope"), deps)).status).toBe(400);
    expect((await postRunHandler(post({ brief, pad: "x".repeat(20_000) }), deps)).status).toBe(413);
  });

  it("returns the same run for a repeated idempotency key", async () => {
    const { deps, settle } = api();
    const key = { "idempotency-key": "submit-0123456789" };
    const a = await postRunHandler(post({ brief }, key), deps);
    const b = await postRunHandler(post({ brief }, key), deps);
    expect(b.status).toBe(409);
    expect(((await b.json()) as { runId: string }).runId).toBe(a.headers.get("x-run-id"));
    await a.body!.cancel();
    await settle();
  });

  it("rate limits per IP", async () => {
    const { deps, settle } = api({ limits: { perIpPerDay: 1, dailyCap: 40, maxConcurrent: 5, staleAfterMs: 240_000 } });
    const a = await postRunHandler(post({ brief }), deps);
    const b = await postRunHandler(post({ brief }), deps);
    expect(b.status).toBe(429);
    expect(((await b.json()) as { error: string }).error).toBe("ip_daily");
    expect(b.headers.get("retry-after")).toBeTruthy();
    await a.body!.cancel();
    await settle();
  });

  it("refuses new runs when live runs are paused", async () => {
    const { deps } = api({ liveRuns: false });
    const res = await postRunHandler(post({ brief }), deps);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("paused");
  });

  it("reports unavailable without naming missing secrets", async () => {
    const { deps } = api({}, {}, false);
    const res = await postRunHandler(post({ brief }), deps);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toContain("QLOO_API_KEY");
    expect(await db.query("select 1 from runs")).toHaveLength(0);
  });
});

describe("GET /api/runs/[id] and cancel", () => {
  it("returns 404 for malformed and unknown ids", async () => {
    const { deps } = api();
    expect((await getRunHandler("../etc", new URL("http://test/x"), deps)).status).toBe(404);
    expect((await getRunHandler("zzzzzzzzzzzz", new URL("http://test/x"), deps)).status).toBe(404);
    expect((await cancelRunHandler("zzzzzzzzzzzz", deps)).status).toBe(404);
  });

  it("cancels a running run", async () => {
    const { deps, settle } = api({}, { delayMs: 40 });
    const res = await postRunHandler(post({ brief }), deps);
    const runId = res.headers.get("x-run-id") as string;
    expect((await cancelRunHandler(runId, deps)).status).toBe(202);
    await res.body!.cancel();
    await settle();
    const body = (await (await getRunHandler(runId, new URL("http://test/x"), deps)).json()) as { status: string };
    expect(body.status).toBe("cancelled");
    expect((await cancelRunHandler(runId, deps)).status).toBe(409);
  });
});

describe("NDJSON line decoder", () => {
  it("joins lines split across chunks", () => {
    const d = createLineDecoder();
    expect(d.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(d.push(':2}\n\n{"c":3}')).toEqual(['{"b":2}']);
    expect(d.end()).toEqual(['{"c":3}']);
  });
});
