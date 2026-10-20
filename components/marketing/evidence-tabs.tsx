"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { useRef, useState } from "react";
import Link from "next/link";

import { categoryLabel } from "@/lib/brief/labels";
import type { FeaturedExcerpt } from "@/lib/db/runs";

const tabs = [
  { id: "strategists", label: "For strategists", panel: "panel-strategists" },
  { id: "judges", label: "For judges", panel: "panel-judges" },
] as const;

const ANGLE: Record<string, string> = {
  mainstream_anchor: "Mainstream anchor",
  distinctive_niche: "Distinctive niche",
  cross_category_bridge: "Cross-category bridge",
};

const TIER: Record<string, { cls: string; label: string }> = {
  direct: { cls: "direct", label: "Directly supported" },
  contextual: { cls: "contextual", label: "Contextual support" },
};

/** Landing: what a claim and its evidence look like, using a real featured report. */
export function EvidenceTabs({ excerpt }: { excerpt: FeaturedExcerpt | null }) {
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    setSelected(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="block" id="evidence" aria-labelledby="evidence-title" style={{ paddingTop: 36 }}>
      <div className="m-container">
        <div className="head" style={{ marginBottom: 0 }}>
          <div>
            <h2 id="evidence-title" className="h2 reveal">
              Evidence, not vibes. Every claim has a <em>source</em>.
            </h2>
            <div className="tabs" role="tablist" aria-label="Who it is for">
              {tabs.map((tab, index) => (
                <button
                  key={tab.id}
                  ref={(node) => {
                    tabRefs.current[index] = node;
                  }}
                  className="tab"
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={selected === index}
                  aria-controls={tab.panel}
                  tabIndex={selected === index ? 0 : -1}
                  onClick={() => setSelected(index)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <p className="reveal" style={{ "--d": "0.1s" } as CSSProperties}>
            A concept is a hypothesis with the Qloo results that suggested it, and a way to test it. The card below is
            copied from a stored report, not drawn for this page.
          </p>
        </div>

        <div className="split-2" role="tabpanel" id="panel-strategists" aria-labelledby="tab-strategists" hidden={selected !== 0}>
          <div>
            <h3 className="h3big">Three directions. Each one cited.</h3>
            <p className="muted" style={{ marginTop: 14, maxWidth: "40ch" }}>
              The brief stays in charge. Sondo researches your audience against a market baseline, then drafts three
              different angles.
            </p>
            <ol className="steps">
              <li>
                <span className="num">1</span>
                <div>
                  <b>Write the brief</b>
                  <span className="s">Brand, audience, market and goal. Anchors if you have them.</span>
                </div>
              </li>
              <li>
                <span className="num">2</span>
                <div>
                  <b>Read the evidence</b>
                  <span className="s">Each claim carries the Qloo results it came from.</span>
                </div>
              </li>
              <li>
                <span className="num">3</span>
                <div>
                  <b>Test the idea</b>
                  <span className="s">Assumptions and risks are part of every concept, not a promise it will work.</span>
                </div>
              </li>
            </ol>
            <Link href="/new" className="btn btn-butter">
              Build a cultural brief <span className="i" aria-hidden="true">→</span>
            </Link>
          </div>
          {excerpt ? <ConceptExcerpt excerpt={excerpt} /> : <ExcerptUnavailable />}
        </div>

        <div className="split-2" role="tabpanel" id="panel-judges" aria-labelledby="tab-judges" hidden={selected !== 1}>
          <div>
            <h3 className="h3big">Ids you can check. Limits written down.</h3>
            <p className="muted" style={{ marginTop: 14, maxWidth: "40ch" }}>
              Built for the Qloo Agentic Hackathon 2026. The agent cites ledger ids. It does not invent scores, and it
              does not predict ROI.
            </p>
            <ol className="steps">
              <li>
                <span className="num">1</span>
                <div>
                  <b>See what was modeled</b>
                  <span className="s">Age, gender, Qloo audiences and locality. Anything else is listed as not modeled.</span>
                </div>
              </li>
              <li>
                <span className="num">2</span>
                <div>
                  <b>Follow an evidence id</b>
                  <span className="s">E# marks a Qloo result from that run, with its rank inside its own query.</span>
                </div>
              </li>
              <li>
                <span className="num">3</span>
                <div>
                  <b>Read the boundary</b>
                  <span className="s">Affinity is not purchase intent, audience size or a forecast.</span>
                </div>
              </li>
            </ol>
            <a className="btn btn-butter" href="#principles">
              What Sondo isn&apos;t <span className="i" aria-hidden="true">→</span>
            </a>
          </div>
          {excerpt ? <LedgerExcerpt excerpt={excerpt} /> : <ExcerptUnavailable />}
        </div>
      </div>
    </section>
  );
}

function ConceptExcerpt({ excerpt: x }: { excerpt: FeaturedExcerpt }) {
  const ins = x.concept.culturalInsight;
  const tier = ins.kind === "evidence" && ins.support ? TIER[ins.support] : undefined;
  return (
    <div className="panel">
      <p className="example-flag">
        From the featured {x.brandName} report · {x.market}
      </p>
      <div className="mock">
        <div className="mock-top">
          <span className="mock-ico" aria-hidden="true">
            ◇
          </span>
          <div>
            <b>{x.concept.name}</b>
            <div className="mono">{ANGLE[x.concept.angle] ?? x.concept.angle}</div>
          </div>
        </div>
        <div className="mock-body">
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
            {x.concept.positioning}
          </p>
          <div className={`claim-card tier-${tier?.cls ?? "hypothesis"}`}>
            <p className="claim">{ins.text}</p>
            <div className="claim-meta">
              <span className={`support support-${tier?.cls ?? "hypothesis"}`}>{tier?.label ?? "Hypothesis"}</span>
              {x.cited.map((c) => (
                <span key={c.id} className="ev ev-static">
                  {c.id}
                  <span className="ev-name">{c.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="mock-foot">
          <Link href={`/r/${x.id}#concepts`} className="btn btn-sm btn-ink">
            Open the full report <span className="i" aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function LedgerExcerpt({ excerpt: x }: { excerpt: FeaturedExcerpt }) {
  return (
    <div className="panel mint">
      <p className="example-flag">Ledger rows behind that claim · {x.brandName} report</p>
      <div className="mock">
        <div className="mock-top">
          <span className="mock-ico" aria-hidden="true" style={{ background: "var(--mint)" }}>
            #
          </span>
          <div>
            <b>Evidence ledger</b>
            <div className="mono">Rank is within its own Qloo query</div>
          </div>
        </div>
        <div className="mock-body">
          {x.cited.length ? (
            x.cited.map((c) => (
              <div key={c.id} className="file">
                <span className="mono" style={{ color: "var(--accent-deep)" }}>
                  {c.id}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{c.name}</b>
                  <div className="mono">
                    {categoryLabel(c.filterType)} · rank {c.rank} of {c.of}
                    {c.lift && c.lift > 0 ? ` · ▲${c.lift} vs baseline (heuristic)` : ""}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">This insight is a hypothesis, so it cites no ledger rows.</p>
          )}
        </div>
        <div className="mock-foot">
          <Link href={`/r/${x.id}#evidence`} className="btn btn-sm btn-outline">
            See the whole ledger
          </Link>
        </div>
      </div>
    </div>
  );
}

function ExcerptUnavailable() {
  return (
    <div className="empty-card ruled">
      <p className="mono">Featured report unavailable</p>
      <p className="muted" style={{ marginTop: 10 }}>
        The report store couldn&apos;t be reached, so there is no excerpt to show. This page will not draw a fake one.
      </p>
    </div>
  );
}
