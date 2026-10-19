"use client";

import { useEffect, useRef } from "react";

import type { PixelPreset } from "@/lib/pixel-scene/types";

const noCritters: readonly SceneCritter[] = [];

export type SceneCritter = {
  kind: "bee" | "butterfly" | "bird";
  motion: "bob" | "sway";
  left?: string;
  right?: string;
  top?: string;
  scale?: number;
};

type PixelSceneProps = {
  preset: PixelPreset;
  seed: number;
  sky?: readonly string[];
  shade?: "hero" | "dusk" | "soft";
  pollen?: boolean;
  pollenMax?: number;
  pollenColor?: string;
  critters?: readonly SceneCritter[];
  clearCenter?: boolean;
};

export function PixelScene({
  preset,
  seed,
  sky,
  shade = "hero",
  pollen = false,
  pollenMax = 32,
  pollenColor,
  critters = noCritters,
  clearCenter = true,
}: PixelSceneProps) {
  const artRef = useRef<HTMLDivElement>(null);
  const critterRef = useRef<HTMLDivElement>(null);
  const pollenRef = useRef<HTMLCanvasElement>(null);
  const skyKey = sky?.join("|") ?? "";
  const critterKey = critters
    .map((c) => `${c.kind}:${c.motion}:${c.left ?? ""}:${c.right ?? ""}:${c.top ?? ""}`)
    .join("|");

  useEffect(() => {
    const art = artRef.current;
    const critterHost = critterRef.current;
    if (!art) return;

    let cancelled = false;
    const stops: Array<() => void> = [];

    art.replaceChildren();
    critterHost?.replaceChildren();

    void import("@/lib/pixel-scene/pixel-scene.js").then(({ PixelScene: scene }) => {
      if (cancelled || !artRef.current) return;
      artRef.current.replaceChildren();
      const mounted = scene.mount(artRef.current, {
        preset,
        seed,
        sky: sky ? [...sky] : undefined,
        clearCenter,
      });
      mounted.canvas.dataset.pixelScene = preset;
      stops.push(() => mounted.destroy());

      const host = critterRef.current;
      if (host) {
        host.replaceChildren();
        for (const critter of critters) {
          const node = document.createElement("div");
          node.className = `critter ${critter.motion}`;
          if (critter.left) node.style.left = critter.left;
          if (critter.right) node.style.right = critter.right;
          if (critter.top) node.style.top = critter.top;
          scene.sprite(node, critter.kind, { scale: critter.scale ?? 4 });
          host.appendChild(node);
        }
      }

      const pollenCanvas = pollenRef.current;
      if (pollen && pollenCanvas) {
        const stop = scene.pollen(pollenCanvas, { max: pollenMax, color: pollenColor });
        if (typeof stop === "function") stops.push(stop);
      }
    });

    return () => {
      cancelled = true;
      for (const stop of stops) stop();
      art.replaceChildren();
      critterHost?.replaceChildren();
    };
  }, [preset, seed, sky, skyKey, clearCenter, pollen, pollenMax, pollenColor, critters, critterKey]);

  return (
    <div className="scene-host" data-preset={preset} data-seed={seed} aria-hidden="true">
      <div ref={artRef} className="scene-art" />
      <div className={`sky-shade shade-${shade}`} />
      <div className="grain" />
      {pollen ? <canvas ref={pollenRef} className="pollen" /> : null}
      <div ref={critterRef} className="critter-layer" />
    </div>
  );
}
