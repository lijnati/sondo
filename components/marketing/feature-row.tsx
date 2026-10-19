import type { CSSProperties } from "react";
import Link from "next/link";

import { PixelScene } from "@/components/marketing/pixel-scene";

export function FeatureRow() {
  return (
    <section className="block" id="lift" aria-labelledby="lift-title" style={{ paddingTop: 36 }}>
      <div className="m-container feature">
        <div>
          <h2 id="lift-title" className="h2 reveal">
            Audience lift, not averages. <em>This</em> audience, not everyone.
          </h2>
          <p className="muted reveal" style={{ marginTop: 18, maxWidth: "42ch", lineHeight: 1.8, "--d": "0.1s" } as CSSProperties}>
            Sondo runs each category twice. Once with the audience signals, once as a location baseline.
            The comparison shows what over-indexes here. Lift is a Sondo heuristic, not audience size and not
            a sales forecast.
          </p>
          <ul className="ticks reveal" style={{ "--d": "0.15s" } as CSSProperties}>
            <li>
              <SearchIcon />
              Target query and market baseline, side by side.
            </li>
            <li>
              <LinesIcon />
              Over-indexing affinities, labelled as a heuristic.
            </li>
            <li>
              <CardIcon />
              No purchase intent, conversion or ROI.
            </li>
          </ul>
          <Link href="/new" className="btn btn-butter reveal" style={{ "--d": "0.2s" } as CSSProperties}>
            Build a cultural brief <span className="i" aria-hidden="true">→</span>
          </Link>
          <p style={{ marginTop: 18 }}>
            <a className="text-link" href="#evidence">
              See the example card ↗
            </a>
          </p>
        </div>
        <div className="art-card reveal" style={{ "--d": "0.15s" } as CSSProperties}>
          <PixelScene preset="bloom" seed={4} shade="soft" />
          <div className="receipt">
            <div className="receipt-top">
              <span className="ok" aria-hidden="true">
                ✓
              </span>
              Example affinity
            </div>
            <div className="amount">
              <div className="mono" style={{ marginBottom: 12 }}>
                Sample · not a Qloo result
              </div>
              <p className="big">
                <span className="sr-only">Example ranks </span>4<small> vs 18</small>
              </p>
              <p className="muted" style={{ marginTop: 12, fontSize: 11 }}>
                Audience rank, then the market baseline. Sondo heuristic.
              </p>
            </div>
            <div className="receipt-row">
              <span>One category · cites E14</span>
              <span>Example</span>
            </div>
            <div className="receipt-row mint">
              <span>Over-indexes for this audience</span>
              <span aria-hidden="true">↗</span>
            </div>
          </div>
          <div className="pills" aria-hidden="true">
            <span>Audience</span>
            <span>Baseline</span>
            <span>Example</span>
          </div>
        </div>
      </div>
      <p className="example-note m-container" style={{ marginTop: 16 }}>
        Previews use example data.
      </p>
    </section>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M12 12l4 4" />
    </svg>
  );
}

function LinesIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 14V4M3 14h12" />
      <path d="M6 11l3-4 2.5 2.5L15 5" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2" y="4" width="14" height="10" rx="2" />
      <path d="M2 8h14" />
    </svg>
  );
}
