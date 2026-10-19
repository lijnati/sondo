/**
 * Live agent dependencies for the CLIs (pnpm agent, pnpm eval): Qloo via cliClient, the
 * model via the AI Gateway, the run cost limit and the price table. Never prints a key.
 */
import { priceFor } from "@/lib/agent/budget";
import type { AgentDeps } from "@/lib/agent/orchestrator";
import { parseServerEnv, type ServerEnv } from "@/lib/env/schema";

import { cliClient } from "./cli";

/** Exits with a clear message (and no requests made) when a required key is missing. */
export function requireLiveEnv(opts: { noModel: boolean }): ServerEnv {
  const env = parseServerEnv(process.env);
  if (!env.QLOO_API_KEY || (!env.AI_GATEWAY_API_KEY && !opts.noModel)) {
    console.error(
      `Live run blocked: ${[!env.QLOO_API_KEY && "QLOO_API_KEY", !env.AI_GATEWAY_API_KEY && !opts.noModel && "AI_GATEWAY_API_KEY"].filter(Boolean).join(" and ")} not set in .env.local. No requests were made. (Use --no-model to run the Qloo side only.)`,
    );
    process.exit(2);
  }
  return env;
}

export function liveAgentDeps(env: ServerEnv, opts: { noModel: boolean; fileCache: boolean }): AgentDeps {
  const price = priceFor(env.SONDO_MODEL, {
    ...(env.SONDO_MODEL_INPUT_USD_PER_MTOK !== undefined ? { input: env.SONDO_MODEL_INPUT_USD_PER_MTOK } : {}),
    ...(env.SONDO_MODEL_OUTPUT_USD_PER_MTOK !== undefined ? { output: env.SONDO_MODEL_OUTPUT_USD_PER_MTOK } : {}),
  });
  return {
    qloo: ({ maxCalls, onCall }) => cliClient({ budget: { maxCalls }, fileCache: opts.fileCache, onCall }),
    model: {
      model: env.SONDO_MODEL,
      modelId: opts.noModel ? "none (--no-model)" : env.SONDO_MODEL,
      secrets: [env.AI_GATEWAY_API_KEY ?? "", env.QLOO_API_KEY as string],
      ...(env.SONDO_STRUCTURED_MODE ? { structuredMode: env.SONDO_STRUCTURED_MODE } : {}),
    },
    price,
    budget: { runCostLimitUsd: env.SONDO_RUN_COST_LIMIT_USD, ...(opts.noModel ? { llmCalls: 0 } : {}) },
  };
}
