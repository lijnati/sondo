/**
 * Sondo agent CLI: run the real agent on a brief against live Qloo and the AI Gateway.
 *
 *   pnpm agent sneakers-nyc [--json] [--out] [--no-cache] [--no-model]
 *
 * --no-model runs with a model budget of 0: deterministic plan, rule-only adaptive
 * research and a research-only result. It verifies the Qloo side live without a key.
 *
 * Progress streams to stderr; the summary (or sanitized JSON with --json) goes to stdout.
 * `--out` writes the full result to .qloo-cache/runs/ (gitignored) — never commit it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { priceFor } from "@/lib/agent/budget";
import { BriefValidationError, runAgent } from "@/lib/agent/orchestrator";
import type { AgentRunResult, Claim } from "@/lib/agent/schemas";
import type { RunEvent } from "@/lib/agent/types";
import { parseServerEnv } from "@/lib/env/schema";

import { cliClient, fmt } from "./lib/cli";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const target = args.find((a) => !a.startsWith("--"));
if (!target) {
  console.error("Usage: pnpm agent <brief-id|path.json> [--json] [--out] [--no-cache]");
  process.exit(2);
}

const env = parseServerEnv(process.env);
const noModel = flag("no-model");
if (!env.QLOO_API_KEY || (!env.AI_GATEWAY_API_KEY && !noModel)) {
  console.error(
    `Live run blocked: ${[!env.QLOO_API_KEY && "QLOO_API_KEY", !env.AI_GATEWAY_API_KEY && !noModel && "AI_GATEWAY_API_KEY"].filter(Boolean).join(" and ")} not set in .env.local. No requests were made. (Use --no-model to run the Qloo side only.)`,
  );
  process.exit(2);
}

const briefPath = target.endsWith(".json") ? resolve(target) : join(HERE, "briefs", `${target}.json`);
const brief: unknown = JSON.parse(readFileSync(briefPath, "utf8"));
const price = priceFor(env.SONDO_MODEL, { ...(env.SONDO_MODEL_INPUT_USD_PER_MTOK !== undefined ? { input: env.SONDO_MODEL_INPUT_USD_PER_MTOK } : {}), ...(env.SONDO_MODEL_OUTPUT_USD_PER_MTOK !== undefined ? { output: env.SONDO_MODEL_OUTPUT_USD_PER_MTOK } : {}) });
const err = (s: string) => process.stderr.write(`${s}\n`);

function progress(e: RunEvent) {
  switch (e.t) {
    case "plan.ready":
      err(`  plan (${e.source}): ${e.categories.join(", ")} · anchors: ${e.anchors.join(", ")}`);
      for (const a of e.adjustments) err(`    adjusted: ${a}`);
      break;
    case "node.finished":
      err(`  ✓ ${fmt.pad(e.node, 14)} ${String(e.ms ?? "").padStart(6)}ms  ${e.summary ?? ""}`);
      break;
    case "llm.call":
      err(`    model ${e.stage}: ${e.ok ? "ok" : `FAILED (${e.error})`} · ${e.ms}ms · in ${e.inputTokens} / out ${e.outputTokens} tokens`);
      break;
    case "decision": {
      const d = e.decision;
      err(`    decision ${d.id} [round ${d.round}, ${d.proposedBy}] ${describeAction(d.action)} → ${d.outcome}${d.outcomeReason ? ` (${d.outcomeReason})` : ""}`);
      break;
    }
    case "tool.call":
      if (typeof e.record.status !== "number" || e.record.status >= 400) err(`    qloo ${e.record.path} ${e.record.status} ${e.record.error ?? ""}`);
      break;
    default:
      break;
  }
}

function describeAction(a: AgentRunResult["decisions"][number]["action"]): string {
  switch (a.tool) {
    case "exploreCategory":
    case "nicheLens":
      return `${a.tool}(${a.category})`;
    case "bridge":
      return `bridge(${a.evidenceId} → ${a.targetCategory})`;
    case "tasteThemes":
      return `tasteThemes(${a.parentCategory ?? "all"})`;
    case "retryAnchor":
      return `retryAnchor("${a.name}"${a.types.length ? ` as ${a.types.join("/")}` : ""})`;
    default:
      return "stop";
  }
}

function claimLine(c: Claim, r: AgentRunResult): string {
  const names = c.evidenceIds.map((id) => {
    const it = r.evidence.find((e) => e.id === id);
    return it ? `${id} ${it.entity.name}` : id;
  });
  return `${c.kind === "evidence" ? "EVIDENCE " : "HYPOTHESIS"} ${c.text}${names.length ? `  [${names.join("; ")}]` : ""}`;
}

function print(r: AgentRunResult) {
  const out: string[] = [];
  const p = (s = "") => out.push(s);
  p(`\nSONDO RUN ${r.runId.slice(0, 8)} · ${r.status.toUpperCase()} · model ${r.model}`);
  p(`Brief: ${r.brief.brandName} · ${r.brief.market} · ${r.brief.objective}`);
  if (r.plan) {
    p(`\nPLAN (${r.plan.source}) — ${r.plan.rationale}`);
    for (const q of r.plan.researchQuestions) p(`  ? ${q}`);
  }
  p("\nADAPTIVE DECISIONS (proposed → outcome)");
  for (const d of r.decisions) p(`  ${d.id} r${d.round} ${fmt.pad(d.proposedBy, 6)} ${fmt.pad(describeAction(d.action), 40)} ${d.outcome}${d.outcomeReason ? ` — ${d.outcomeReason}` : ""}\n       why: ${d.reason}`);
  if (!r.decisions.length) p("  (none)");
  p("\nFINDINGS (code-derived from the ledger)");
  for (const f of r.findings) p(`  ${f.id} [${f.kind}/${f.strength}] ${f.statement}${f.evidenceIds.length ? ` (${f.evidenceIds.join(", ")})` : ""}`);
  if (r.opportunities.length) {
    p("\nOPPORTUNITIES");
    for (const o of r.opportunities) p(`  • ${o.title}\n    ${claimLine(o.rationale, r)}`);
  }
  for (const [i, c] of r.concepts.entries()) {
    p(`\nCONCEPT ${i + 1} · ${c.angle.replace(/_/g, " ")} · ${c.name} · grounding: ${c.grounding} (${c.citedCategories.join(", ")})`);
    p(`  Positioning: ${c.positioning}`);
    p(`  Audience: ${c.intendedAudience}`);
    p(`  Insight: ${claimLine(c.culturalInsight, r)}`);
    p(`  Concept: ${c.concept}`);
    for (const o of c.opportunities) p(`  ${o.kind}: ${o.idea} [${o.evidenceIds.join(", ")}]`);
    p(`  Channels: ${c.channels.join(", ")}`);
    for (const cl of c.claims) p(`  - ${claimLine(cl, r)}`);
    for (const a of c.assumptions) p(`  assumption: ${a}`);
    for (const k of c.risks) p(`  risk: ${k}`);
    for (const n of c.notes) p(`  note: ${n}`);
  }
  const v = r.validation;
  p(`\nVALIDATION · claims checked ${v.claimsChecked} · auto-cited ${v.citationsAutoAttached} · downgraded ${v.downgradedToHypothesis} · removed ${v.removed} · repair ${v.repairAttempted ? "yes" : "no"}`);
  for (const x of v.violations.slice(0, 12)) p(`  violation (pre-fix): ${x}`);
  if (r.warnings.length) {
    p("\nWARNINGS");
    for (const w of r.warnings) p(`  · ${w}`);
  }
  p("\nLIMITATIONS");
  for (const l of r.limitations) p(`  · ${l}`);
  const u = r.usage;
  const cost = u.llm.estimatedCostUsd === null ? "unknown" : `$${u.llm.estimatedCostUsd.toFixed(5)} (${u.llm.costSource})`;
  p(`\nUSAGE · ${(u.durationMs / 1000).toFixed(1)}s · Qloo ${u.qloo.calls}/${u.qloo.budget} calls (${u.qloo.cached} cached) · model ${u.llm.calls} calls · tokens in ${u.llm.inputTokens} / out ${u.llm.outputTokens} (reasoning ${u.llm.reasoningTokens}) · est. cost ${cost} · evidence ${r.evidence.length}`);
  for (const s of u.llm.byStage) p(`  ${fmt.pad(s.stage, 11)} ${s.ok ? "ok    " : "FAILED"} ${String(s.ms).padStart(6)}ms  in ${s.inputTokens} / out ${s.outputTokens}${s.error ? `  ${s.error}` : ""}`);
  p("Estimated cost is an app-side estimate, not a billing cap.");
  process.stdout.write(`${out.join("\n")}\n`);
}

/** --json: no keys (never present), no Qloo ids or image URLs, trace params reduced to keys. */
function sanitized(r: AgentRunResult) {
  return {
    ...r,
    evidence: r.evidence.map((e) => ({ ...e, entity: { kind: e.entity.kind, name: e.entity.name, type: e.entity.type, tags: e.entity.tags } })),
    refs: r.refs.map((x) => ({ ref: x.ref, kind: x.kind, name: x.name, entityType: x.entityType, matchConfidence: x.matchConfidence, sourceCallId: x.sourceCallId })),
    trace: r.trace.map(({ params, ...rest }) => ({ ...rest, paramKeys: Object.keys(params), filterType: params["filter.type"] })),
  };
}

async function main() {
  err(`Sondo agent · ${noModel ? "no model (research only)" : env.SONDO_MODEL} · run cost limit $${env.SONDO_RUN_COST_LIMIT_USD} (estimate, not a billing cap)`);
  const controller = new AbortController();
  process.on("SIGINT", () => controller.abort(new Error("Cancelled from the terminal")));
  try {
    const result = await runAgent(
      brief,
      {
        qloo: ({ maxCalls, onCall }) => cliClient({ budget: { maxCalls }, fileCache: !flag("no-cache"), onCall }),
        model: { model: env.SONDO_MODEL, modelId: noModel ? "none (--no-model)" : env.SONDO_MODEL, secrets: [env.AI_GATEWAY_API_KEY ?? "", env.QLOO_API_KEY as string] },
        price,
        budget: { runCostLimitUsd: env.SONDO_RUN_COST_LIMIT_USD, ...(noModel ? { llmCalls: 0 } : {}) },
      },
      { onEvent: progress, signal: controller.signal },
    );
    if (flag("json")) process.stdout.write(`${JSON.stringify(sanitized(result), null, 2)}\n`);
    else print(result);
    if (flag("out")) {
      const file = join(process.cwd(), ".qloo-cache", "runs", `${result.runId}.json`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(result, null, 2));
      err(`Saved full result → ${file} (gitignored; never commit)`);
    }
    process.exitCode = result.status === "failed" ? 1 : 0;
  } catch (e) {
    if (e instanceof BriefValidationError) err(e.message);
    else err(`Agent crashed: ${e instanceof Error ? e.name : "error"}`);
    process.exitCode = 1;
  }
}

void main();
