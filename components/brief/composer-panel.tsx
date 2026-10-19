import type { CSSProperties } from "react";

import { PixelScene } from "@/components/marketing/pixel-scene";

const fields = ["Brand", "Audience", "Market", "Goal", "Anchors", "Constraints"] as const;

export function ComposerPanel() {
  return (
    <section className="block" id="composer" aria-labelledby="composer-title" style={{ paddingTop: 20 }}>
      <div className="m-container shell">
        <div>
          <h2 id="composer-title" className="h2 reveal">
            Your brief. Not connected <em>yet</em>.
          </h2>
          <p className="muted reveal" style={{ marginTop: 18, maxWidth: "42ch", lineHeight: 1.8, "--d": "0.1s" } as CSSProperties}>
            Brand, audience, market, goal and up to six cultural anchors. It opens here when live research is
            connected.
          </p>
          <ul className="ticks reveal" style={{ "--d": "0.15s" } as CSSProperties}>
            <li>Unknown names are flagged, never invented.</li>
            <li>Only Qloo age buckets, gender, audiences and locality are modeled.</li>
            <li>No purchase intent, conversion or ROI.</li>
          </ul>
          <div className="field-row reveal" style={{ "--d": "0.2s" } as CSSProperties}>
            {fields.map((field) => (
              <span key={field} className="field-chip">
                {field}
              </span>
            ))}
          </div>
          <p className="mono" style={{ marginTop: 14 }}>
            Planned fields. Not a form you can submit.
          </p>
        </div>
        <div className="art-card reveal" style={{ "--d": "0.15s" } as CSSProperties}>
          <PixelScene preset="bloom" seed={28} shade="soft" />
          <div className="receipt">
            <div className="receipt-top">
              <span className="ok" aria-hidden="true">
                ·
              </span>
              Composer shell
            </div>
            <div className="amount">
              <div className="mono" style={{ marginBottom: 12 }}>
                Not connected
              </div>
              <p className="big" style={{ fontSize: 34 }}>
                Waiting on a live run
              </p>
              <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                The fields above are the plan. They do not send a brief yet.
              </p>
            </div>
            <div className="receipt-row">
              <span>Up to six anchors</span>
              <span>Planned</span>
            </div>
            <div className="receipt-row mint">
              <span>Every claim will cite a Qloo result</span>
              <span aria-hidden="true">→</span>
            </div>
          </div>
          <div className="pills" aria-hidden="true">
            <span>Brand</span>
            <span>Audience</span>
            <span>Market</span>
          </div>
        </div>
      </div>
    </section>
  );
}
