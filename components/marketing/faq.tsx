import type { CSSProperties } from "react";

const faqs = [
  {
    q: "What is Qloo?",
    a: "Qloo keeps a cultural graph of how taste connects across music, film, TV, podcasts, books, brands and places. Sondo reads that graph through the hackathon API. Search resolves names. Insights return cross-category affinity, tags and demographics. Sondo does not add a second data source.",
  },
  {
    q: "Where does the data come from?",
    a: "From live Qloo requests during a run. Affinity is Qloo's relevance score for that query. It is not a probability, an audience share, or a count of people. Response bodies are not committed to the repo. Test fixtures are synthetic, with fictional names and fake ids.",
  },
  {
    q: "Does Sondo predict ROI?",
    a: "No. It does not predict purchase intent, conversion, ROI, audience size or share, and it does not promise a campaign will work. A strategy is a hypothesis with a plan to test it. The validator blocks invented numbers and performance claims.",
  },
  {
    q: "What does lift mean?",
    a: "Audience lift runs each category twice: once with the audience signals, once as a location baseline. Comparing them shows what over-indexes for this audience. Lift is a Sondo heuristic, labelled as such. It is not a Qloo metric and it is not audience size.",
  },
  {
    q: "Is it free and open source?",
    a: "The project is open source under the MIT License. This build has no accounts and no billing. Live Qloo calls need a hackathon API key and the agent needs a model key. Both stay on the server.",
  },
  {
    q: "How do I try it?",
    a: "No login. Open a featured report to see a finished run, or build a brief and watch the agent research it live. A run takes about two to three minutes and keeps going if you leave; its report link works once it finishes. Each visitor gets a few live runs a day to protect the shared Qloo quota. A run marked partial could not ground all three concepts, and the report says why.",
  },
] as const;

export function Faq() {
  return (
    <section className="block" id="faq" aria-labelledby="faq-title" style={{ paddingTop: 0 }}>
      <div className="m-container faq">
        <div className="faq-l reveal">
          <svg width="64" height="90" viewBox="0 0 64 90" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.7" aria-hidden="true">
            <path d="M18 26c0-10 7-16 15-16s15 6 15 15c0 12-14 13-14 26v6" />
            <path d="M22 27c0-8 5-13 11-13s11 5 11 11c0 10-14 12-14 26v6" />
            <ellipse cx="32" cy="76" rx="12" ry="5" />
            <ellipse cx="32" cy="72" rx="6" ry="3" />
          </svg>
          <h2 id="faq-title" className="h2" style={{ marginTop: 18 }}>
            Fair questions. <em>Plain</em> answers.
          </h2>
          <p className="muted" style={{ marginTop: 14 }}>
            Short answers from the product notes.
          </p>
        </div>
        <div className="reveal" style={{ "--d": "0.1s" } as CSSProperties}>
          {faqs.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
