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
          <a href="#examples">Examples</a>
          <a href="#reading">How it reads</a>
          <Link href="/">About</Link>
        </nav>
        <div className="sky-logins">
          <a className="btn btn-sm btn-sheet" href="#composer">
            Your brief <span className="i" aria-hidden="true">↓</span>
          </a>
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
          Describe your brand, audience and market. Sondo researches what this audience genuinely over-indexes
          on, then drafts three cited strategies.
        </p>
        <div className="sky-actions reveal" style={{ "--d": "0.65s" } as CSSProperties}>
          <a className="btn btn-butter" href="#reading">
            How Sondo reads it <span className="i" aria-hidden="true">→</span>
          </a>
          <a className="btn btn-sheet" href="#examples">
            Featured examples
          </a>
        </div>
        <p className="sky-fine reveal" style={{ "--d": "0.8s" } as CSSProperties}>
          The composer is not connected yet. Nothing on this page is a live Qloo result.
        </p>
      </div>
    </header>
  );
}
