import { describe, expect, it } from "vitest";

import type { PublicRunEvent } from "@/lib/runs/events";
import { replayDelays, summarizeRun } from "@/lib/runs/progress";

const seq = (events: PublicRunEvent[]) => events.map((event, i) => ({ seq: i, event }));

const started: PublicRunEvent = { t: "run.started", runId: "AbCdEfGhIjKl", budget: { qloo: 24, llm: 4 } };

describe("summarizeRun", () => {
  it("starts with every stage pending", () => {
    const s = summarizeRun([]);
    expect(s.started).toBe(false);
    expect(s.stages.map((x) => x.status)).toEqual(["pending", "pending", "pending", "pending", "pending"]);
  });

  it("tracks the active stage, step summaries and elapsed ms from real events", () => {
    const s = summarizeRun(
      seq([
        started,
        { t: "stage", stage: "planning", phase: "started", step: "Plan research" },
        { t: "stage", stage: "planning", phase: "finished", step: "Plan research", ms: 1200, summary: "model plan · artist, podcast" },
        { t: "plan", source: "model", categories: ["artist", "podcast"], anchors: ["Fixture"], adjustments: [] },
        { t: "stage", stage: "research", phase: "started", step: "Resolve brand and anchors" },
        { t: "qloo", kind: "search", ok: true, cached: false, results: 3, ms: 300 },
        { t: "qloo", kind: "insights", category: "artist", ok: true, cached: true, results: 20, ms: 0 },
        { t: "qloo", kind: "insights", category: "podcast", ok: false, cached: false, results: 0, ms: 12000 },
        { t: "evidence", category: "artist", count: 10 },
        { t: "evidence", category: "artist", count: 5 },
      ]),
    );
    expect(s.started).toBe(true);
    expect(s.runId).toBe("AbCdEfGhIjKl");
    expect(s.stages.map((x) => [x.stage, x.status])).toEqual([
      ["planning", "done"],
      ["research", "active"],
      ["critique", "pending"],
      ["strategy", "pending"],
      ["validation", "pending"],
    ]);
    expect(s.stages[0]).toMatchObject({ ms: 1200, summary: "model plan · artist, podcast" });
    expect(s.stages[1]?.currentStep).toBe("Resolve brand and anchors");
    expect(s.plan?.categories).toEqual(["artist", "podcast"]);
    expect(s.qloo).toEqual({ calls: 3, cached: 1, failed: 1, budget: 24 });
    expect(s.evidence).toEqual({ total: 15, byCategory: [{ category: "artist", count: 15 }] });
    expect(s.finished).toBeNull();
  });

  it("marks never-reached stages as skipped once the run finishes", () => {
    const s = summarizeRun(
      seq([
        started,
        { t: "stage", stage: "planning", phase: "started" },
        { t: "stage", stage: "planning", phase: "finished", ms: 10 },
        { t: "stage", stage: "research", phase: "started" },
        { t: "stage", stage: "research", phase: "finished", ms: 10 },
        { t: "stage", stage: "critique", phase: "started" },
        { t: "stage", stage: "critique", phase: "finished", ms: 10 },
        { t: "warning", message: "Not enough Qloo evidence to write grounded strategies; returning research only." },
        { t: "run.finished", runId: "AbCdEfGhIjKl", status: "partial" },
      ]),
    );
    expect(s.stages.map((x) => x.status)).toEqual(["done", "done", "done", "skipped", "skipped"]);
    expect(s.finished).toBe("partial");
    expect(s.warnings).toHaveLength(1);
  });

  it("does not count a stage as done while one of its steps is still running", () => {
    const s = summarizeRun(
      seq([
        started,
        { t: "stage", stage: "strategy", phase: "started", step: "Draft concepts" },
        { t: "stage", stage: "strategy", phase: "finished", step: "Draft concepts", ms: 5 },
        { t: "stage", stage: "strategy", phase: "started", step: "Repair flagged claims" },
      ]),
    );
    expect(s.stages[3]).toMatchObject({ status: "active", currentStep: "Repair flagged claims" });
  });

  it("counts claims, decisions and model calls", () => {
    const s = summarizeRun(
      seq([
        started,
        { t: "model", stage: "plan", ok: true, ms: 10 },
        { t: "model", stage: "strategize", ok: false, ms: 10 },
        { t: "decision", proposedBy: "model", tool: "nicheLens", target: "artist", outcome: "executed", evidenceAdded: 4 },
        { t: "claims", checked: 12, autoCited: 1, downgraded: 2, removed: 0, repaired: true },
      ]),
    );
    expect(s.model).toEqual({ calls: 2, failed: 1, budget: 4 });
    expect(s.decisions).toHaveLength(1);
    expect(s.claims).toMatchObject({ checked: 12, downgraded: 2 });
  });

  it("keeps the latest Qloo calls newest first, capped at twelve", () => {
    const calls: PublicRunEvent[] = Array.from({ length: 14 }, (_, i) => ({ t: "qloo", kind: "insights", category: "urn:entity:artist", ok: i !== 3, cached: i % 2 === 0, results: i, ms: 100 + i }));
    const s = summarizeRun(seq([started, ...calls]));
    expect(s.recentQloo).toHaveLength(12);
    expect(s.recentQloo[0]).toMatchObject({ results: 13, ms: 113, cached: false, category: "urn:entity:artist" });
    expect(s.recentQloo.at(-1)?.results).toBe(2);
    expect(s.qloo).toMatchObject({ calls: 14, failed: 1, cached: 7 });
  });
});

describe("replayDelays", () => {
  const ev = (event: PublicRunEvent, seq: number) => ({ seq, event });
  const events = [
    ev({ t: "run.started", runId: "Fixture00Run", budget: { qloo: 24, llm: 4 } }, 0),
    ev({ t: "qloo", kind: "insights", category: "artist", ok: true, cached: false, results: 10, ms: 900 }, 1),
    ev({ t: "model", stage: "strategize", ok: true, ms: 30_000 }, 2),
    ev({ t: "run.finished", runId: "Fixture00Run", status: "completed" }, 3),
  ];

  it("compresses the stored run to about the target length, longest where the work was", () => {
    const d = replayDelays(events, 10_000);
    expect(d).toHaveLength(4);
    expect(Math.abs(d.reduce((a, b) => a + b, 0) - 10_000)).toBeLessThan(50);
    expect(d[2]).toBeGreaterThan(d[1]!);
    expect(Math.min(...d)).toBeGreaterThanOrEqual(30);
  });
});
