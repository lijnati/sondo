import "server-only";

import { after } from "next/server";

import { serverAgentDeps } from "@/lib/agent/server-deps";
import { getDb } from "@/lib/db/client";
import { serverEnv } from "@/lib/env/server";

import type { RunsApiDeps } from "./handlers";
import { runLimits } from "./limits";

/** Structured, key-free server logs. */
export function serverLog(entry: Record<string, unknown>): void {
  console.warn(JSON.stringify({ scope: "runs", ...entry }));
}

/** Real dependencies for the /api/runs route handlers. */
export function runsApiDeps(): RunsApiDeps {
  const env = serverEnv();
  const db = getDb();
  return {
    db,
    config: { liveRuns: env.SONDO_LIVE_RUNS === "on", ipSecret: env.SONDO_IP_HASH_SECRET ?? "", limits: runLimits(env) },
    agentDeps: () => {
      if (!env.SONDO_IP_HASH_SECRET) throw new Error("SONDO_IP_HASH_SECRET is not configured");
      return serverAgentDeps(db);
    },
    // Keeps the function alive until the run is stored, even after the client leaves.
    waitUntil: (p) => after(() => p),
    log: serverLog,
  };
}
