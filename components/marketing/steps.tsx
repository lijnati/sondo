import type { CSSProperties } from "react";

import { IsoArt } from "@/components/marketing/iso-art";

const steps = [
  {
    n: "1",
    title: "Brief",
    tone: "mint",
    art: "stack",
    body: "Your brand, audience, market and goal. Sondo shows which parts Qloo can model, and which it can't.",
  },
  {
    n: "2",
    title: "Research",
    tone: "cream",
    art: "tray",
    body: "Live Qloo queries across music, film, TV, podcasts, brands and places, for your audience and for a baseline.",
  },
  {
    n: "3",
    title: "Critique",
    tone: "ice",
    art: "grid",
    body: "Deterministic checks for coverage, empty categories and signals that are merely mainstream.",
  },
  {
    n: "4",
    title: "Strategies",
    tone: "sage",
    art: "paths",
    body: "Three differentiated directions. Every cultural claim cites the Qloo result behind it, with a plan to validate it.",
  },
] as const;

export function Steps() {
  return (
    <section className="block" id="how-it-works" aria-labelledby="how-title">
      <div className="m-container">
        <div className="head">
          <h2 id="how-title" className="h2 reveal">
            Four steps. <em>Cited</em> strategies.
          </h2>
          <p className="reveal" style={{ "--d": "0.1s" } as CSSProperties}>
            You give Sondo a brand, an audience, a market and a goal. It researches Qloo, critiques what came
            back, and drafts three directions. Every cultural claim cites the result behind it.
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
