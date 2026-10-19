/**
 * Folds public run events into the live research view model. Pure and client-safe.
 * Everything shown comes from an event that happened; there is no estimated progress.
 */
import { STAGES, type PublicRunEvent, type SequencedEvent, type Stage, type StoredRunStatus } from "./events";

export interface StageView {
  stage: Stage;
  status: "pending" | "active" | "done" | "skipped";
  /** Sum of finished step durations. */
  ms: number;
  currentStep?: string;
  summary?: string;
}

export interface RunSummary {
  runId?: string;
  started: boolean;
  lastSeq: number;
  stages: StageView[];
  plan?: Extract<PublicRunEvent, { t: "plan" }>;
  qloo: { calls: number; cached: number; failed: number; budget: number };
  model: { calls: number; failed: number; budget: number };
  evidence: { total: number; byCategory: { category: string; count: number }[] };
  decisions: Extract<PublicRunEvent, { t: "decision" }>[];
  findings?: number;
  claims?: Extract<PublicRunEvent, { t: "claims" }>;
  warnings: string[];
  finished: StoredRunStatus | null;
}

export function summarizeRun(events: readonly SequencedEvent[]): RunSummary {
  const open = new Map<Stage, string[]>();
  const touched = new Set<Stage>();
  const ms = new Map<Stage, number>();
  const summary = new Map<Stage, string>();
  const evidence = new Map<string, number>();
  const out: RunSummary = {
    started: false,
    lastSeq: -1,
    stages: [],
    qloo: { calls: 0, cached: 0, failed: 0, budget: 0 },
    model: { calls: 0, failed: 0, budget: 0 },
    evidence: { total: 0, byCategory: [] },
    decisions: [],
    warnings: [],
    finished: null,
  };
  let latest: Stage | undefined;

  for (const { seq, event: e } of events) {
    out.lastSeq = Math.max(out.lastSeq, seq);
    switch (e.t) {
      case "run.started":
        out.started = true;
        out.runId = e.runId;
        out.qloo.budget = e.budget.qloo;
        out.model.budget = e.budget.llm;
        break;
      case "stage": {
        touched.add(e.stage);
        latest = e.stage;
        const steps = open.get(e.stage) ?? [];
        const step = e.step ?? e.stage;
        if (e.phase === "started") open.set(e.stage, [...steps, step]);
        else {
          const i = steps.lastIndexOf(step);
          open.set(e.stage, i === -1 ? steps.slice(1) : [...steps.slice(0, i), ...steps.slice(i + 1)]);
          ms.set(e.stage, (ms.get(e.stage) ?? 0) + (e.ms ?? 0));
          if (e.summary) summary.set(e.stage, e.summary);
        }
        break;
      }
      case "plan":
        out.plan = e;
        break;
      case "qloo":
        out.qloo.calls++;
        if (e.cached) out.qloo.cached++;
        if (!e.ok) out.qloo.failed++;
        break;
      case "evidence":
        evidence.set(e.category, (evidence.get(e.category) ?? 0) + e.count);
        break;
      case "decision":
        out.decisions.push(e);
        break;
      case "model":
        out.model.calls++;
        if (!e.ok) out.model.failed++;
        break;
      case "findings":
        out.findings = e.count;
        break;
      case "claims":
        out.claims = e;
        break;
      case "warning":
        out.warnings.push(e.message);
        break;
      case "run.finished":
        out.finished = e.status;
        break;
    }
  }

  const latestIndex = latest ? STAGES.indexOf(latest) : -1;
  out.stages = STAGES.map((stage, i) => {
    const running = open.get(stage) ?? [];
    let status: StageView["status"];
    if (!touched.has(stage)) status = out.finished ? "skipped" : "pending";
    else if (running.length && !out.finished) status = "active";
    else if (i === latestIndex && !out.finished) status = "active";
    else status = "done";
    return {
      stage,
      status,
      ms: ms.get(stage) ?? 0,
      ...(running.length && !out.finished ? { currentStep: running.at(-1) } : {}),
      ...(summary.has(stage) ? { summary: summary.get(stage) } : {}),
    };
  });
  out.evidence.byCategory = [...evidence.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  out.evidence.total = out.evidence.byCategory.reduce((n, c) => n + c.count, 0);
  return out;
}
