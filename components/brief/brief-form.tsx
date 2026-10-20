"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";

import { Brief, OBJECTIVES, type BriefInput } from "@/lib/agent/brief";
import { AGE_LABEL, CATEGORY_LABEL, OBJECTIVE_LABEL } from "@/lib/brief/labels";
import { briefErrors } from "@/lib/brief/messages";
import { AGE_BUCKETS, ENTITY_TYPES, type AgeBucket, type EntityType } from "@/lib/qloo/types";
import { RunLive } from "@/components/run/run-live";

import coldbrew from "@/scripts/briefs/coldbrew-austin.json";
import hotel from "@/scripts/briefs/hotel-lisbon.json";
import sneakers from "@/scripts/briefs/sneakers-nyc.json";

interface Draft {
  brandName: string;
  brandDescription: string;
  audienceDescription: string;
  ages: AgeBucket[];
  gender: "" | "male" | "female";
  market: string;
  objective: (typeof OBJECTIVES)[number] | "";
  anchors: { name: string; type?: EntityType }[];
  excludeCategories: EntityType[];
  tone: string;
  notes: string;
}

const EMPTY: Draft = {
  brandName: "",
  brandDescription: "",
  audienceDescription: "",
  ages: [],
  gender: "",
  market: "",
  objective: "",
  anchors: [],
  excludeCategories: [],
  tone: "",
  notes: "",
};

/** The fictional evaluation briefs (scripts/briefs), offered as one-click examples. */
const EXAMPLES = [
  { label: "Sneakers · New York City", brief: sneakers },
  { label: "Cold brew · Austin", brief: coldbrew },
  { label: "Hotel · Lisbon", brief: hotel },
] as const;

function fromBrief(input: unknown): Draft {
  const b = Brief.parse(input);
  return {
    brandName: b.brandName,
    brandDescription: b.brandDescription,
    audienceDescription: b.audience.description,
    ages: b.audience.ages ?? [],
    gender: b.audience.gender ?? "",
    market: b.market,
    objective: b.objective,
    anchors: b.anchors.map((a) => ({ name: a.name, ...(a.type ? { type: a.type } : {}) })),
    excludeCategories: b.constraints.excludeCategories,
    tone: b.constraints.tone ?? "",
    notes: b.constraints.notes ?? "",
  };
}

function toBriefInput(d: Draft): BriefInput {
  const opt = (s: string) => (s.trim() ? s : undefined);
  return {
    brandName: d.brandName,
    brandDescription: d.brandDescription,
    audience: {
      description: d.audienceDescription,
      ...(d.ages.length ? { ages: d.ages } : {}),
      ...(d.gender ? { gender: d.gender } : {}),
    },
    market: d.market,
    objective: d.objective as (typeof OBJECTIVES)[number],
    anchors: d.anchors,
    constraints: {
      excludeCategories: d.excludeCategories,
      ...(opt(d.tone) ? { tone: d.tone } : {}),
      ...(opt(d.notes) ? { notes: d.notes } : {}),
    },
  };
}

/** Field keys (as briefErrors reports them) → the label a person sees. */
const FIELD_LABEL: Record<string, string> = {
  brandName: "Brand name",
  brandDescription: "What the brand is",
  "audience.description": "Who they are",
  "audience.ages": "Age buckets",
  market: "City or region",
  objective: "Goal",
  anchors: "Cultural anchors",
  "constraints.tone": "Tone",
  "constraints.notes": "Notes",
};

function Section({ n, title, why, children }: { n: number; title: string; why: string; children: ReactNode }) {
  return (
    <fieldset className="fieldset">
      <legend>
        <span className="legend-num" aria-hidden="true">
          {n}
        </span>
        {title}
      </legend>
      <p className="why">{why}</p>
      {children}
    </fieldset>
  );
}

type Phase =
  | { kind: "editing" }
  | { kind: "submitting" }
  | { kind: "running"; runId: string; brandName: string; reader: ReadableStreamDefaultReader<Uint8Array> }
  | { kind: "failed"; tone: "warn" | "bad"; message: ReactNode; retry: boolean };

export function BriefForm({ liveRuns }: { liveRuns: boolean }) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "editing" });
  const [anchorName, setAnchorName] = useState("");
  const [anchorType, setAnchorType] = useState<EntityType | "">("");
  const idempotency = useRef<string | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const router = useRouter();

  const parsed = useMemo(() => Brief.safeParse(toBriefInput(draft), { reportInput: true }), [draft]);
  const errors = parsed.success ? {} : briefErrors(parsed.error);
  const show = (key: string) => (attempted || touched.has(key) ? (errors[key] ?? serverErrors[key]) : serverErrors[key]);

  const update = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setServerErrors({});
    idempotency.current = null; // a changed brief is a new submission
  };
  const touch = (key: string) => setTouched((t) => (t.has(key) ? t : new Set(t).add(key)));

  const addAnchor = () => {
    const name = anchorName.trim();
    if (!name || draft.anchors.length >= 6) return;
    if (draft.anchors.some((a) => a.name.toLowerCase() === name.toLowerCase())) return;
    update({ anchors: [...draft.anchors, { name: name.slice(0, 80), ...(anchorType ? { type: anchorType } : {}) }] });
    setAnchorName("");
    setAnchorType("");
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (phase.kind === "submitting" || phase.kind === "running") return;
    setAttempted(true);
    if (!parsed.success) {
      const first = Object.keys(errors)[0];
      if (first) document.getElementById(`${uid}-${first}`)?.focus();
      return;
    }
    idempotency.current ??= crypto.randomUUID();
    setPhase({ kind: "submitting" });
    let res: Response;
    try {
      res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotency.current },
        body: JSON.stringify({ brief: parsed.data }),
      });
    } catch {
      setPhase({ kind: "failed", tone: "bad", message: "Couldn't reach Sondo. Check your connection and try again.", retry: true });
      return;
    }
    const runId = res.headers.get("x-run-id");
    if (res.ok && res.body && runId) {
      window.history.replaceState(null, "", `/r/${runId}`);
      setPhase({ kind: "running", runId, brandName: parsed.data.brandName, reader: res.body.getReader() });
      sectionRef.current?.scrollIntoView({ block: "start" });
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; runId?: string; issues?: { field: string; message: string }[] };
    if (res.status === 409 && body.runId) {
      router.push(`/r/${body.runId}`);
      return;
    }
    if (res.status === 400 && body.issues) {
      setServerErrors(Object.fromEntries(body.issues.map((i) => [i.field, i.message])));
      setPhase({ kind: "editing" });
      return;
    }
    const message = body.message ?? "Something went wrong starting the run.";
    if (res.status === 429 || res.status === 503) {
      setPhase({
        kind: "failed",
        tone: "warn",
        message: (
          <>
            {message} <Link className="text-link" href="/#featured">See featured reports</Link>
          </>
        ),
        retry: res.status === 429 && body.error === "concurrent",
      });
      return;
    }
    setPhase({ kind: "failed", tone: "bad", message, retry: true });
  }

  if (phase.kind === "running") {
    return (
      <div ref={sectionRef}>
        <RunLive runId={phase.runId} brandName={phase.brandName} reader={phase.reader} titleAs="h2" />
      </div>
    );
  }

  const busy = phase.kind === "submitting";
  const fieldId = (key: string) => `${uid}-${key}`;
  const errId = (key: string) => `${uid}-${key}-error`;
  const aria = (key: string) => ({ id: fieldId(key), "aria-invalid": show(key) ? true : undefined, "aria-describedby": show(key) ? errId(key) : undefined });
  const err = (key: string) => (show(key) ? <p id={errId(key)} className="field-error">{show(key)}</p> : null);
  const invalid = attempted && !parsed.success ? Object.keys(errors) : [];
  const constraintsOpen = ["constraints.tone", "constraints.notes"].some((k) => show(k)) || draft.excludeCategories.length > 0 || !!draft.tone || !!draft.notes;

  return (
    <div ref={sectionRef} className="form-grid">
      <form onSubmit={submit} noValidate aria-describedby={`${uid}-privacy`}>
        <div className="sheet examples-sheet">
          <p className="eyebrow">Start from an example, or write your own</p>
          <div className="examples">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="toggle"
                onClick={() => {
                  update(fromBrief(ex.brief));
                  setTouched(new Set());
                  setAttempted(false);
                }}
              >
                {ex.label}
              </button>
            ))}
            <button
              type="button"
              className="toggle toggle-ghost"
              onClick={() => {
                update(EMPTY);
                setTouched(new Set());
                setAttempted(false);
              }}
            >
              Clear the form
            </button>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
            Fictional brands with real cultural anchors, the same briefs Sondo is evaluated on.
          </p>
        </div>

        <Section n={1} title="Brand" why="Sondo looks the brand up in Qloo and uses it as a signal when Qloo knows it.">
          <div className="field">
            <label htmlFor={fieldId("brandName")}>
              Brand name <span className="count">{draft.brandName.length}/80</span>
            </label>
            <input className="input" maxLength={80} value={draft.brandName} onChange={(e) => update({ brandName: e.target.value })} onBlur={() => touch("brandName")} autoComplete="off" {...aria("brandName")} />
            {err("brandName")}
          </div>
          <div className="field">
            <label htmlFor={fieldId("brandDescription")}>
              What the brand is <span className="count">{draft.brandDescription.length}/600</span>
            </label>
            <textarea className="textarea" maxLength={600} value={draft.brandDescription} onChange={(e) => update({ brandDescription: e.target.value })} onBlur={() => touch("brandDescription")} {...aria("brandDescription")} />
            <span className="hint">Product, positioning, what is launching. At least 10 characters.</span>
            {err("brandDescription")}
          </div>
        </Section>

        <Section n={2} title="Audience" why="Age buckets and gender become Qloo signals. Everything else stays as context and is listed as not modeled.">
          <div className="field">
            <label htmlFor={fieldId("audience.description")}>
              Who they are <span className="count">{draft.audienceDescription.length}/400</span>
            </label>
            <textarea className="textarea" maxLength={400} value={draft.audienceDescription} onChange={(e) => update({ audienceDescription: e.target.value })} onBlur={() => touch("audience.description")} {...aria("audience.description")} />
            <span className="hint">Free text. Sondo models only age buckets, gender and the market; the rest is listed as not modeled.</span>
            {err("audience.description")}
          </div>
          <div className="field">
            <span className="label" id={fieldId("audience.ages")}>
              <span>
                Qloo age buckets <span className="opt">optional</span>
              </span>
              <span className="count">{draft.ages.length}/3</span>
            </span>
            <div className="toggles" role="group" aria-labelledby={fieldId("audience.ages")}>
              {AGE_BUCKETS.map((a) => {
                const on = draft.ages.includes(a);
                return (
                  <button key={a} type="button" className="toggle" aria-pressed={on} disabled={!on && draft.ages.length >= 3} onClick={() => update({ ages: on ? draft.ages.filter((x) => x !== a) : [...draft.ages, a] })}>
                    {AGE_LABEL[a]}
                  </button>
                );
              })}
            </div>
            <span className="hint">Optional, up to three. Without ages there is no audience lift, only the market baseline.</span>
            {err("audience.ages")}
          </div>
          <div className="field">
            <span className="label" id={fieldId("audience.gender")}>
              <span>
                Gender <span className="opt">optional</span>
              </span>
            </span>
            <div className="toggles" role="radiogroup" aria-labelledby={fieldId("audience.gender")}>
              {(["", "female", "male"] as const).map((g) => (
                <button key={g || "any"} type="button" role="radio" className="toggle" aria-checked={draft.gender === g} onClick={() => update({ gender: g })}>
                  {g === "" ? "Not specified" : g === "female" ? "Female" : "Male"}
                </button>
              ))}
            </div>
            <span className="hint">Set it only if the brief targets one. Qloo models binary gender only.</span>
          </div>
        </Section>

        <Section n={3} title="Market and goal" why="The market is Qloo's locality signal and the baseline Sondo compares this audience against. The goal shapes the concepts.">
          <div className="field">
            <label htmlFor={fieldId("market")}>City or region</label>
            <input className="input" maxLength={80} value={draft.market} onChange={(e) => update({ market: e.target.value })} onBlur={() => touch("market")} placeholder="e.g. New York City" autoComplete="off" {...aria("market")} />
            {err("market")}
          </div>
          <div className="field">
            <span className="label" id={fieldId("objective")}>
              Goal
            </span>
            <div className="toggles" role="radiogroup" aria-labelledby={fieldId("objective")}>
              {OBJECTIVES.map((o) => (
                <button key={o} type="button" role="radio" className="toggle" aria-checked={draft.objective === o} onClick={() => update({ objective: o })}>
                  {OBJECTIVE_LABEL[o]}
                </button>
              ))}
            </div>
            {err("objective")}
          </div>
        </Section>

        <Section n={4} title="Cultural anchors" why="The strongest signal you can give: artists, shows, brands or places this audience already loves.">
          <div className="field">
            <label htmlFor={fieldId("anchors")}>
              <span>
                Things this audience is known to love <span className="opt">optional</span>
              </span>
              <span className="count">{draft.anchors.length}/6</span>
            </label>
            <div className="anchor-add">
              <input
                className="input"
                id={fieldId("anchors")}
                maxLength={80}
                value={anchorName}
                disabled={draft.anchors.length >= 6}
                placeholder="An artist, show, brand, place…"
                onChange={(e) => setAnchorName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAnchor();
                  }
                }}
                aria-invalid={show("anchors") ? true : undefined}
                aria-describedby={show("anchors") ? errId("anchors") : undefined}
              />
              <select className="select" aria-label="Anchor category" value={anchorType} onChange={(e) => setAnchorType(e.target.value as EntityType | "")} disabled={draft.anchors.length >= 6}>
                <option value="">Any category</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CATEGORY_LABEL[t]}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-sm btn-outline" onClick={addAnchor} disabled={!anchorName.trim() || draft.anchors.length >= 6}>
                Add
              </button>
            </div>
            {draft.anchors.length ? (
              <ul className="tokens" aria-label="Anchors added">
                {draft.anchors.map((a) => (
                  <li key={a.name} className="token">
                    {a.name}
                    {a.type ? <small>{CATEGORY_LABEL[a.type]}</small> : null}
                    <button type="button" aria-label={`Remove ${a.name}`} onClick={() => update({ anchors: draft.anchors.filter((x) => x !== a) })}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <span className="hint">Optional but strongly recommended. Names Qloo can&apos;t find are reported, never invented.</span>
            {err("anchors")}
          </div>
        </Section>

        <details className="fieldset constraints" open={constraintsOpen || undefined}>
          <summary>
            <span className="legend-num" aria-hidden="true">
              5
            </span>
            Constraints <span className="opt">optional</span>
          </summary>
          <p className="why">Leave out categories you can&apos;t use, and note the tone the concepts should keep.</p>
          <div className="field">
            <span className="label" id={fieldId("constraints.excludeCategories")}>
              Leave out categories
            </span>
            <div className="toggles" role="group" aria-labelledby={fieldId("constraints.excludeCategories")}>
              {ENTITY_TYPES.map((t) => {
                const on = draft.excludeCategories.includes(t);
                return (
                  <button key={t} type="button" className="toggle" aria-pressed={on} onClick={() => update({ excludeCategories: on ? draft.excludeCategories.filter((x) => x !== t) : [...draft.excludeCategories, t] })}>
                    {CATEGORY_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="field-pair" style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor={fieldId("constraints.tone")}>
                Tone <span className="count">{draft.tone.length}/120</span>
              </label>
              <input className="input" maxLength={120} value={draft.tone} onChange={(e) => update({ tone: e.target.value })} placeholder="e.g. warm, never preachy" autoComplete="off" {...aria("constraints.tone")} />
              {err("constraints.tone")}
            </div>
            <div className="field">
              <label htmlFor={fieldId("constraints.notes")}>
                Notes <span className="count">{draft.notes.length}/400</span>
              </label>
              <input className="input" maxLength={400} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} autoComplete="off" {...aria("constraints.notes")} />
              {err("constraints.notes")}
            </div>
          </div>
        </details>

        {phase.kind === "failed" ? (
          <div className={`notice ${phase.tone}`} role="alert" style={{ marginTop: 16 }}>
            <p>{phase.message}</p>
          </div>
        ) : null}
        {invalid.length ? (
          <div className="notice bad error-summary" role="alert" style={{ marginTop: 16 }}>
            <div>
              <p>Some fields need attention before Sondo can start.</p>
              <ul className="error-links">
                {invalid.map((k) => (
                  <li key={k}>
                    <a
                      href={`#${fieldId(k)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(fieldId(k));
                        el?.scrollIntoView({ block: "center" });
                        (el?.matches("input, textarea") ? el : el?.parentElement?.querySelector<HTMLElement>("button"))?.focus();
                      }}
                    >
                      {FIELD_LABEL[k] ?? k}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="form-actions">
          <button type="submit" className="btn btn-butter" disabled={busy || !liveRuns} aria-disabled={busy || !liveRuns}>
            {busy ? "Starting research…" : phase.kind === "failed" && phase.retry ? "Try again" : "Run research"}
            <span className="i" aria-hidden="true">→</span>
          </button>
          <span className="muted" style={{ fontSize: 13 }}>
            {liveRuns ? "Up to 24 Qloo queries and 4 model calls · about two minutes" : "Live runs are paused. Featured reports are still open."}
          </span>
        </div>
        <p id={`${uid}-privacy`} className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          Reports are public to anyone with the link. Don&apos;t include confidential plans or personal data.
        </p>
      </form>

      <BriefRail draft={draft} errors={errors} liveRuns={liveRuns} />
    </div>
  );
}

const REQUIRED = [
  ["brandName", "Brand name"],
  ["brandDescription", "What the brand is"],
  ["audience.description", "Who the audience is"],
  ["market", "City or region"],
  ["objective", "Goal"],
] as const;

function requiredValue(d: Draft, key: (typeof REQUIRED)[number][0]): string {
  switch (key) {
    case "brandName":
      return d.brandName;
    case "brandDescription":
      return d.brandDescription;
    case "audience.description":
      return d.audienceDescription;
    case "market":
      return d.market;
    case "objective":
      return d.objective;
  }
}

/** "How Sondo will read this": what maps to a Qloo signal, what doesn't, and what's still needed. */
function BriefRail({ draft, errors, liveRuns }: { draft: Draft; errors: Record<string, string>; liveRuns: boolean }) {
  return (
    <aside className="sheet form-rail" aria-label="How Sondo will read this brief">
      <p className="eyebrow">How Sondo will read this</p>
      <dl className="rail-list">
        <dt>Locality signal</dt>
        <dd className={draft.market.trim() ? "" : "not"}>{draft.market.trim() || "No market yet"}</dd>
        <dt>Age buckets</dt>
        <dd className={draft.ages.length ? "" : "not"}>{draft.ages.length ? draft.ages.map((a) => AGE_LABEL[a]).join(", ") : "None: market baseline only, no audience lift"}</dd>
        <dt>Gender</dt>
        <dd className={draft.gender ? "" : "not"}>{draft.gender ? (draft.gender === "female" ? "Female" : "Male") : "Not modeled"}</dd>
        <dt>Entity anchors</dt>
        <dd className={draft.anchors.length ? "" : "not"}>{draft.anchors.length ? draft.anchors.map((a) => a.name).join(", ") : "None: Sondo will rely on the brand name"}</dd>
        <dt>Not modeled by Qloo</dt>
        <dd className="not">Free-text psychographics, income, job title and values, unless a Qloo tag matches. The report lists them.</dd>
      </dl>
      <p className="eyebrow" style={{ marginTop: 22 }}>
        Needed to start
      </p>
      <ul className="ready-list">
        {REQUIRED.map(([k, label]) => {
          const ok = !errors[k] && requiredValue(draft, k).trim() !== "";
          return (
            <li key={k} data-ok={ok}>
              <span className="ready-mark" aria-hidden="true">
                {ok ? "✓" : ""}
              </span>
              {label}
              <span className="sr-only">{ok ? ": done" : ": still needed"}</span>
            </li>
          );
        })}
      </ul>
      <p className="rail-budget">{liveRuns ? "Each run uses up to 24 Qloo queries and 4 model calls, and takes about two minutes." : "Live runs are paused right now."}</p>
    </aside>
  );
}
