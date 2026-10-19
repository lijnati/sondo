import type { CSSProperties } from "react";

const is = [
  "Cultural affinity research grounded in Qloo results",
  "What over-indexes for your audience versus a baseline",
  "Hypotheses with a concrete plan to test them",
];

const isNot = [
  "Purchase intent, conversion or ROI forecasts",
  "Audience size or share (“X% of your audience”)",
  "A guarantee that a campaign will work",
];

export function HonestByDesign() {
  return (
    <section className="block" id="principles" aria-labelledby="principles-title">
      <div className="m-container">
        <div className="head">
          <h2 id="principles-title" className="h2 reveal">
            What Sondo is. What it <em>isn&apos;t</em>.
          </h2>
          <p className="reveal" style={{ "--d": "0.1s" } as CSSProperties}>
            Cultural affinity, not purchase intent. The same boundary is printed on every report.
          </p>
        </div>
        <div className="honest">
          <article className="honest-card is reveal">
            <h3>Sondo is</h3>
            <ul>
              {is.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
          <article className="honest-card isnt reveal" style={{ "--d": "0.1s" } as CSSProperties}>
            <h3>Sondo isn&apos;t</h3>
            <ul>
              {isNot.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
