import type { CSSProperties } from "react";
import Link from "next/link";

import { PixelScene, type SceneCritter } from "@/components/marketing/pixel-scene";

const duskCritters: readonly SceneCritter[] = [
  { kind: "butterfly", motion: "sway", right: "10%", top: "18%", scale: 4 },
];

export function BriefClose() {
  return (
    <section className="final" aria-labelledby="close-title">
      <PixelScene
        preset="dusk"
        seed={31}
        shade="dusk"
        pollen
        pollenMax={16}
        pollenColor="255,233,163"
        critters={duskCritters}
      />
      <div className="final-copy">
        <h2 id="close-title" className="reveal">
          A real brief. Then cited <em>strategies</em>.
        </h2>
        <p className="reveal" style={{ "--d": "0.1s" } as CSSProperties}>
          Each run uses at most 24 Qloo queries and four model calls, and stops within three minutes.
        </p>
        <div className="sky-actions reveal" style={{ "--d": "0.2s" } as CSSProperties}>
          <a className="btn btn-butter" href="#composer">
            Write your brief <span className="i" aria-hidden="true">→</span>
          </a>
          <Link href="/" className="btn btn-sheet">
            Back to Sondo
          </Link>
        </div>
      </div>
    </section>
  );
}
