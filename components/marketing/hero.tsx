import type { CSSProperties } from "react";
import Link from "next/link";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { PixelScene, type SceneCritter } from "@/components/marketing/pixel-scene";

/** A touch warmer than the meadow preset's default noon sky. */
const warmMeadowSky = ["#3d78b8", "#6f9ccc", "#e2c0ae", "#f3cba6", "#f8d6ae"];

const heroCritters: readonly SceneCritter[] = [
  { kind: "bee", motion: "bob", left: "8%", top: "62%", scale: 5 },
];

const lead = ["Stop", "guessing", "what", "your", "audience"] as const;

export function Hero() {
  return (
    <header className="sky-hero">
      <PixelScene
        preset="meadow"
        seed={7}
        sky={warmMeadowSky}
        shade="hero"
        pollen
        pollenMax={36}
        critters={heroCritters}
      />
      <MarketingHeader />
      <div className="sky-copy">
        <h1 id="hero-title" className="sky-title split" aria-label="Stop guessing what your audience loves.">
          {lead.map((word, index) => (
            <span key={word} className="w" aria-hidden="true" style={{ "--i": index } as CSSProperties}>
              {word}
            </span>
          ))}
          <span className="w" aria-hidden="true" style={{ "--i": lead.length } as CSSProperties}>
            <em>loves.</em>
          </span>
        </h1>
        <p className="sky-lede reveal" style={{ "--d": "0.5s" } as CSSProperties}>
          Sondo turns a brand brief into evidence-backed campaign strategies, grounded in Qloo&apos;s cultural
          graph. Every cultural claim traces to a specific Qloo result.
        </p>
        <div className="sky-actions reveal" style={{ "--d": "0.65s" } as CSSProperties}>
          <Link href="/new" className="btn btn-butter">
            Build a cultural brief <span className="i" aria-hidden="true">→</span>
          </Link>
          <a className="btn btn-sheet" href="#how-it-works">
            How it works
          </a>
        </div>
        <p className="sky-fine reveal" style={{ "--d": "0.8s" } as CSSProperties}>
          Grounded in Qloo&apos;s cultural graph. Every claim cited.
        </p>
      </div>
    </header>
  );
}
