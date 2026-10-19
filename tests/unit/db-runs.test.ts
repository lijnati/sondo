/**
 * Run persistence against in-process Postgres (PGlite) with the real migrations.
 * Reports come from a real runAgent() over SYNTHETIC Qloo fixtures.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runAgent } from "@/lib/agent/orchestrator";
import type { AgentRunResult } from "@/lib/agent/schemas";
import { migrate } from "@/lib/db/migrate";
import { parseStoredReport } from "@/lib/db/report-schema";
import {
  appendEvents,
  createRun,
  finishRun,
  getRun,
  isCancelRequested,
  listEvents,
  listFeatured,
  requestCancel,
  runExists,
  setFeatured,
  type RunLimits,
} from "@/lib/db/runs";
import type { Db } from "@/lib/db/sql";
import { isRunId, newRunId } from "@/lib/runs/ids";

import { fakeQlooFactory, scriptedModel } from "../fixtures/agent";
import { testDb } from "../fixtures/db";

const brief = {
  brandName: "Fixture Footwear",
  brandDescription: "A fictional sustainable sneaker brand for city walkers.",
  audience: { description: "Culturally engaged young adults", ages: ["25_to_29", "30_to_34"] },
  market: "New York City",
  objective: "launch",
  anchors: [{ name: "Fixture Brand Alpha", type: "brand" }, { name: "Fixture Artist One", type: "artist" }],
};

const limits: RunLimits = { perIpPerDay: 2, dailyCap: 3, maxConcurrent: 2, staleAfterMs: 240_000 };

let completed: AgentRunResult;
beforeAll(async () => {
  const { model } = scriptedModel({});
  completed = await runAgent(brief, { qloo: fakeQlooFactory({}).factory, model: { model, modelId: "mock/model" }, price: { input: 0, output: 0 } });
  expect(completed.status).toBe("completed");
});

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await testDb());
});
beforeEach(async () => {
  await db.query("truncate runs cascade");
});
afterAll(async () => close());

const create = (over: Partial<Parameters<typeof createRun>[1]> = {}) =>
  createRun(db, { id: newRunId(), brief: completed.brief, ipHash: "ip-a", source: "web", ...over }, limits);

describe("run ids", () => {
  it("are 12-char base62, random and validated", () => {
    const ids = new Set(Array.from({ length: 200 }, newRunId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(isRunId(id)).toBe(true);
    for (const bad of ["", "abc", "zzzzzzzzzzz!", "../../etc/pas", "aaaaaaaaaaaaa"]) expect(isRunId(bad)).toBe(false);
  });
});

describe("migrations", () => {
  it("are idempotent", async () => {
    expect(await migrate(db)).toEqual([]);
  });
});

describe("createRun", () => {
  it("creates a running row", async () => {
    const r = await create();
    expect(r.kind).toBe("created");
    if (r.kind !== "created") return;
    const row = await getRun(db, r.id, limits);
    expect(row?.status).toBe("running");
    expect(row?.brief.brandName).toBe("Fixture Footwear");
    expect(row?.report).toBeNull();
    expect(await runExists(db, r.id)).toBe(true);
  });

  it("returns the existing run for a repeated idempotency key", async () => {
    const a = await create({ idempotencyKey: "key-1" });
    const b = await create({ idempotencyKey: "key-1" });
    expect(a.kind).toBe("created");
    expect(b).toEqual({ kind: "duplicate", id: (a as { id: string }).id });
  });

  it("enforces the per-IP daily limit", async () => {
    await create();
    const second = await create();
    if (second.kind === "created") await finishRun(db, second.id, { status: "failed", report: null, failureCode: "test" });
    // Finish the first so concurrency does not trip first.
    const third = await create();
    expect(third).toEqual({ kind: "limited", reason: "ip_daily" });
  });

  it("enforces the concurrency limit across IPs", async () => {
    await create({ ipHash: "ip-1" });
    await create({ ipHash: "ip-2" });
    expect(await create({ ipHash: "ip-3" })).toEqual({ kind: "limited", reason: "concurrent" });
  });

  it("enforces the global daily cap", async () => {
    for (const ip of ["ip-1", "ip-2", "ip-3"]) {
      const r = await create({ ipHash: ip });
      if (r.kind === "created") await finishRun(db, r.id, { status: "failed", report: null, failureCode: "test" });
    }
    expect(await create({ ipHash: "ip-4" })).toEqual({ kind: "limited", reason: "global_daily" });
  });

  it("does not let parallel submissions overshoot the caps", async () => {
    const results = await Promise.all(["a", "b", "c", "d", "e"].map((ip) => create({ ipHash: ip })));
    expect(results.filter((r) => r.kind === "created")).toHaveLength(limits.maxConcurrent);
  });

  it("script runs bypass web limits", async () => {
    await create({ ipHash: "ip-1" });
    await create({ ipHash: "ip-2" });
    expect((await create({ ipHash: null, source: "script" })).kind).toBe("created");
  });
});

describe("status transitions", () => {
  it("stores a validated report once, and terminal states are final", async () => {
    const r = await create();
    if (r.kind !== "created") throw new Error("not created");
    expect(await finishRun(db, r.id, { status: "completed", report: { ...completed, runId: r.id } })).toBe(true);
    expect(await finishRun(db, r.id, { status: "failed", report: null, failureCode: "late" })).toBe(false);
    const row = await getRun(db, r.id, limits);
    expect(row?.status).toBe("completed");
    expect(row?.report).toEqual({ ...completed, runId: r.id });
    expect(row?.finishedAt).toBeTruthy();
  });

  it("refuses to mark a run completed without a report", async () => {
    const r = await create();
    if (r.kind !== "created") throw new Error("not created");
    await expect(finishRun(db, r.id, { status: "completed", report: null })).rejects.toThrow();
    expect((await getRun(db, r.id, limits))?.status).toBe("running");
  });

  it("refuses a report that fails schema validation", async () => {
    const r = await create();
    if (r.kind !== "created") throw new Error("not created");
    const bad = { ...completed, concepts: [{ ...completed.concepts[0], culturalInsight: { text: "x", kind: "evidence", evidenceIds: ["not-an-id"], support: "direct" } }] };
    await expect(finishRun(db, r.id, { status: "partial", report: bad as never })).rejects.toThrow();
  });

  it("marks a stale running row as interrupted on read", async () => {
    const r = await create();
    if (r.kind !== "created") throw new Error("not created");
    await db.query("update runs set started_at = now() - interval '10 minutes' where id = $1", [r.id]);
    const row = await getRun(db, r.id, limits);
    expect(row?.status).toBe("interrupted");
    // A late but genuine result may still land on an interrupted run.
    expect(await finishRun(db, r.id, { status: "partial", report: { ...completed, runId: r.id, status: "partial" } })).toBe(true);
    expect((await getRun(db, r.id, limits))?.status).toBe("partial");
  });

  it("stale rows do not count towards concurrency", async () => {
    const a = await create({ ipHash: "ip-1" });
    await create({ ipHash: "ip-2" });
    await db.query("update runs set started_at = now() - interval '10 minutes' where id = $1", [(a as { id: string }).id]);
    expect((await create({ ipHash: "ip-3" })).kind).toBe("created");
  });

  it("cancel requests only apply to running runs", async () => {
    const r = await create();
    if (r.kind !== "created") throw new Error("not created");
    expect(await isCancelRequested(db, r.id)).toBe(false);
    expect(await requestCancel(db, r.id)).toBe(true);
    expect(await isCancelRequested(db, r.id)).toBe(true);
    await finishRun(db, r.id, { status: "cancelled", report: null, failureCode: "cancelled" });
    expect(await requestCancel(db, r.id)).toBe(false);
    expect(await requestCancel(db, "zzzzzzzzzzzz")).toBe(false);
  });
});

describe("events", () => {
  it("appends in order, ignores replays and pages by sequence", async () => {
    const r = await create();
    if (r.kind !== "created") throw new Error("not created");
    await appendEvents(db, r.id, [
      { seq: 0, event: { t: "run.started", runId: r.id, budget: { qloo: 24, llm: 4 } } },
      { seq: 1, event: { t: "stage", stage: "planning", phase: "started" } },
    ]);
    await appendEvents(db, r.id, [{ seq: 1, event: { t: "stage", stage: "planning", phase: "started" } }]);
    await appendEvents(db, r.id, [{ seq: 2, event: { t: "stage", stage: "planning", phase: "finished", ms: 12 } }]);
    expect((await listEvents(db, r.id, -1)).map((e) => e.seq)).toEqual([0, 1, 2]);
    expect((await listEvents(db, r.id, 1)).map((e) => e.seq)).toEqual([2]);
  });
});

describe("featured", () => {
  it("only completed runs can be featured, and listing returns card data", async () => {
    const a = await create({ ipHash: null, source: "script" });
    const b = await create({ ipHash: null, source: "script" });
    if (a.kind !== "created" || b.kind !== "created") throw new Error("not created");
    await finishRun(db, a.id, { status: "completed", report: { ...completed, runId: a.id } });
    await finishRun(db, b.id, { status: "partial", report: { ...completed, runId: b.id, status: "partial" } });
    expect(await setFeatured(db, a.id, 1)).toBe(true);
    expect(await setFeatured(db, b.id, 2)).toBe(false);
    const cards = await listFeatured(db);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: a.id, brandName: "Fixture Footwear", market: "New York City", evidenceCount: completed.evidence.length });
    expect(cards[0]?.concepts).toHaveLength(3);
  });
});

describe("report schema", () => {
  it("round-trips a real run result without dropping fields", () => {
    expect(parseStoredReport(JSON.parse(JSON.stringify(completed)))).toEqual(JSON.parse(JSON.stringify(completed)));
  });
});
