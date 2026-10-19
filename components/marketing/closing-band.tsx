import type { CSSProperties } from "react";
import Link from "next/link";

import { PixelScene, type SceneCritter } from "@/components/marketing/pixel-scene";

const duskCritters: readonly SceneCritter[] = [
  { kind: "butterfly", motion: "sway", right: "10%", top: "18%", scale: 4 },
];

export function ClosingBand() {
  return (
    <section className="final" aria-labelledby="close-title">
      <PixelScene
        preset="dusk"
        seed={19}
        shade="dusk"
        pollen
        pollenMax={18}
        pollenColor="255,233,163"
        critters={duskCritters}
      />
      <div className="final-copy">
        <h2 id="close-title" className="reveal">
          Your next campaign deserves <em>evidence</em>.
        </h2>
        <p className="reveal" style={{ "--d": "0.1s" } as CSSProperties}>
          Bring a brief. Leave with citations.
        </p>
        <div className="sky-actions reveal" style={{ "--d": "0.2s" } as CSSProperties}>
          <Link href="/new" className="btn btn-butter">
            Build a cultural brief <span className="i" aria-hidden="true">→</span>
          </Link>
          <a className="btn btn-sheet" href="#how-it-works">
            How it works
          </a>
        </div>
      </div>
    </section>
  );
}
