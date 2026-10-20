import type { CSSProperties } from "react";
import Link from "next/link";

import { PixelScene, type SceneCritter } from "@/components/marketing/pixel-scene";

const warmMeadowSky = ["#3d78b8", "#6f9ccc", "#e2c0ae", "#f3cba6", "#f8d6ae"];

const heroCritters: readonly SceneCritter[] = [
  { kind: "bee", motion: "bob", left: "8%", top: "64%", scale: 5 },
];

const title = ["Build", "a", "cultural"] as const;

export function BriefHero() {
  return (
    <header className="sky-hero brief-hero">
      <PixelScene
        preset="meadow"
        seed={11}
        sky={warmMeadowSky}
        shade="hero"
        pollen
        pollenMax={28}
        critters={heroCritters}
      />
      <div className="sky-nav">
        <Link href="/" className="brand" aria-label="Sondo home">
          <span className="brand-mark" aria-hidden="true" />
          Sondo
        </Link>
        <nav aria-label="Brief">
          <a href="#composer">Your brief</a>
          <a href="#examples">Featured reports</a>
          <Link href="/#how-it-works">How it works</Link>
        </nav>
        <div className="sky-logins">
          <Link className="btn btn-sm btn-sheet" href="/">
            Home <span className="i i-ne" aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
      <div className="sky-copy">
        <h1 id="hero-title" className="sky-title split" aria-label="Build a cultural brief">
          {title.map((word, index) => (
            <span key={word} className="w" aria-hidden="true" style={{ "--i": index } as CSSProperties}>
              {word}
            </span>
          ))}
          <span className="w" aria-hidden="true" style={{ "--i": title.length } as CSSProperties}>
            <em>brief</em>
          </span>
        </h1>
        <p className="sky-lede reveal" style={{ "--d": "0.5s" } as CSSProperties}>
          Describe your brand, audience and market. Sondo researches what this audience over-indexes on in Qloo,
          then drafts three concepts that cite their evidence.
        </p>
        <div className="sky-actions reveal" style={{ "--d": "0.65s" } as CSSProperties}>
          <a className="btn btn-butter" href="#composer">
            Write your brief <span className="i" aria-hidden="true">→</span>
          </a>
          <a className="btn btn-sheet" href="#examples">
            See a finished report
          </a>
        </div>
      </div>
    </header>
  );
}
