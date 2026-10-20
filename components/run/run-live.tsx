"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { categoryLabel } from "@/lib/brief/labels";
import { SequencedEventSchema, type SequencedEvent, type Stage, type StoredRunStatus } from "@/lib/runs/events";
import { STAGE_LABEL } from "@/lib/runs/labels";
import { createLineDecoder } from "@/lib/runs/ndjson";
import { summarizeRun, type RunSummary, type StageView } from "@/lib/runs/progress";

const STAGE_WAITING: Record<Stage, string> = {
  planning: "Maps the brief onto what Qloo can model.",
  research: "Resolves anchors, then queries each category for this audience and a market baseline.",
  critique: "Checks coverage, empty categories and mainstream-only signals.",
  strategy: "Drafts three concepts that may cite only collected evidence.",
  validation: "Checks every claim against the evidence it cites.",
};

const STATUS_TEXT: Record<StoredRunStatus, string> = {
  running: "Running",
  completed: "Complete",
  partial: "Partial",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

const KIND_LABEL: Record<RunSummary["recentQloo"][number]["kind"], string> = {
  search: "Search",
  insights: "Insights",
  tags: "Tags",
  audiences: "Audiences",
  other: "Lookup",
};

const POLL_MS = 2_000;

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/**
 * Live research view. Reads the POST stream when it has one; otherwise (after a refresh,
 * or if the stream drops) it polls the stored events. Shows only what events report:
 * no percentages, no model text, no estimated progress.
 */
export function RunLive({
  runId,
  brandName,
  reader,
  initialEvents = [],
  startedAt,
  titleAs: Title = "h1",
}: {
  runId: string;
  brandName: string;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  initialEvents?: SequencedEvent[];
  startedAt?: string;
  /** h2 when the view is embedded under the brief page's own h1. */
  titleAs?: "h1" | "h2";
}) {
  const [events, setEvents] = useState<SequencedEvent[]>(initialEvents);
  const [connection, setConnection] = useState<"stream" | "poll" | "retrying">(reader ? "stream" : "poll");
  const [cancel, setCancel] = useState<"idle" | "sending" | "sent" | "error">("idle");
  // The clock starts after mount: server and browser times differ, and a time read
  // during render would not hydrate.
  const [now, setNow] = useState<number | null>(null);
  const begun = useRef<number | null>(startedAt ? Date.parse(startedAt) : null);
  const started = useRef(false);
  const lastSeq = useRef(initialEvents.at(-1)?.seq ?? -1);

  const summary = useMemo(() => summarizeRun(events), [events]);
  const finished = summary.finished;

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let stopped = false;
    const add = (incoming: SequencedEvent[]) => {
      const fresh = incoming.filter((e) => e.seq > lastSeq.current);
      if (!fresh.length) return;
      lastSeq.current = fresh.at(-1)!.seq;
      setEvents((prev) => [...prev, ...fresh]);
    };

    const poll = async () => {
      let delay = POLL_MS;
      while (!stopped) {
        try {
          const res = await fetch(`/api/runs/${runId}?after=${lastSeq.current}`, { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const body = (await res.json()) as { done: boolean; events: unknown[] };
          add(
            body.events.flatMap((e) => {
              const p = SequencedEventSchema.safeParse(e);
              return p.success ? [p.data] : [];
            }),
          );
          setConnection("poll");
          delay = POLL_MS;
          if (body.done) {
            stopped = true;
            break;
          }
        } catch {
          setConnection("retrying");
          delay = Math.min(delay * 2, 10_000);
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    };

    const read = async (r: ReadableStreamDefaultReader<Uint8Array>) => {
      const decoder = createLineDecoder();
      const text = new TextDecoder();
      let sawEnd = false;
      try {
        for (;;) {
          const { done, value } = await r.read();
          const lines = done ? decoder.end() : decoder.push(text.decode(value, { stream: true }));
          const parsed = lines.flatMap((l) => {
            try {
              const p = SequencedEventSchema.safeParse(JSON.parse(l));
              return p.success ? [p.data] : [];
            } catch {
              return [];
            }
          });
          if (parsed.some((e) => e.event.t === "run.finished")) sawEnd = true;
          add(parsed);
          if (done) break;
        }
      } catch {
        // The stream dropped; the run continues on the server. Fall back to polling.
      }
      if (!sawEnd && !stopped) {
        setConnection("poll");
        await poll();
      }
    };

    void (reader ? read(reader) : poll());
    return () => {
      stopped = true;
    };
    // Runs once per mounted run; the reader can only be consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Elapsed clock while running (real time since the run started).
  useEffect(() => {
    begun.current ??= Date.now();
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const every = finished ? undefined : setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      if (every) clearInterval(every);
    };
  }, [finished]);

  // Hand over to the server-rendered report once the run is stored.
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => window.location.replace(`/r/${runId}`), 1400);
    return () => clearTimeout(t);
  }, [finished, runId]);

  const active = summary.stages.find((s) => s.status === "active");
  const announcement = finished ? `Run ${STATUS_TEXT[finished].toLowerCase()}. Opening the report.` : active ? `${STAGE_LABEL[active.stage]} in progress.` : "Starting research.";

  async function requestCancel() {
    setCancel("sending");
    try {
      const res = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      setCancel(res.ok ? "sent" : "error");
    } catch {
      setCancel("error");
    }
  }

  const elapsed = now !== null && begun.current !== null ? Math.max(0, now - begun.current) : null;
  const budget = summary.qloo.budget || 24;
  const maxEvidence = Math.max(1, ...summary.evidence.byCategory.map((c) => c.count));

  return (
    <section className="live" aria-labelledby="live-title">
      <header className="live-head">
        <div>
          <p className="eyebrow">Live research · {runId}</p>
          <Title id="live-title" className="live-title">
            Researching <em>{brandName}</em>
          </Title>
          <p className="live-sub">
            {finished ? (
              <>
                Finished{elapsed !== null ? <> in <span className="tabular">{seconds(elapsed)}</span></> : null}. Opening the report… <Link href={`/r/${runId}`} className="text-link">Open it now</Link>
              </>
            ) : (
              <>
                {elapsed !== null ? (
                  <>
                    Elapsed <span className="tabular">{seconds(elapsed)}</span>.{" "}
                  </>
                ) : null}
                Runs usually take about two minutes and stop at three. You can leave; the link keeps the report.
              </>
            )}
          </p>
        </div>
        <span className={`status status-${finished ?? "running"}`}>{STATUS_TEXT[finished ?? "running"]}</span>
      </header>

      {connection === "retrying" ? (
        <div className="notice warn" role="status" style={{ marginBottom: 16 }}>
          <p>The connection dropped. Reconnecting… The run continues on the server either way.</p>
        </div>
      ) : null}

      <div className="live-grid">
        <div className="sheet live-timeline">
          <p className="eyebrow">What Sondo is doing</p>
          <ol className="timeline">
            {summary.stages.map((s, i) => (
              <StageRow key={s.stage} view={s} index={i} />
            ))}
          </ol>

          <div aria-live="polite" className="sr-only">
            {announcement}
          </div>

          {!finished ? (
            <div className="live-cancel">
              <button type="button" className="btn btn-sm btn-outline" onClick={requestCancel} disabled={cancel === "sending" || cancel === "sent"}>
                {cancel === "sent" ? "Stopping…" : "Cancel run"}
              </button>
              {cancel === "error" ? <span className="muted">Couldn&apos;t cancel. The run will still stop at its time limit.</span> : null}
            </div>
          ) : null}
        </div>

        <aside className="live-side" aria-label="Research activity">
          <div className="sheet">
            <div className="live-card-head">
              <p className="eyebrow">Qloo queries</p>
              <p className="tabular live-count">
                {summary.qloo.calls}
                <span className="muted"> of {budget}</span>
              </p>
            </div>
            <div className="budget-cells" role="img" aria-label={`${summary.qloo.calls} of ${budget} Qloo queries used, ${summary.qloo.cached} from cache, ${summary.qloo.failed} failed`}>
              {Array.from({ length: budget }, (_, i) => (
                <span key={i} className={`cell ${i < summary.qloo.calls ? "cell-used" : "cell-free"}`} />
              ))}
            </div>
            <p className="muted live-small">
              A budget, not a progress bar: most runs use fewer.
              {summary.qloo.cached ? ` ${summary.qloo.cached} from cache.` : ""}
              {summary.qloo.failed ? ` ${summary.qloo.failed} failed.` : ""} Model calls {summary.model.calls} of {summary.model.budget || 4}
              {summary.model.failed ? `, ${summary.model.failed} failed` : ""}.
            </p>

            {summary.recentQloo.length ? (
              <ul className="feed" aria-label="Latest Qloo queries">
                {summary.recentQloo.map((q) => (
                  <li key={q.seq} data-ok={q.ok}>
                    <span className="feed-kind">{KIND_LABEL[q.kind]}</span>
                    <span className="feed-what">{q.category ? categoryLabel(q.category) : "—"}</span>
                    <span className="feed-meta tabular">
                      {q.ok ? `${q.results} results` : "failed"} · {q.ms} ms{q.cached ? " · cached" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted live-small" style={{ marginTop: 14 }}>
                Waiting for the first query.
              </p>
            )}
          </div>

          <div className="sheet">
            <p className="eyebrow">Evidence collected</p>
            {summary.evidence.total ? (
              <>
                <p className="live-evidence-total">
                  <b className="tabular">{summary.evidence.total}</b> Qloo results across {summary.evidence.byCategory.length} categor{summary.evidence.byCategory.length === 1 ? "y" : "ies"}
                </p>
                <ul className="ev-bars">
                  {summary.evidence.byCategory.map((c) => (
                    <li key={c.category}>
                      <span>{categoryLabel(c.category)}</span>
                      <span className="ev-bar" aria-hidden="true">
                        <span style={{ width: `${(c.count / maxEvidence) * 100}%` }} />
                      </span>
                      <span className="tabular">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted live-small">Nothing yet. Results appear as Qloo answers.</p>
            )}
          </div>

          {summary.plan ? (
            <div className="sheet">
              <p className="eyebrow">Research plan · {summary.plan.source === "model" ? "drafted by the model, checked by code" : "built from the brief"}</p>
              <div className="chips">
                {summary.plan.categories.map((c) => (
                  <span key={c} className="pill">
                    {categoryLabel(c)}
                  </span>
                ))}
              </div>
              {summary.plan.anchors.length ? <p className="muted live-small">Anchors: {summary.plan.anchors.join(", ")}</p> : null}
            </div>
          ) : null}

          {summary.claims ? (
            <div className="sheet">
              <p className="eyebrow">Claim validation</p>
              <ul className="bars">
                <li>
                  <span>Claims checked</span>
                  <span className="tabular">{summary.claims.checked}</span>
                </li>
                <li>
                  <span>Downgraded to hypothesis</span>
                  <span className="tabular">{summary.claims.downgraded}</span>
                </li>
                <li>
                  <span>Unsupported claims removed</span>
                  <span className="tabular">{summary.claims.removed}</span>
                </li>
                <li>
                  <span>Repair pass</span>
                  <span>{summary.claims.repaired ? "Ran" : "Not needed"}</span>
                </li>
              </ul>
            </div>
          ) : null}

          {summary.decisions.length ? (
            <details className="sheet disclosure">
              <summary>Adaptive research ({summary.decisions.length})</summary>
              <ul className="bars">
                {summary.decisions.map((d, i) => (
                  <li key={i}>
                    <span>
                      {d.tool}
                      {d.target ? ` · ${categoryLabel(d.target)}` : ""}
                    </span>
                    <span className="muted">
                      {d.outcome}
                      {d.evidenceAdded ? ` · +${d.evidenceAdded}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {summary.warnings.length ? (
            <div className="notice warn" role="status">
              <div className="stack-sm">
                {summary.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function StageRow({ view, index }: { view: StageView; index: number }) {
  const detail =
    view.status === "active"
      ? `${view.currentStep ?? STAGE_LABEL[view.stage]}…`
      : view.status === "done"
        ? (view.summary ?? "Done.")
        : view.status === "skipped"
          ? "Not reached in this run."
          : STAGE_WAITING[view.stage];
  return (
    <li data-status={view.status} aria-current={view.status === "active" ? "step" : undefined}>
      <span className="dot" aria-hidden="true">
        {index + 1}
      </span>
      <div>
        <p className="stage-name">
          {STAGE_LABEL[view.stage]}
          <span className="sr-only"> — {view.status}</span>
        </p>
        <p className="stage-detail">{detail}</p>
      </div>
      <span className="stage-time">{view.ms ? seconds(view.ms) : ""}</span>
    </li>
  );
}
