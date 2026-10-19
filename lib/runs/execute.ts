/**
 * Runs one persisted agent run to completion: the real orchestrator, public progress
 * events (streamed to the caller and appended to run_events), cross-instance cancel via
 * the database, the integrity gate, and the final atomic status write.
 *
 * Nothing here depends on the HTTP request staying open: `onEvent` failures are ignored,
 * so a closed stream never stops the run. The caller keeps the function alive (`after()`).
 */
import type { Brief } from "@/lib/agent/brief";
import { DEFAULT_AGENT_BUDGET, type AgentBudget } from "@/lib/agent/budget";
import { runAgent, type AgentDeps } from "@/lib/agent/orchestrator";
import type { AgentRunResult } from "@/lib/agent/schemas";
import type { RunEvent } from "@/lib/agent/types";
import { appendEvents, finishRun, isCancelRequested, type RunLimits } from "@/lib/db/runs";
import type { Db } from "@/lib/db/sql";

import { NODE_STAGE, type PublicRunEvent, type SequencedEvent, type StoredRunStatus } from "./events";
import { integrityCheck } from "./integrity";
import { publicText } from "./redact";

export interface ExecuteDeps {
  db: Db;
  agent: AgentDeps;
  limits: Pick<RunLimits, "staleAfterMs">;
  onEvent?: (e: SequencedEvent) => void;
  /** How often buffered events are written. */
  flushMs?: number;
  /** How often the cancel flag is checked. */
  cancelPollMs?: number;
  log?: (entry: Record<string, unknown>) => void;
  /** Delays between attempts to store the final result. */
  writeBackoffMs?: number[];
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const QLOO_KIND: Record<string, Extract<PublicRunEvent, { t: "qloo" }>["kind"]> = {
  "/search": "search",
  "/v2/insights": "insights",
  "/v2/tags": "tags",
  "/v2/audiences": "audiences",
};

/** Node summaries are written by code for logs; make the few terse ones readable. */
function humanSummary(s: string): string {
  return s
    .replace(/^model plan · /, "Model-drafted plan, checked by code: ")
    .replace(/^fallback plan · /, "Plan built from the brief: ")
    .replace(/; sufficient: true$/, "; evidence looks sufficient")
    .replace(/; sufficient: false$/, "; evidence still thin");
}

/** Internal RunEvent → public event, or null when it has no public form. */
export function toPublicEvent(e: RunEvent, secrets: readonly string[]): PublicRunEvent | null {
  switch (e.t) {
    case "run.started":
      return { t: "run.started", runId: e.runId, budget: e.budget };
    case "node.started":
    case "node.finished": {
      const m = NODE_STAGE[e.node];
      if (!m) return null;
      return {
        t: "stage",
        stage: m.stage,
        phase: e.t === "node.started" ? "started" : "finished",
        step: m.step,
        ...(e.ms !== undefined ? { ms: Math.round(e.ms) } : {}),
        ...(e.summary ? { summary: clip(humanSummary(publicText(e.summary, secrets)), 240) } : {}),
      };
    }
    case "plan.ready":
      return {
        t: "plan",
        source: e.source,
        categories: e.categories.slice(0, 12).map((c) => clip(c, 40)),
        anchors: e.anchors.slice(0, 12).map((a) => clip(a, 80)),
        adjustments: e.adjustments.slice(0, 12).map((a) => clip(publicText(a, secrets), 240)),
      };
    case "tool.call": {
      const r = e.record;
      const filter = r.params["filter.type"];
      const category = filter?.startsWith("urn:entity:") ? filter.slice("urn:entity:".length) : filter === "urn:tag" ? "taste themes" : filter === "urn:demographics" ? "demographics" : undefined;
      return {
        t: "qloo",
        kind: QLOO_KIND[r.path] ?? "other",
        ...(category ? { category: clip(category, 40) } : {}),
        ok: typeof r.status === "number" && r.status < 400,
        cached: r.cached,
        results: Math.max(0, Math.round(r.resultCount)),
        ms: Math.max(0, Math.round(r.latencyMs)),
      };
    }
    case "evidence.added":
      return { t: "evidence", category: clip(e.category, 40), count: e.count };
    case "decision": {
      const a = e.decision.action;
      const target = "category" in a ? a.category : "targetCategory" in a ? a.targetCategory : "parentCategory" in a ? (a.parentCategory ?? undefined) : "name" in a ? a.name : undefined;
      return {
        t: "decision",
        proposedBy: e.decision.proposedBy,
        tool: a.tool,
        ...(target ? { target: clip(target, 80) } : {}),
        outcome: e.decision.outcome,
        evidenceAdded: e.decision.evidenceAdded,
      };
    }
    case "finding.added":
      return { t: "findings", count: e.count };
    case "llm.call":
      return { t: "model", stage: e.stage, ok: e.ok, ms: Math.max(0, Math.round(e.ms)) };
    case "claims.validated":
      return { t: "claims", checked: e.checked, autoCited: e.autoCited, downgraded: e.downgraded, removed: e.removed, repaired: e.repaired };
    case "warning":
      return { t: "warning", message: publicText(e.message, secrets) };
    case "run.finished":
      // Emitted by executeRun after the result is stored, with the stored status.
      return null;
  }
}

function budgetOf(agent: AgentDeps): AgentBudget {
  return { ...DEFAULT_AGENT_BUDGET, ...agent.budget, maxOutputTokens: { ...DEFAULT_AGENT_BUDGET.maxOutputTokens, ...agent.budget?.maxOutputTokens } };
}

export async function executeRun(runId: string, brief: Brief, deps: ExecuteDeps): Promise<{ status: StoredRunStatus }> {
  const log = deps.log ?? (() => {});
  const secrets = deps.agent.model.secrets ?? [];
  let seq = 0;
  let buffer: SequencedEvent[] = [];
  let flushing: Promise<void> = Promise.resolve();

  const flush = () => {
    const batch = buffer;
    buffer = [];
    if (!batch.length) return flushing;
    // One retry; progress events are best-effort, the final report write is not.
    flushing = flushing.then(() =>
      appendEvents(deps.db, runId, batch)
        .catch(() => appendEvents(deps.db, runId, batch))
        .catch((err: unknown) => log({ event: "events_write_failed", runId, count: batch.length, error: err instanceof Error ? `${err.name}: ${err.message.slice(0, 160)}` : "error" })),
    );
    return flushing;
  };
  const publish = (event: PublicRunEvent) => {
    const e = { seq: seq++, event };
    buffer.push(e);
    try {
      deps.onEvent?.(e);
    } catch {
      // The client went away; the run carries on and is persisted.
    }
    if (event.t === "stage" || event.t === "plan" || event.t === "run.started") void flush();
  };

  const controller = new AbortController();
  const flushTimer = setInterval(() => void flush(), deps.flushMs ?? 1_000);
  const cancelTimer = setInterval(() => {
    void isCancelRequested(deps.db, runId)
      .then((yes) => {
        if (yes && !controller.signal.aborted) controller.abort(new Error("Cancelled by the user"));
      })
      .catch(() => {});
  }, deps.cancelPollMs ?? 3_000);

  let result: AgentRunResult | null = null;
  let status: Exclude<StoredRunStatus, "running" | "interrupted"> = "failed";
  let failureCode: string | undefined;
  try {
    result = await runAgent(brief, deps.agent, {
      runId,
      signal: controller.signal,
      onEvent: (e) => {
        const p = toPublicEvent(e, secrets);
        if (p) publish(p);
      },
    });
    status = result.status;
    const check = integrityCheck(result, budgetOf(deps.agent));
    if (status === "completed" && !check.ok) {
      status = "partial";
      result = { ...result, status, warnings: [...result.warnings, `Integrity re-check failed (${check.reasons.join("; ")}); stored as partial.`] };
      publish({ t: "warning", message: "The final integrity re-check did not pass; the report is marked partial." });
    } else if (status === "partial" && check.reasons.length) {
      // Say why in plain words, from the same checks.
      result = { ...result, warnings: [...result.warnings, `Marked partial: ${check.reasons.join("; ")}.`] };
    }
    if (status === "failed") failureCode = result.warnings.some((w) => w.startsWith("Qloo rejected")) ? "qloo_unauthorized" : "agent_failed";
    if (status === "cancelled") failureCode = "cancelled";
  } catch (err) {
    log({ event: "agent_crashed", runId, error: err instanceof Error ? err.name : "error" });
    failureCode = "agent_error";
    publish({ t: "warning", message: "The research run stopped on an unexpected error." });
  } finally {
    clearInterval(cancelTimer);
  }

  // The report is the point of the run: retry transient database failures with backoff.
  let stored = false;
  const backoff = deps.writeBackoffMs ?? [500, 1_500, 4_000];
  for (let attempt = 0; attempt <= backoff.length && !stored; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, backoff[attempt - 1]));
    try {
      await finishRun(deps.db, runId, { status, report: result, ...(failureCode ? { failureCode } : {}) });
      stored = true;
    } catch (err) {
      log({ event: "report_write_failed", runId, attempt, error: err instanceof Error ? err.message.slice(0, 200) : "error" });
    }
  }
  if (!stored) {
    // The report itself could not be saved (e.g. it failed schema validation). Never
    // leave a half-written success: record a failure without a report.
    status = "failed";
    await finishRun(deps.db, runId, { status, report: null, failureCode: "report_write_failed" }).catch(() => {});
    publish({ t: "warning", message: "The report could not be saved." });
  }

  publish({ t: "run.finished", runId, status });
  clearInterval(flushTimer);
  await flush();
  return { status };
}
