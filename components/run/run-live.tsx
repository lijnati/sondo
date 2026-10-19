"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { categoryLabel } from "@/lib/brief/labels";
import { SequencedEventSchema, type SequencedEvent, type Stage, type StoredRunStatus } from "@/lib/runs/events";
import { createLineDecoder } from "@/lib/runs/ndjson";
import { summarizeRun, type StageView } from "@/lib/runs/progress";

const STAGE_LABEL: Record<Stage, string> = {
  planning: "Planning",
  research: "Qloo research",
  critique: "Critique",
  strategy: "Concepts",
  validation: "Claim validation",
};

const STAGE_WAITING: Record<Stage, string> = {
  planning: "Maps the brief onto what Qloo can model.",
  research: "Resolves anchors, then queries each category for this audience and a baseline.",
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

const POLL_MS = 2_000;

function seconds(ms: number) {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

/**
 * Live research view. Reads the POST stream when it has one; otherwise (after a refresh,
 * or if the stream drops) it polls the stored events. Shows only what events report.
 */
export function RunLive({
  runId,
  brandName,
  reader,
  initialEvents = [],
  startedAt,
}: {
  runId: string;
  brandName: string;
  reader?: ReadableStreamDefaultReader<Uint8Array>;
  initialEvents?: SequencedEvent[];
  startedAt?: string;
}) {
  const [events, setEvents] = useState<SequencedEvent[]>(initialEvents);
  const [connection, setConnection] = useState<"stream" | "poll" | "retrying">(reader ? "stream" : "poll");
  const [cancel, setCancel] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [now, setNow] = useState(() => Date.now());
  const begun = useRef<number>(startedAt ? Date.parse(startedAt) : Date.now());
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
          add(body.events.flatMap((e) => {
            const p = SequencedEventSchema.safeParse(e);
            return p.success ? [p.data] : [];
          }));
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
    if (finished) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [finished]);

  // Hand over to the server-rendered report once the run is stored.
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => window.location.replace(`/r/${runId}`), 900);
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

  const elapsed = Math.max(0, now - begun.current);

  return (
    <section className="live" aria-labelledby="live-title">
      <div className="sheet">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <p className="eyebrow">Live research · {runId}</p>
            <h2 id="live-title" className="h3">
              Researching {brandName}
            </h2>
          </div>
          <span className={`status status-${finished ?? "running"}`}>{STATUS_TEXT[finished ?? "running"]}</span>
        </div>
        <p className="lede" style={{ marginTop: 8, fontSize: 14 }}>
          {finished ? "Opening the report…" : <>Elapsed <span className="tabular">{seconds(elapsed)}</span>. Runs usually take about two minutes and stop at three.</>}
          {connection === "retrying" ? " Reconnecting…" : null}
        </p>

        <ol className="timeline" style={{ marginTop: 14 }}>
          {summary.stages.map((s) => (
            <StageRow key={s.stage} view={s} />
          ))}
        </ol>

        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        {!finished ? (
          <div className="form-actions">
            <button type="button" className="btn btn-sm btn-outline" onClick={requestCancel} disabled={cancel === "sending" || cancel === "sent"}>
              {cancel === "sent" ? "Stopping…" : "Cancel run"}
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              {cancel === "error" ? "Couldn't cancel. The run will still stop at its time limit." : "You can leave this page. The run keeps going and the link will show the report."}
            </span>
          </div>
        ) : null}
      </div>

      <aside className="stack" aria-label="Research activity">
        <div className="sheet">
          <p className="eyebrow">Qloo activity</p>
          <div className="stat-row">
            <div className="stat">
              <b>
                {summary.qloo.calls}
                <span style={{ fontSize: 13, fontWeight: 400 }}> / {summary.qloo.budget || 24}</span>
              </b>
              <span>queries</span>
            </div>
            <div className="stat">
              <b>{summary.qloo.cached}</b>
              <span>from cache</span>
            </div>
            <div className="stat">
              <b>{summary.qloo.failed}</b>
              <span>failed</span>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Model calls {summary.model.calls} of {summary.model.budget || 4}
            {summary.model.failed ? ` · ${summary.model.failed} failed` : ""}
          </p>
        </div>

        <div className="sheet">
          <p className="eyebrow">Evidence collected</p>
          {summary.evidence.total ? (
            <>
              <p style={{ fontSize: 15 }}>
                <b className="tabular">{summary.evidence.total}</b> Qloo results across {summary.evidence.byCategory.length} categor{summary.evidence.byCategory.length === 1 ? "y" : "ies"}
              </p>
              <ul className="bars">
                {summary.evidence.byCategory.map((c) => (
                  <li key={c.category}>
                    <span>{categoryLabel(c.category)}</span>
                    <span className="tabular">{c.count}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 14 }}>
              Nothing yet. Results appear as Qloo answers.
            </p>
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
            {summary.plan.anchors.length ? (
              <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                Anchors: {summary.plan.anchors.join(", ")}
              </p>
            ) : null}
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
    </section>
  );
}

function StageRow({ view }: { view: StageView }) {
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
      <span className="dot" aria-hidden="true" />
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

