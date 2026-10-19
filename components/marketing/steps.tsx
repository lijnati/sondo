import type { CSSProperties } from "react";

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

type IsoKind = "stack" | "tray" | "grid" | "paths";

const cos30 = Math.cos(Math.PI / 6);
const sin30 = Math.sin(Math.PI / 6);

function project(x: number, y: number, z: number) {
  const scale = 13;
  return [120 + (x - y) * cos30 * scale, 96 + (x + y) * sin30 * scale - z * scale] as const;
}

function face(points: ReadonlyArray<readonly [number, number, number]>) {
  return points
    .map(([x, y, z]) => {
      const [sx, sy] = project(x, y, z);
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(" ");
}

function box(x: number, y: number, z: number, w: number, d: number, h: number) {
  return [
    face([
      [x, y + d, z],
      [x + w, y + d, z],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ]),
    face([
      [x + w, y, z],
      [x + w, y + d, z],
      [x + w, y + d, z + h],
      [x + w, y, z + h],
    ]),
    face([
      [x, y, z + h],
      [x + w, y, z + h],
      [x + w, y + d, z + h],
      [x, y + d, z + h],
    ]),
  ];
}

function polygons(kind: IsoKind) {
  if (kind === "stack") {
    return [...box(-5, -3, 0, 7, 9, 0.5), ...box(-4, -2.4, 0.9, 7, 9, 0.5), ...box(-3, -1.8, 1.8, 7, 9, 0.5)];
  }
  if (kind === "tray") {
    return [
      ...box(-5, -4, 0, 10, 8, 1.2),
      ...box(-4, -3, 1.2, 8, 6, 0.15),
      ...box(-3.6, -2.6, 1.6, 7.4, 5.4, 0.15),
      ...box(-3.2, -2.2, 2, 6.8, 4.8, 0.15),
    ];
  }
  if (kind === "grid") {
    const cells: string[] = [];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const up = (i * 7 + j * 3) % 5 === 0;
        cells.push(...box(-5 + i * 2.6, -5 + j * 2.6, up ? 0.8 : 0, 1.8, 1.8, 0.5));
      }
    }
    return cells;
  }
  return [...box(-5.2, -1, 0, 2.4, 2.4, 1.1), ...box(-1.4, -2.4, 0, 2.4, 2.4, 2.3), ...box(2.4, -3.8, 0, 2.4, 2.4, 3.5)];
}

function IsoArt({ kind }: { kind: IsoKind }) {
  return (
    <svg viewBox="0 0 240 180" fill="#fffefa" fillOpacity="0.55" stroke="#183d32" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" aria-hidden="true">
      {polygons(kind).map((points, index) => (
        <polygon key={`${kind}-${index}`} points={points} />
      ))}
    </svg>
  );
}
