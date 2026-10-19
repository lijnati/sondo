import type { CSSProperties } from "react";

import { IsoArt } from "@/components/marketing/iso-art";

const steps = [
  {
    n: "1",
    title: "Brand and anchors",
    tone: "mint",
    art: "stack",
    body: "Resolved against Qloo entities. Unknown names are flagged, never invented.",
  },
  {
    n: "2",
    title: "Audience",
    tone: "cream",
    art: "tray",
    body: "Modeled with Qloo's six age buckets, gender, Qloo audiences and locality only.",
  },
  {
    n: "3",
    title: "Market",
    tone: "ice",
    art: "grid",
    body: "Passed to Qloo as a locality. Location claims are scoped to what Qloo supports.",
  },
  {
    n: "4",
    title: "Not modeled",
    tone: "sage",
    art: "paths",
    body: "Anything else in your brief is listed openly, so you know what the research can't see.",
  },
] as const;

export function ReadingCards() {
  return (
    <section className="block" id="reading" aria-labelledby="reading-title">
      <div className="m-container">
        <div className="head">
          <h2 id="reading-title" className="h2 reveal">
            How Sondo reads a brief. Only what Qloo can <em>see</em>.
          </h2>
          <p className="reveal" style={{ "--d": "0.1s" } as CSSProperties}>
            The rail stays honest. Age buckets, gender, Qloo audiences and locality are the signals. Everything
            else is named as not modeled.
          </p>
        </div>
        <ol className="cards">
          {steps.map((step, index) => (
            <li key={step.n} className={`card ${step.tone} reveal`} style={{ "--d": `${index * 0.08}s` } as CSSProperties}>
              <span className="num">{step.n}</span>
              <div className="art">
                <IsoArt kind={step.art} />
              </div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
