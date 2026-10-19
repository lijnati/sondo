"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const tabs = [
  { id: "strategists", label: "For strategists", panel: "panel-strategists" },
  { id: "judges", label: "For judges", panel: "panel-judges" },
] as const;

export function EvidenceTabs() {
  const [selected, setSelected] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const panel = document.getElementById(tabs[selected]?.panel ?? "");
    panel?.querySelectorAll<HTMLElement>(".reveal").forEach((node) => node.classList.add("is-in"));
  }, [selected]);

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
            <div className="tabs reveal" role="tablist" aria-label="Who it is for" style={{ "--d": "0.12s" } as CSSProperties}>
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
            A strategy is a hypothesis with the Qloo result that suggested it, and a way to test it. The card
            below is an illustration, not a live result.
          </p>
        </div>

        <div
          className="split-2"
          role="tabpanel"
          id="panel-strategists"
          aria-labelledby="tab-strategists"
          hidden={selected !== 0}
        >
          <div>
            <h3 className="h3big">Three directions. Each one cited.</h3>
            <p className="muted" style={{ marginTop: 14, maxWidth: "40ch" }}>
              The brief stays in charge. Sondo researches your audience against a market baseline, then drafts
              three different angles.
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
                  <b>Read the finding</b>
                  <span className="s">Each finding carries the evidence ids it came from.</span>
                </div>
              </li>
              <li>
                <span className="num">3</span>
                <div>
                  <b>Test the idea</b>
                  <span className="s">How to validate is part of the strategy, not a promise it will work.</span>
                </div>
              </li>
            </ol>
            <Link href="/new" className="btn btn-butter">
              Build a cultural brief <span className="i" aria-hidden="true">→</span>
            </Link>
          </div>
          <StrategyMock />
        </div>

        <div
          className="split-2"
          role="tabpanel"
          id="panel-judges"
          aria-labelledby="tab-judges"
          hidden={selected !== 1}
        >
          <div>
            <h3 className="h3big">Ids you can check. Limits written down.</h3>
            <p className="muted" style={{ marginTop: 14, maxWidth: "40ch" }}>
              Built for the Qloo Agentic Hackathon 2026. The agent cites ledger ids. It does not invent scores,
              and it does not predict ROI.
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
                  <span className="s">E# marks a Qloo result from that run. F# marks a finding that cites them.</span>
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
          <LedgerMock />
        </div>
      </div>
    </section>
  );
}

function StrategyMock() {
  return (
    <div className="panel reveal" style={{ "--d": "0.15s" } as CSSProperties}>
      <p className="example-flag">Illustrative example. Not a Qloo result.</p>
      <div className="mock">
        <div className="mock-top">
          <span className="mock-ico" aria-hidden="true">
            ◇
          </span>
          <div>
            <b>Strategy 2</b>
            <div className="mono">Niche distinctiveness · example</div>
          </div>
        </div>
        <div className="mock-body">
          <div className="row">
            <span className="chip">Illustrative example</span>
            <span className="mono">F2</span>
          </div>
          <div className="mock-title">A niche live-music territory.</div>
          <div className="row">
            <div className="row" style={{ gap: 10 }}>
              <span className="avatar">Ex</span>
              <div>
                <b>Example audience</b>
                <div className="mono">Age, gender, locality</div>
              </div>
            </div>
            <span className="mono">Sample brief</span>
          </div>
          <div className="file">
            <span aria-hidden="true">▤</span>
            <div style={{ flex: 1 }}>
              <b>Finding F2 cites E14 and E31</b>
              <div className="mono">Placeholder ids, not a live ledger</div>
            </div>
          </div>
          <div className="cols">
            <div>
              <b>Audience lift vs baseline</b>
              <p className="muted" style={{ marginTop: 6 }}>
                Example rank 4 with the audience. Example rank 18 on the market baseline.
              </p>
            </div>
            <div>
              <b>How to validate</b>
              <p className="muted" style={{ marginTop: 6 }}>
                Try one placement before you scale it. A hypothesis, not a forecast.
              </p>
            </div>
          </div>
          <div className="note-mint">
            <b>Every claim cited</b>
            <div className="mono" style={{ marginTop: 3 }}>
              Sondo heuristic · sample only
            </div>
          </div>
        </div>
        <div className="mock-foot">
          <a className="btn btn-sm btn-outline" href="#how-it-works">
            How it works
          </a>
          <Link href="/new" className="btn btn-sm btn-ink">
            Build a cultural brief
          </Link>
        </div>
      </div>
      <p className="example-note">Previews use example data.</p>
    </div>
  );
}

function LedgerMock() {
  return (
    <div className="panel mint">
      <p className="example-flag">Illustrative example. Not a Qloo result.</p>
      <div className="mock">
        <div className="mock-top">
          <span className="mock-ico" aria-hidden="true" style={{ background: "var(--mint)" }}>
            #
          </span>
          <div>
            <b>Evidence ledger</b>
            <div className="mono">Example rows · not from a run</div>
          </div>
        </div>
        <div className="mock-body">
          <div className="row">
            <span className="chip">Illustrative example</span>
            <span className="mono">Sample</span>
          </div>
          <div className="file">
            <span className="mono">E14</span>
            <div style={{ flex: 1 }}>
              <b>Sample result</b>
              <div className="mono">Example rank 4 · audience query</div>
            </div>
          </div>
          <div className="file">
            <span className="mono">E31</span>
            <div style={{ flex: 1 }}>
              <b>Sample result</b>
              <div className="mono">Example rank 18 · market baseline</div>
            </div>
          </div>
          <div className="note-mint">
            <b>Every claim cited</b>
            <div className="mono" style={{ marginTop: 3 }}>
              Real reports use ids from that run only
            </div>
          </div>
        </div>
      </div>
      <p className="example-note">Previews use example data.</p>
    </div>
  );
}
