import { describe, expect, it, vi } from "vitest";

import { MemoryCache } from "@/lib/qloo/cache";
import { createQlooClient, type QlooClientOptions, type QlooLogEvent } from "@/lib/qloo/client";
import { QlooError } from "@/lib/qloo/errors";
import type { ToolCallRecord } from "@/lib/qloo/types";

const KEY = "synthetic-test-key-0000";

type Step = { status: number; body?: unknown; headers?: Record<string, string> } | "timeout" | "network";

/** Fake fetch that plays a scripted sequence of responses and records requests. */
function scripted(steps: Step[]) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
    const step = steps.shift() ?? { status: 200, body: { results: [] } };
    if (step === "network") throw new TypeError(`fetch failed for key ${KEY}`);
    if (step === "timeout") {
      // Hang until the client's timeout (or caller) aborts the signal.
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }
    const body = typeof step.body === "string" ? step.body : JSON.stringify(step.body ?? {});
    return new Response(body, { status: step.status, headers: step.headers ?? {} });
  });
  return { fetchFn, calls };
}

function setup(steps: Step[], extra: Partial<QlooClientOptions> = {}) {
  const { fetchFn, calls } = scripted(steps);
  const records: ToolCallRecord[] = [];
  const logs: QlooLogEvent[] = [];
  const sleeps: number[] = [];
  const client = createQlooClient({
    apiKey: KEY,
    fetch: fetchFn as unknown as typeof fetch,
    onCall: (r) => records.push(r),
    logger: (e) => logs.push(e),
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      if (signal?.aborted) throw new QlooError("aborted", "cancelled");
    },
    budget: { timeoutMs: 30, minIntervalMs: 0 },
    ...extra,
  });
  return { client, calls, records, logs, sleeps, fetchFn };
}

const get = (c: ReturnType<typeof setup>["client"], params: Record<string, string> = { "filter.type": "urn:entity:artist" }, signal?: AbortSignal) =>
  c.get("/v2/insights", params, { tool: "insights", ...(signal ? { signal } : {}) });

async function expectKind(p: Promise<unknown>, kind: string) {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(QlooError);
  expect((err as QlooError).kind).toBe(kind);
  return err as QlooError;
}

describe("Qloo client: requests and auth", () => {
  it("sends GET to the hackathon host with X-Api-Key and encoded, sorted params", async () => {
    const { client, calls, fetchFn } = setup([{ status: 200, body: { results: { entities: [{}, {}] } } }]);
    const res = await get(client, { take: "5", "signal.location.query": "New York, NY", "filter.type": "urn:entity:artist" });
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(calls[0]?.url).toBe(
      "https://hackathon.api.qloo.com/v2/insights?filter.type=urn%3Aentity%3Aartist&signal.location.query=New+York%2C+NY&take=5",
    );
    expect(calls[0]?.headers["X-Api-Key"]).toBe(KEY);
    expect(res.record).toMatchObject({ status: 200, resultCount: 2, cached: false, retry: 0, path: "/v2/insights" });
  });

  it("refuses to construct without a key", () => {
    expect(() => createQlooClient({ apiKey: "  " })).toThrow(QlooError);
  });

  it("never exposes the key in errors, trace records or logs", async () => {
    const { client, records, logs } = setup([{ status: 400, body: `bad request for ${KEY}` }, "network", "network"]);
    const e1 = await expectKind(get(client), "bad_request");
    const e2 = await expectKind(get(client), "network");
    const everything = JSON.stringify({ m1: e1.message, m2: e2.message, records, logs });
    expect(everything).not.toContain(KEY);
    expect(everything).toContain("<redacted>");
  });

  it("on 401: no retry, and every later call fails fast without a request", async () => {
    const { client, fetchFn, sleeps } = setup([{ status: 401, body: { error: "No API key found" } }]);
    await expectKind(get(client), "unauthorized");
    await expectKind(get(client), "unauthorized");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
    expect(client.stats().halted).toBe("unauthorized");
  });

  it.each([
    [400, "bad_request"],
    [403, "forbidden"],
    [404, "not_found"],
  ])("on %i: fails immediately with %s and no retry", async (status, kind) => {
    const { client, fetchFn } = setup([{ status, body: { error: "x" } }]);
    const err = await expectKind(get(client), kind);
    expect(err.status).toBe(status);
    expect(err.record?.status).toBe(status);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("Qloo client: retries", () => {
  it("retries a 429 once, honouring Retry-After (seconds)", async () => {
    const { client, sleeps, records } = setup([
      { status: 429, headers: { "retry-after": "2" } },
      { status: 200, body: { results: { entities: [{}] } } },
    ]);
    const res = await get(client);
    expect(sleeps).toEqual([2000]);
    expect(res.record.retry).toBe(1);
    expect(records).toHaveLength(1);
  });

  it("caps Retry-After and halts new calls after a second 429", async () => {
    const { client, sleeps, fetchFn } = setup([
      { status: 429, headers: { "retry-after": "3600" } },
      { status: 429 },
    ]);
    await expectKind(get(client), "rate_limited");
    expect(sleeps).toEqual([10_000]);
    await expectKind(get(client), "rate_limited");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(client.stats().halted).toBe("rate_limited");
  });

  it("retries a 5xx once with the default backoff, then fails", async () => {
    const { client, sleeps, fetchFn } = setup([{ status: 503 }, { status: 502 }]);
    const err = await expectKind(get(client), "server");
    expect(err.record?.retry).toBe(1);
    expect(sleeps).toEqual([1500]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("times out, retries once, then reports a timeout", async () => {
    const { client, fetchFn, records } = setup(["timeout", "timeout"]);
    const err = await expectKind(get(client), "timeout");
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(records[0]?.status).toBe("timeout");
    expect(err.record?.retry).toBe(1);
  });

  it("recovers when the retry after a network error succeeds", async () => {
    const { client } = setup(["network", { status: 200, body: { results: [] } }]);
    const res = await get(client);
    expect(res.record).toMatchObject({ status: 200, retry: 1, resultCount: 0 });
  });

  it("does not retry invalid JSON", async () => {
    const { client, fetchFn } = setup([{ status: 200, body: "<html>oops</html>" }]);
    await expectKind(get(client), "invalid_response");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("Qloo client: cancellation", () => {
  it("a caller abort cancels in-flight requests without retrying", async () => {
    const { client, fetchFn } = setup(["timeout"], { budget: { timeoutMs: 5_000, minIntervalMs: 0 } });
    const ac = new AbortController();
    const p = get(client, undefined, ac.signal);
    setTimeout(() => ac.abort(), 5);
    await expectKind(p, "aborted");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("an already-aborted signal makes no request", async () => {
    const { client, fetchFn } = setup([]);
    const ac = new AbortController();
    ac.abort();
    await expectKind(get(client, undefined, ac.signal), "aborted");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("Qloo client: budget, concurrency and cache", () => {
  it("stops at the call budget; retries count against it", async () => {
    const { client, fetchFn } = setup([{ status: 503 }, { status: 200, body: { results: [] } }, { status: 200, body: { results: [] } }], {
      budget: { maxCalls: 2, timeoutMs: 30, minIntervalMs: 0 },
    });
    await get(client); // 503 then 200 → 2 calls
    expect(client.stats()).toMatchObject({ callsUsed: 2, callsRemaining: 0 });
    await expectKind(get(client), "budget_exhausted");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the retry would exceed the budget", async () => {
    const { client, fetchFn } = setup([{ status: 503 }], { budget: { maxCalls: 1, timeoutMs: 30, minIntervalMs: 0 } });
    await expectKind(get(client), "server");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("never runs more than `concurrency` requests at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchFn = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
    const client = createQlooClient({ apiKey: KEY, fetch: fetchFn as unknown as typeof fetch, budget: { concurrency: 4, minIntervalMs: 0 } });
    await Promise.all(Array.from({ length: 10 }, (_, i) => get(client, { "filter.type": "urn:entity:artist", take: String(i + 1) })));
    expect(fetchFn).toHaveBeenCalledTimes(10);
    expect(peak).toBe(4);
  });

  it("spaces request starts by minIntervalMs, across concurrent callers", async () => {
    let clock = 1_000;
    const waits: number[] = [];
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }));
    const client = createQlooClient({
      apiKey: KEY,
      fetch: fetchFn as unknown as typeof fetch,
      budget: { minIntervalMs: 250 },
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await Promise.all([get(client), get(client), get(client)]);
    // First starts immediately; the next two reserve slots 250 ms and 500 ms out.
    expect(waits).toEqual([250, 500]);
    clock += 10_000;
    await get(client);
    expect(waits).toHaveLength(2);
  });

  it("serves repeats from cache without spending budget", async () => {
    const cache = new MemoryCache();
    const { client, fetchFn } = setup([{ status: 200, body: { results: { entities: [{}] } } }], { cache });
    await get(client);
    const second = await get(client);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(second.record).toMatchObject({ cached: true, resultCount: 1 });
    expect(client.stats().callsUsed).toBe(1);
  });

  it("does not cache failures", async () => {
    const cache = new MemoryCache();
    const { client, fetchFn } = setup([{ status: 400 }, { status: 200, body: { results: [] } }], { cache });
    await expectKind(get(client), "bad_request");
    await get(client);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("reports an empty 200 as success with zero results, not an error", async () => {
    const { client } = setup([{ status: 200, body: { success: true, results: { entities: [] } } }]);
    const res = await get(client);
    expect(res.record).toMatchObject({ status: 200, resultCount: 0 });
    expect(res.record.error).toBeUndefined();
  });
});
