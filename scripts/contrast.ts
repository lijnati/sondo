/**
 * `pnpm contrast <runId> [<runId> …] | --featured`: the "Without Qloo" panel. For each stored
 * report, asks the configured model (the same SONDO_MODEL the agent uses) for cultural
 * partners from the brief ALONE, with no Qloo data, then matches its picks against the
 * report's ledger in code and stores the result in report_contrasts. One model call per
 * report, zero Qloo calls. Prints ids and counts only.
 */
import { DEFAULT_AGENT_BUDGET, RunTracker } from "@/lib/agent/budget";
import { generateStructured } from "@/lib/agent/model";
import { buildContrast, PLAIN_INSTRUCTIONS, PlainPicks, plainPrompt } from "@/lib/contrast/contrast";
import { saveContrast } from "@/lib/db/contrasts";
import { neonDb } from "@/lib/db/neon";
import { getRun, listFeatured } from "@/lib/db/runs";
import { parseServerEnv } from "@/lib/env/schema";
import { STALE_AFTER_MS } from "@/lib/runs/limits";

import { liveAgentDeps } from "./lib/agent-deps";

const env = parseServerEnv(process.env);
if (!env.DATABASE_URL || !env.AI_GATEWAY_API_KEY) {
  console.error("DATABASE_URL and AI_GATEWAY_API_KEY must be set in .env.local. Nothing was run.");
  process.exit(2);
}
const db = neonDb(env.DATABASE_URL);
const args = process.argv.slice(2);
const ids = args.includes("--featured") ? (await listFeatured(db)).map((c) => c.id) : args.filter((a) => !a.startsWith("--"));
if (!ids.length) {
  console.error("Usage: pnpm contrast <runId> [<runId> …] | --featured");
  process.exit(2);
}

const { model, price } = liveAgentDeps({ ...env, QLOO_API_KEY: env.QLOO_API_KEY ?? "unused" }, { noModel: false, fileCache: false });
let failed = 0;
for (const id of ids) {
  const row = await getRun(db, id, { staleAfterMs: STALE_AFTER_MS });
  if (!row?.report) {
    console.log(`✗ ${id}: no stored report`);
    failed++;
    continue;
  }
  // One call, its own small budget. "plan" is only the budget slot the call is accounted under.
  const tracker = new RunTracker({ ...DEFAULT_AGENT_BUDGET, llmCalls: 1, maxOutputTokens: { ...DEFAULT_AGENT_BUDGET.maxOutputTokens, plan: 6_000 } }, price);
  try {
    const out = await generateStructured(model, tracker, {
      stage: "plan",
      instructions: PLAIN_INSTRUCTIONS,
      prompt: plainPrompt(row.report.brief),
      schema: PlainPicks,
      name: "cultural_partners",
    });
    const contrast = buildContrast(row.report, out.picks, { model: model.modelId, generatedAt: new Date().toISOString() });
    await saveContrast(db, id, contrast);
    const matched = contrast.plain.filter((p) => p.evidenceId).length;
    console.log(`✓ ${id}: plain picks ${contrast.plain.length} (in Sondo's ledger ${matched}) · found only by Sondo ${contrast.sondoOnly.length}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${id}: ${err instanceof Error ? err.name : "error"}`);
  } finally {
    tracker.dispose();
  }
}
process.exit(failed ? 1 : 0);
