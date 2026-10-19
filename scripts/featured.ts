/**
 * `pnpm featured <brief> [<brief> …]`: runs each scripts/briefs/<brief>.json through the
 * same executeRun() the web app uses (live Qloo, live model, persisted to DATABASE_URL)
 * and features it at the rank of its position — but only if it is stored `completed`.
 * A partial or failed run is reported and left unfeatured. Prints ids and statuses only.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { Brief } from "@/lib/agent/brief";
import { DEFAULT_AGENT_BUDGET } from "@/lib/agent/budget";
import type { AgentDeps } from "@/lib/agent/orchestrator";
import { neonDb } from "@/lib/db/neon";
import { PgQlooCache } from "@/lib/db/qloo-cache";
import { createRun, getRun, setFeatured } from "@/lib/db/runs";
import { createQlooClient } from "@/lib/qloo/client";
import { executeRun } from "@/lib/runs/execute";
import { newRunId } from "@/lib/runs/ids";
import { STALE_AFTER_MS } from "@/lib/runs/limits";

import { liveAgentDeps, requireLiveEnv } from "./lib/agent-deps";

const names = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!names.length) {
  console.error("Usage: pnpm featured <brief>[:rank] …   (names from scripts/briefs; rank defaults to position)");
  process.exit(2);
}

const env = requireLiveEnv({ noModel: false });
if (!env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Nothing was run.");
  process.exit(2);
}
const db = neonDb(env.DATABASE_URL);
const cache = new PgQlooCache(db);
const base = liveAgentDeps(env, { noModel: false, fileCache: false });
const agent: AgentDeps = {
  ...base,
  qloo: ({ maxCalls, onCall }) =>
    createQlooClient({ apiKey: env.QLOO_API_KEY as string, baseUrl: env.QLOO_BASE_URL, cache, budget: { maxCalls }, onCall }),
};
const limits = { perIpPerDay: 0, dailyCap: 0, maxConcurrent: 0, staleAfterMs: STALE_AFTER_MS };

let failed = 0;
for (const [i, arg] of names.entries()) {
  // "name:rank" keeps a specific rank (e.g. re-running one brief); otherwise rank = position.
  const [name, rankText] = arg.split(":") as [string, string?];
  const rank = rankText ? Number(rankText) : i + 1;
  const brief = Brief.parse(JSON.parse(await readFile(join(process.cwd(), "scripts", "briefs", `${name}.json`), "utf8")));
  const id = newRunId();
  await createRun(db, { id, brief, ipHash: null, source: "script" }, limits);
  console.log(`\n▶ ${name} → /r/${id}`);
  const t0 = Date.now();
  const { status } = await executeRun(id, brief, { db, agent, limits, log: (e) => console.error(`  [log] ${JSON.stringify(e)}`) });
  const row = await getRun(db, id, limits);
  const r = row?.report;
  console.log(`  status ${status} · ${Math.round((Date.now() - t0) / 1000)} s · Qloo ${r?.usage.qloo.calls ?? 0}/${DEFAULT_AGENT_BUDGET.qlooCalls} · model ${r?.usage.llm.calls ?? 0}/${DEFAULT_AGENT_BUDGET.llmCalls} · evidence ${r?.evidence.length ?? 0} · concepts ${r?.concepts.length ?? 0}`);
  if (status === "completed" && (await setFeatured(db, id, rank))) {
    console.log(`  ✓ featured at rank ${rank}`);
  } else {
    failed++;
    console.log(`  ✗ not featured (only completed runs are)`);
    for (const w of r?.warnings ?? []) console.log(`    - ${w.slice(0, 200)}`);
  }
}
process.exit(failed ? 1 : 0);
