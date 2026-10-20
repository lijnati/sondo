import { DISTINCTIVE_POPULARITY_MAX } from "@/lib/evidence/lift";
import { QUADRANT_LABEL, type DistinctPoint, type LiftRow } from "@/lib/report/view";

import { EvChip } from "./evidence";

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Audience lift (DESIGN.md §4.5): for the top movers, where each item sits in the
 * market-baseline query (hollow) and in the audience query (filled). Positions are
 * ranks read from the ledger; lift is a Sondo heuristic and labelled as such.
 */
export function LiftChart({ rows }: { rows: LiftRow[] }) {
  const max = Math.max(...rows.map((r) => r.of)) + 1;
  const x = (rank: number) => `${((rank - 1) / (max - 1)) * 100}%`;
  return (
    <figure className="chart" aria-labelledby="lift-cap">
      <figcaption id="lift-cap" className="chart-cap">
        <span className="chart-title">What rises for this audience</span>
        <span className="muted">Rank in the market baseline → rank in the audience query. Further left is a higher rank. Sondo heuristic.</span>
      </figcaption>
      <div className="chart-legend" aria-hidden="true">
        <span>
          <i className="dot-base" /> Baseline rank
        </span>
        <span>
          <i className="dot-target" /> Audience rank
        </span>
        <span>
          <i className="dot-new" /> Not in the baseline
        </span>
      </div>
      <ol className="lift-rows">
        {rows.map((r) => (
          <li key={r.id}>
            <span className="lift-name">
              <span>{r.name}</span>
              <span className="muted">{r.category}</span>
            </span>
            <span className="lift-track" aria-hidden="true">
              {r.baselineRank !== undefined ? (
                <>
                  <span className="lift-line" style={{ left: x(r.targetRank), right: `calc(100% - ${x(r.baselineRank)})` }} />
                  <span className="lift-dot base" style={{ left: x(r.baselineRank) }} />
                </>
              ) : (
                <span className="lift-dot new" style={{ left: "100%" }} />
              )}
              <span className="lift-dot target" style={{ left: x(r.targetRank) }} />
            </span>
            <span className="lift-delta tabular">{r.newInTarget ? "new" : `▲${r.lift}`}</span>
            <span className="sr-only">
              {r.newInTarget ? `rank ${r.targetRank} for this audience, not in the baseline list` : `rank ${r.targetRank} for this audience, rank ${r.baselineRank} in the baseline`}
            </span>
          </li>
        ))}
      </ol>
      <details className="chart-table disclosure">
        <summary>Show as a table</summary>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Evidence</th>
                <th scope="col">Name</th>
                <th scope="col">Category</th>
                <th scope="col">Audience rank</th>
                <th scope="col">Baseline rank</th>
                <th scope="col">Lift (heuristic)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <EvChip id={r.id} />
                  </td>
                  <td>{r.name}</td>
                  <td>{r.category}</td>
                  <td className="num-cell">
                    {r.targetRank} / {r.of}
                  </td>
                  <td className="num-cell">{r.baselineRank ?? "not listed"}</td>
                  <td className="num-cell">{r.newInTarget ? "new" : `▲${r.lift}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

const W = 640;
const H = 340;
const PAD = { l: 44, r: 16, t: 16, b: 40 };

/**
 * Distinctiveness (DESIGN.md §4.5): Qloo popularity percentile against position in the
 * audience query. Quadrant lines are the Sondo heuristic's own thresholds.
 */
export function DistinctChart({ points }: { points: DistinctPoint[] }) {
  // Qloo popularity clusters near 1, so the axis is stretched toward 1: 0.9, 0.99 and
  // 0.999 sit evenly apart. Ticks show the raw percentile, and the caption says so.
  const stretch = (v: number) => -Math.log10(Math.max(1 - v, 0.001));
  const px = (v: number) => PAD.l + (stretch(v) / 3) * (W - PAD.l - PAD.r);
  const py = (pos: number) => PAD.t + pos * (H - PAD.t - PAD.b);
  const ticks = [0, 0.5, 0.9, 0.99, 0.999];
  const named = new Set(
    points
      .filter((p) => p.quadrant === "distinctive_fit")
      .sort((a, b) => a.position - b.position)
      .slice(0, 5)
      .map((p) => p.id),
  );
  const counts = points.reduce<Record<string, number>>((m, p) => ((m[p.quadrant] = (m[p.quadrant] ?? 0) + 1), m), {});

  return (
    <figure className="chart" aria-labelledby="dist-cap">
      <figcaption id="dist-cap" className="chart-cap">
        <span className="chart-title">Where the under-used levers are</span>
        <span className="muted">Qloo popularity percentile against position in the audience query. The shaded corner is a strong fit that isn&apos;t mainstream. Sondo heuristic.</span>
      </figcaption>
      <svg className="dist-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scatter of ${points.length} audience-query results by popularity and rank.`}>
        <rect x={PAD.l} y={PAD.t} width={px(DISTINCTIVE_POPULARITY_MAX) - PAD.l} height={(H - PAD.t - PAD.b) / 2} className="dist-zone" />
        <line x1={px(DISTINCTIVE_POPULARITY_MAX)} x2={px(DISTINCTIVE_POPULARITY_MAX)} y1={PAD.t} y2={H - PAD.b} className="dist-rule" />
        <line x1={PAD.l} x2={W - PAD.r} y1={py(0.5)} y2={py(0.5)} className="dist-rule" />
        <text x={PAD.l + 8} y={PAD.t + 16} className="dist-q">
          Distinctive fit
        </text>
        <text x={W - PAD.r - 8} y={PAD.t + 16} textAnchor="end" className="dist-q">
          Mainstream fit
        </text>
        <text x={PAD.l + 8} y={H - PAD.b - 8} className="dist-q">
          Long tail
        </text>
        <text x={W - PAD.r - 8} y={H - PAD.b - 8} textAnchor="end" className="dist-q">
          Weak / mainstream
        </text>
        {ticks.map((t) => (
          <text key={t} x={px(t)} y={H - PAD.b + 18} textAnchor="middle" className="dist-tick">
            {t}
          </text>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" className="dist-axis">
          Popularity percentile (Qloo), stretched toward 1 →
        </text>
        <text x={12} y={PAD.t + 4} className="dist-axis" transform={`rotate(90 12 ${PAD.t + 4})`}>
          Higher rank ↑
        </text>
        {points.map((p) => (
          <g key={p.id} className={`dist-pt q-${p.quadrant}`}>
            <circle cx={px(p.popularity)} cy={py(p.position)} r={named.has(p.id) ? 5.5 : 4} />
            <title>{`${p.id} · ${p.name} (${p.category}) · rank ${p.rank} of ${p.of} · popularity ${round3(p.popularity)} (Qloo percentile, 0–1)`}</title>
          </g>
        ))}
        {points
          .filter((p) => named.has(p.id))
          .map((p) => (
            <text key={p.id} x={px(p.popularity) + 9} y={py(p.position) + 4} className="dist-label">
              {p.name.length > 22 ? `${p.name.slice(0, 21)}…` : p.name}
            </text>
          ))}
      </svg>
      <p className="chart-counts muted">
        {(["distinctive_fit", "mainstream_fit", "long_tail", "weak_mainstream"] as const)
          .filter((q) => counts[q])
          .map((q) => `${QUADRANT_LABEL[q]}: ${counts[q]}`)
          .join(" · ")}
      </p>
      <details className="chart-table disclosure">
        <summary>Show as a table</summary>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Evidence</th>
                <th scope="col">Name</th>
                <th scope="col">Category</th>
                <th scope="col">Rank</th>
                <th scope="col">Popularity</th>
                <th scope="col">Quadrant (heuristic)</th>
              </tr>
            </thead>
            <tbody>
              {[...points]
                .sort((a, b) => a.popularity - b.popularity)
                .map((p) => (
                  <tr key={p.id}>
                    <td>
                      <EvChip id={p.id} />
                    </td>
                    <td>{p.name}</td>
                    <td>{p.category}</td>
                    <td className="num-cell">
                      {p.rank} / {p.of}
                    </td>
                    <td className="num-cell">{round3(p.popularity)}</td>
                    <td>{QUADRANT_LABEL[p.quadrant]}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
