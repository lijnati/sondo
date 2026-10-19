import type { CSSProperties } from "react";

export function ExamplesPanel() {
  return (
    <section className="block" id="examples" aria-labelledby="examples-title" style={{ paddingTop: 0 }}>
      <div className="m-container">
        <div className="head">
          <h2 id="examples-title" className="h2 reveal">
            Featured examples. None stored <em>yet</em>.
          </h2>
          <p className="reveal" style={{ "--d": "0.1s" } as CSSProperties}>
            Featured reports appear here once the first live runs are generated. Each one will open instantly
            from a stored, fully cited report.
          </p>
        </div>
        <div className="empty-card reveal" style={{ "--d": "0.15s" } as CSSProperties}>
          <p className="mono">No example reports yet</p>
          <p className="muted" style={{ marginTop: 10, maxWidth: "52ch" }}>
            When a featured run exists, its strategy card will sit here with the evidence ids from that run.
            This page will not invent one.
          </p>
        </div>
      </div>
    </section>
  );
}
