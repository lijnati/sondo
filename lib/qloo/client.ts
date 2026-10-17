/**
 * Server-only Qloo HTTP client (ARCHITECTURE.md §2–3). Owns transport concerns only:
 * auth header, timeouts and cancellation, the retry policy, the per-run call budget,
 * concurrency, caching, and a key-free ToolCallRecord for every request.
 *
 * Never import this from client components. It receives the key as an argument so it
 * also runs in CLIs; Next code should use `lib/qloo/server.ts`.
 */
import { QLOO_HACKATHON_HOST } from "@/lib/env/schema";

import { cacheKey, type QlooCache } from "./cache";
import { kindForStatus, QlooError, RETRYABLE, sanitize } from "./errors";
import { toQueryString } from "./params";
import type { ToolCallRecord } from "./types";

export interface QlooBudget {
  /** Network attempts per client (= per run). Retries count; cache hits don't. */
  maxCalls: number;
  concurrency: number;
  timeoutMs: number;
  /** Retries for 429 / 5xx / timeout / network. Never for 400/401/403/404. */
  maxRetries: number;
  retryBackoffMs: number;
  maxRetryAfterMs: number;
  /** Minimum gap between request starts. The live host returns 429 on short bursts. */
  minIntervalMs: number;
}

export const DEFAULT_BUDGET: QlooBudget = {
  maxCalls: 40,
  // ARCHITECTURE.md planned 4; Phase 1b exploration hit 429s at 4 concurrent requests.
  concurrency: 3,
  timeoutMs: 12_000,
  maxRetries: 1,
  retryBackoffMs: 1_500,
  maxRetryAfterMs: 10_000,
  // Spike (300 ms spacing): 0 × 429 in 30 calls. Exploration without spacing: 429s.
  minIntervalMs: 250,
};

export interface QlooLogEvent {
  level: "info" | "warn" | "error";
  event: string;
  callId?: string;
  path?: string;
  status?: ToolCallRecord["status"];
  latencyMs?: number;
  retry?: number;
  message?: string;
}

export interface QlooClientOptions {
  apiKey: string;
  baseUrl?: string;
  budget?: Partial<QlooBudget>;
  cache?: QlooCache;
  onCall?: (record: ToolCallRecord) => void;
  logger?: (event: QlooLogEvent) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
}

export interface RequestOptions {
  /** Agent node / caller name, recorded in the trace. */
  node?: string;
  /** Operation name, e.g. "insights". */
  tool: string;
  signal?: AbortSignal;
  /** Counts results for the trace; defaults to the first list found in the body. */
  count?: (body: unknown) => number;
}

export interface QlooResponse {
  body: unknown;
  record: ToolCallRecord;
}

export interface QlooClient {
  get(path: string, params: Record<string, string>, options: RequestOptions): Promise<QlooResponse>;
  stats(): { callsUsed: number; callsRemaining: number; halted: "unauthorized" | "rate_limited" | null };
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new QlooError("aborted", "Request cancelled"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new QlooError("aborted", "Request cancelled"));
      },
      { once: true },
    );
  });
}

/** First array under the usual Qloo result keys. */
export function defaultCount(body: unknown): number {
  const results = (body as { results?: unknown } | null)?.results;
  if (Array.isArray(results)) return results.length;
  if (results && typeof results === "object") {
    for (const v of Object.values(results)) if (Array.isArray(v)) return v.length;
  }
  return 0;
}

/** Retry-After in seconds or an HTTP date, capped. */
function retryAfterMs(header: string | null, now: number, cap: number): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(header) - now;
  return Number.isFinite(ms) && ms >= 0 ? Math.min(ms, cap) : undefined;
}

class Semaphore {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  constructor(private readonly limit: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export function createQlooClient(options: QlooClientOptions): QlooClient {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new QlooError("not_configured", "QLOO_API_KEY is not configured");

  const baseUrl = (options.baseUrl ?? QLOO_HACKATHON_HOST).replace(/\/+$/, "");
  const budget: QlooBudget = { ...DEFAULT_BUDGET, ...options.budget };
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const log = options.logger ?? (() => {});
  const semaphore = new Semaphore(budget.concurrency);

  let callsUsed = 0;
  let seq = 0;
  let nextStartAt = 0;

  /** Reserve the next start slot, then wait for it (spacing applies across concurrent calls). */
  async function pace(signal: AbortSignal | undefined) {
    if (budget.minIntervalMs <= 0) return;
    const t = now();
    const slot = Math.max(t, nextStartAt);
    nextStartAt = slot + budget.minIntervalMs;
    if (slot > t) await sleep(slot - t, signal);
  }
  let halted: "unauthorized" | "rate_limited" | null = null;

  async function attempt(url: string, callerSignal: AbortSignal | undefined) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new QlooError("timeout", "Qloo request timed out")), budget.timeoutMs);
    const onCallerAbort = () => controller.abort(new QlooError("aborted", "Request cancelled"));
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    try {
      const res = await doFetch(url, {
        method: "GET",
        headers: { "X-Api-Key": apiKey, accept: "application/json" },
        signal: controller.signal,
      });
      const text = await res.text();
      return { res, text };
    } catch (err) {
      const reason = controller.signal.reason;
      if (reason instanceof QlooError) throw reason;
      if (callerSignal?.aborted) throw new QlooError("aborted", "Request cancelled");
      throw new QlooError("network", sanitize(err instanceof Error ? err.message : String(err), apiKey));
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }

  async function get(path: string, params: Record<string, string>, opts: RequestOptions): Promise<QlooResponse> {
    const query = toQueryString(params);
    const callId = `Q${++seq}`;
    const startedAt = new Date(now()).toISOString();
    const count = opts.count ?? defaultCount;
    const base = { callId, node: opts.node ?? "cli", tool: opts.tool, path, params };

    const finish = (record: ToolCallRecord) => {
      options.onCall?.(record);
      return record;
    };

    // Cache first: a hit spends no budget and works even after a halt.
    const key = cacheKey(path, query);
    const cached = await options.cache?.get(key);
    if (cached !== undefined) {
      const record = finish({ ...base, status: 200, latencyMs: 0, cached: true, resultCount: count(cached), retry: 0, startedAt });
      return { body: cached, record };
    }

    const fail = (error: QlooError, retry: number, latencyMs: number): never => {
      const status: ToolCallRecord["status"] =
        error.status ?? (error.kind === "timeout" ? "timeout" : "error");
      error.record = finish({ ...base, status, latencyMs, cached: false, resultCount: 0, retry, startedAt, error: `${error.kind}: ${error.message}` });
      log({ level: error.kind === "unauthorized" ? "error" : "warn", event: "qloo.call.failed", callId, path, status, latencyMs, retry, message: error.message });
      throw error;
    };

    return semaphore.run(async () => {
      let retry = 0;
      const t0 = now();
      for (;;) {
        if (opts.signal?.aborted) fail(new QlooError("aborted", "Request cancelled"), retry, now() - t0);
        if (halted === "unauthorized") fail(new QlooError("unauthorized", "Qloo rejected the API key; run halted"), retry, 0);
        if (halted === "rate_limited") fail(new QlooError("rate_limited", "Qloo rate limit reached; no new calls this run"), retry, 0);
        if (callsUsed >= budget.maxCalls) {
          fail(new QlooError("budget_exhausted", `Qloo call budget of ${budget.maxCalls} exhausted`), retry, now() - t0);
        }

        callsUsed++;
        try {
          await pace(opts.signal);
        } catch {
          fail(new QlooError("aborted", "Request cancelled"), retry, now() - t0);
        }
        let outcome: { res: Response; text: string } | QlooError;
        try {
          outcome = await attempt(`${baseUrl}${path}?${query}`, opts.signal);
        } catch (err) {
          if (!(err instanceof QlooError)) throw err;
          outcome = err;
        }

        let error: QlooError;
        let waitMs = budget.retryBackoffMs;
        if (outcome instanceof QlooError) {
          error = outcome;
        } else if (outcome.res.ok) {
          const { res, text } = outcome;
          let body: unknown;
          try {
            body = JSON.parse(text);
          } catch {
            return fail(new QlooError("invalid_response", "Qloo returned non-JSON", res.status), retry, now() - t0);
          }
          await options.cache?.set(key, body);
          const record = finish({
            ...base,
            status: res.status,
            latencyMs: now() - t0,
            cached: false,
            resultCount: count(body),
            retry,
            startedAt,
          });
          log({ level: "info", event: "qloo.call", callId, path, status: res.status, latencyMs: record.latencyMs, retry });
          return { body, record };
        } else {
          const { res, text } = outcome;
          error = new QlooError(kindForStatus(res.status), sanitize(text || res.statusText, apiKey), res.status);
          waitMs = retryAfterMs(res.headers.get("retry-after"), now(), budget.maxRetryAfterMs) ?? waitMs;
        }

        if (error.kind === "unauthorized") halted = "unauthorized";
        const canRetry = RETRYABLE.has(error.kind) && retry < budget.maxRetries && callsUsed < budget.maxCalls;
        if (!canRetry) {
          if (error.kind === "rate_limited") halted = "rate_limited";
          fail(error, retry, now() - t0);
        }
        retry++;
        log({ level: "warn", event: "qloo.call.retry", callId, path, status: error.status ?? (error.kind === "timeout" ? "timeout" : "error"), retry, message: error.kind });
        try {
          await sleep(waitMs, opts.signal);
        } catch {
          fail(new QlooError("aborted", "Request cancelled"), retry, now() - t0);
        }
      }
    });
  }

  return {
    get,
    stats: () => ({ callsUsed, callsRemaining: Math.max(0, budget.maxCalls - callsUsed), halted }),
  };
}
