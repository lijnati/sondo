import { BriefForm } from "@/components/brief/brief-form";
import { serverEnv } from "@/lib/env/server";

export function ComposerPanel() {
  const liveRuns = serverEnv().SONDO_LIVE_RUNS === "on";
  return (
    <section className="block" id="composer" aria-labelledby="composer-title" style={{ paddingTop: 20 }}>
      <div className="m-container">
        <div className="head">
          <h2 id="composer-title" className="h2">
            Your <em>brief</em>.
          </h2>
          <p>
            Brand, audience, market, goal and up to six cultural anchors. Sondo shows what it can model, runs the
            research live, and opens a report you can share.
          </p>
        </div>
        <BriefForm liveRuns={liveRuns} />
      </div>
    </section>
  );
}
