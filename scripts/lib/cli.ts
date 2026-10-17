/**
 * Shared CLI plumbing. Builds a Qloo client from process.env (validated by the same
 * Zod schema as the app). Never prints the key. `lib/qloo/server.ts` is not used here
 * because `server-only` throws outside the React server runtime.
 */
import { parseServerEnv } from "@/lib/env/schema";
import { FileCache, MemoryCache } from "@/lib/qloo/cache";
import { createQlooClient, type QlooBudget, type QlooClient } from "@/lib/qloo/client";
import type { ToolCallRecord } from "@/lib/qloo/types";

export function cliClient(opts: { budget?: Partial<QlooBudget>; fileCache?: boolean; onCall?: (r: ToolCallRecord) => void }): QlooClient {
  const env = parseServerEnv(process.env);
  if (!env.QLOO_API_KEY) {
    console.error("QLOO_API_KEY is not set (expected in .env.local). No requests were made.");
    process.exit(2);
  }
  return createQlooClient({
    apiKey: env.QLOO_API_KEY,
    baseUrl: env.QLOO_BASE_URL,
    cache: opts.fileCache ? new FileCache() : new MemoryCache(),
    ...(opts.budget ? { budget: opts.budget } : {}),
    ...(opts.onCall ? { onCall: opts.onCall } : {}),
    logger: (e) => {
      if (e.level !== "info") console.error(`  [${e.level}] ${e.event} ${e.path ?? ""} ${e.status ?? ""} ${e.message ?? ""}`.trimEnd());
    },
  });
}

export const fmt = {
  num: (n: number | undefined, digits = 2) => (n === undefined ? "—" : n.toFixed(digits)),
  pct: (n: number) => `${Math.round(n * 100)}%`,
  pad: (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n)),
};

export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
