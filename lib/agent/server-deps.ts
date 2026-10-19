import "server-only";

import { PgQlooCache } from "@/lib/db/qloo-cache";
import type { Db } from "@/lib/db/sql";
import { requireEnv, serverEnv } from "@/lib/env/server";
import { createServerQlooClient } from "@/lib/qloo/server";

import { priceFor } from "./budget";
import type { AgentDeps } from "./orchestrator";

/**
 * Live agent dependencies for the app: Qloo through the server client with the private
 * Postgres cache, the model through the AI Gateway. Budgets are the defaults in
 * lib/agent/budget.ts plus the env cost limit; requests cannot change them.
 * Throws `<NAME> is not configured` when a credential is missing.
 */
export function serverAgentDeps(db: Db): AgentDeps {
  const env = serverEnv();
  const qlooKey = requireEnv("QLOO_API_KEY");
  const gatewayKey = requireEnv("AI_GATEWAY_API_KEY");
  const cache = new PgQlooCache(db);
  return {
    qloo: ({ maxCalls, onCall }) => createServerQlooClient({ budget: { maxCalls }, cache, onCall }),
    model: {
      model: env.SONDO_MODEL,
      modelId: env.SONDO_MODEL,
      secrets: [gatewayKey, qlooKey],
      ...(env.SONDO_STRUCTURED_MODE ? { structuredMode: env.SONDO_STRUCTURED_MODE } : {}),
    },
    price: priceFor(env.SONDO_MODEL, {
      ...(env.SONDO_MODEL_INPUT_USD_PER_MTOK !== undefined ? { input: env.SONDO_MODEL_INPUT_USD_PER_MTOK } : {}),
      ...(env.SONDO_MODEL_OUTPUT_USD_PER_MTOK !== undefined ? { output: env.SONDO_MODEL_OUTPUT_USD_PER_MTOK } : {}),
    }),
    budget: { runCostLimitUsd: env.SONDO_RUN_COST_LIMIT_USD },
  };
}
