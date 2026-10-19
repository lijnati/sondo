/**
 * Phase 2 evaluation: run the real agent on the five fixed briefs, live, one at a time.
 *
 *   pnpm eval [--only <brief-id>[,<brief-id>]] [--cache] [--out]
 *
 * Live by default: Qloo responses are not read from or written to the file cache, so
 * every call hits the API (--cache reuses .qloo-cache/ to save quota while iterating).
 * Writes METRICS ONLY (counts, statuses, budgets; no names, ids or Qloo payloads) to
 * scripts/output/eval-summary.json, which is safe to commit. --out also saves each full
 * result to .qloo-cache/runs/ (gitignored; contains Qloo data, never commit) for diagnosis.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_AGENT_BUDGET } from "@/lib/agent/budget";
import { runMetrics, type EvalExpectation, type RunMetrics } from "@/lib/agent/eval-metrics";
import { runAgent } from "@/lib/agent/orchestrator";

import { liveAgentDeps, requireLiveEnv } from "./lib/agent-deps";
import { fmt, percentile } from "./lib/cli";

/** The fixed evaluation set (ROADMAP.md Phase 2). */
const BRIEFS: { id: string; expect: EvalExpectation }[] = [
  { id: "coldbrew-austin", expect: "complete" },
  { id: "hotel-lisbon", expect: "complete" },
  { id: "sneakers-nyc", expect: "complete" },
  { id: "liquid-death-la", expect: "complete" },
  { id: "unknown-brand", expect: "degrade" },
];

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const onlyArg = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const only = onlyArg ? new Set(onlyArg.split(",")) : null;
const useCache = args.includes("--cache");
const saveRuns = args.includes("--out");
const err = (s: string) => process.stderr.write(`${s}\n`);

const env = requireLiveEnv({ noModel: false });
const budget = { ...DEFAULT_AGENT_BUDGET, runCostLimitUsd: env.SONDO_RUN_COST_LIMIT_USD };

function crashed(id: string, expect: EvalExpectation, e: unknown): RunMetrics {
  return {
    brief: id,
    expect,
    status: "crashed",
    pass: false,
    reasons: [`agent threw ${e instanceof Error ? e.name : "an error"}`],
    concepts: 0,
    grounding: { grounded: 0, partial: 0, insufficient_evidence: 0 },
    claims: { total: 0, evidence: 0, hypothesis: 0, direct: 0, contextual: 0, weak: 0 },
    citations: { total: 0, invalid: 0, residualMismatches: 0 },
    unsupportedEvidenceClaims: 0,
    validation: { violationsPreFix: 0, repairAttempted: false, autoAttached: 0, downgraded: 0, removed: 0, mismatchedDropped: 0 },
    maxConceptOverlap: null,
    qloo: { calls: 0, budget: budget.qlooCalls, cached: 0, errors: 0 },
    llm: { calls: 0, budget: budget.llmCalls, failedCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: null, costSource: "unknown" },
    adaptiveRounds: 0,
    durationMs: 0,
    evidenceItems: 0,
    unresolvedAnchorsDisclosed: false,
    budgets: { qloo: false, llm: false, adaptiveRounds: false, wallClock: false, cost: false },
  };
}

function line(m: RunMetrics): string {
  const g = m.grounding;
  return [
    fmt.pad(m.brief, 16),
    m.pass ? "PASS" : "FAIL",
    fmt.pad(m.status, 9),
    `concepts ${m.concepts} (${g.grounded}g/${g.partial}p/${g.insufficient_evidence}i)`,
    `claims ${m.claims.evidence}ev/${m.claims.hypothesis}hy`,
    `cites ${m.citations.total} · invalid ${m.citations.invalid} · mismatch left ${m.citations.residualMismatches} dropped ${m.validation.mismatchedDropped}`,
    `unsupported-ev ${m.unsupportedEvidenceClaims}`,
    `overlap ${m.maxConceptOverlap ?? "—"}`,
    `qloo ${m.qloo.calls}/${m.qloo.budget}${m.qloo.errors ? ` (${m.qloo.errors} err)` : ""}`,
    `llm ${m.llm.calls}/${m.llm.budget}${m.llm.failedCalls ? ` (${m.llm.failedCalls} failed)` : ""}`,
    `$${m.llm.costUsd ?? "?"}`,
    `${(m.durationMs / 1000).toFixed(1)}s`,
  ].join(" · ");
}

async function main() {
  const set = BRIEFS.filter((b) => !only || only.has(b.id));
  err(`Sondo eval · ${set.length} brief(s) · model ${env.SONDO_MODEL} · Qloo ${useCache ? "file cache allowed" : "live, no cache"} · limits: Qloo ${budget.qlooCalls}, model ${budget.llmCalls}, ${budget.hardDeadlineMs / 1000}s, $${budget.runCostLimitUsd} (estimate)`);
  const results: RunMetrics[] = [];
  for (const b of set) {
    err(`\n▶ ${b.id} (expect ${b.expect})`);
    const brief: unknown = JSON.parse(readFileSync(join(HERE, "briefs", `${b.id}.json`), "utf8"));
    let m: RunMetrics;
    try {
      const r = await runAgent(brief, liveAgentDeps(env, { noModel: false, fileCache: useCache }), {
        onEvent: (e) => {
          if (e.t === "node.finished") err(`  ✓ ${fmt.pad(e.node, 14)} ${String(e.ms ?? "").padStart(6)}ms`);
          if (e.t === "llm.call" && !e.ok) err(`    model ${e.stage} FAILED (${e.error})`);
        },
      });
      m = runMetrics(b.id, b.expect, r, budget);
      if (saveRuns) {
        const out = join(process.cwd(), ".qloo-cache", "runs", `eval-${b.id}.json`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, JSON.stringify(r, null, 2));
      }
      for (const w of r.warnings) err(`  warning: ${w}`);
    } catch (e) {
      m = crashed(b.id, b.expect, e);
    }
    results.push(m);
    err(`  ${line(m)}`);
    err(`  ${m.reasons.join("; ")}`);
  }

  const done = results.filter((m) => m.expect === "complete");
  const degrade = results.filter((m) => m.expect === "degrade");
  const durations = results.map((m) => m.durationMs);
  const summary = {
    generatedAt: new Date().toISOString(),
    model: env.SONDO_MODEL,
    qlooMode: useCache ? "file-cache-allowed" : "live-no-cache",
    limits: { qlooCalls: budget.qlooCalls, llmCalls: budget.llmCalls, adaptiveRounds: budget.adaptiveRounds, hardDeadlineMs: budget.hardDeadlineMs, runCostLimitUsd: budget.runCostLimitUsd },
    totals: {
      completedAsExpected: `${done.filter((m) => m.pass).length}/${done.length}`,
      degradedGracefully: `${degrade.filter((m) => m.pass).length}/${degrade.length}`,
      invalidCitations: results.reduce((s, m) => s + m.citations.invalid, 0),
      residualMismatches: results.reduce((s, m) => s + m.citations.residualMismatches, 0),
      unsupportedEvidenceClaims: results.reduce((s, m) => s + m.unsupportedEvidenceClaims, 0),
      mismatchedCitationsDropped: results.reduce((s, m) => s + m.validation.mismatchedDropped, 0),
      allBudgetsHeld: results.every((m) => Object.values(m.budgets).every(Boolean)),
      qlooCalls: results.reduce((s, m) => s + m.qloo.calls, 0),
      llmCalls: results.reduce((s, m) => s + m.llm.calls, 0),
      estimatedCostUsd: results.some((m) => m.llm.costUsd === null) ? null : results.reduce((s, m) => s + (m.llm.costUsd ?? 0), 0),
      p50DurationMs: percentile(durations, 50) ?? null,
      maxDurationMs: Math.max(0, ...durations),
    },
    runs: results,
  };
  const file = join(HERE, "output", only ? `eval-summary.${[...only].join("+")}.json` : "eval-summary.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(summary, null, 2)}\n`);
  err(`\nTOTALS ${JSON.stringify(summary.totals)}`);
  err(`Wrote metrics only → ${file}`);
  process.exitCode = results.every((m) => m.pass) ? 0 : 1;
}

void main();
