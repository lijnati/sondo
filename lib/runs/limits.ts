/**
 * Abuse limits for public runs. IPs are never stored: only an HMAC with a server secret,
 * so the hash can't be reversed by brute-forcing the IPv4 space without the secret.
 */
import { createHmac } from "node:crypto";

import { DEFAULT_AGENT_BUDGET } from "@/lib/agent/budget";
import type { RunLimits } from "@/lib/db/runs";

/** A run's function is gone if it is still `running` a minute after the hard deadline. */
export const STALE_AFTER_MS = DEFAULT_AGENT_BUDGET.hardDeadlineMs + 60_000;

export const MAX_BODY_BYTES = 16 * 1024;

export function runLimits(env: { SONDO_RUNS_PER_IP_PER_DAY: number; SONDO_DAILY_RUN_CAP: number; SONDO_MAX_CONCURRENT_RUNS: number }): RunLimits {
  return {
    perIpPerDay: env.SONDO_RUNS_PER_IP_PER_DAY,
    dailyCap: env.SONDO_DAILY_RUN_CAP,
    maxConcurrent: env.SONDO_MAX_CONCURRENT_RUNS,
    staleAfterMs: STALE_AFTER_MS,
  };
}

/** First hop of x-forwarded-for (set by Vercel), else x-real-ip, else a shared bucket. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "unknown";
}

export function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
