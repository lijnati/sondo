import "server-only";

import { requireEnv, serverEnv } from "@/lib/env/server";

import type { QlooCache } from "./cache";
import { createQlooClient, type QlooBudget, type QlooClient } from "./client";
import type { ToolCallRecord } from "./types";

/** Per-run Qloo client for Next.js server code. Throws `not configured` without a key. */
export function createServerQlooClient(opts: {
  budget?: Partial<QlooBudget>;
  cache?: QlooCache;
  onCall?: (record: ToolCallRecord) => void;
} = {}): QlooClient {
  return createQlooClient({
    apiKey: requireEnv("QLOO_API_KEY"),
    baseUrl: serverEnv().QLOO_BASE_URL,
    ...opts,
    // Structured, key-free logs; failures only, to keep production logs quiet.
    logger: (e) => {
      if (e.level !== "info") console[e.level === "error" ? "error" : "warn"](JSON.stringify(e));
    },
  });
}
