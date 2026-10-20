import type { AgentRunResult } from "@/lib/agent/schemas";
import { categoryLabel } from "@/lib/brief/labels";

import { EvChip } from "./evidence";

const FIRST = 12;
const round = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 1000) / 1000);
const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

const VARIANT: Record<string, string> = { target: "Audience", baseline: "Baseline", deepen: "Follow-up" };

/**
 * The full evidence ledger. Filtering and "show all" are plain radio and checkbox
 * inputs read by CSS `:has()`, so the table is server-rendered once and needs no script.
 */
export function Ledger({ evidence }: { evidence: AgentRunResult["evidence"] }) {
  const counts = new Map<string, { label: string; n: number }>();
  for (const e of evidence) {
    const key = slug(e.query.filterType);
    const c = counts.get(key) ?? { label: categoryLabel(e.query.filterType), n: 0 };
    c.n++;
    counts.set(key, c);
  }
  const cats = [...counts.entries()].sort((a, b) => b[1].n - a[1].n);
  const css = cats.map(([k]) => `.marketing .ledger:has(input[value="${k}"]:checked) tr[data-cat]:not([data-cat="${k}"]){display:none}`).join("\n");

  const row = (e: AgentRunResult["evidence"][number]) => (
    <tr key={e.id} data-cat={slug(e.query.filterType)}>
      <td>
        <EvChip id={e.id} />
      </td>
      <td>{e.entity.name}</td>
      <td>{categoryLabel(e.query.filterType)}</td>
      <td className="num-cell">
        {e.rank} / {e.of}
      </td>
      <td className="num-cell">{e.popularity !== undefined ? round(e.popularity) : "—"}</td>
      <td className="num-cell">{e.derived?.newInTarget ? "new" : e.derived?.lift !== undefined ? `${e.derived.lift > 0 ? "▲" : e.derived.lift < 0 ? "▼" : ""}${Math.abs(e.derived.lift)}` : "—"}</td>
      <td>{VARIANT[e.query.variant] ?? e.query.variant}</td>
    </tr>
  );

  return (
    <div className="ledger">
      <style>{css}</style>
      <fieldset className="ledger-filter">
        <legend className="sr-only">Filter the ledger by category</legend>
        <label className="filter-pill">
          <input type="radio" name="ledger-cat" value="all" defaultChecked />
          All <span className="tabular">{evidence.length}</span>
        </label>
        {cats.map(([k, c]) => (
          <label key={k} className="filter-pill">
            <input type="radio" name="ledger-cat" value={k} />
            {c.label} <span className="tabular">{c.n}</span>
          </label>
        ))}
      </fieldset>
      <div className="table-wrap">
        <table className="data">
          <caption className="sr-only">Every Qloo result Sondo collected for this report</caption>
          <thead>
            <tr>
              <th scope="col">Id</th>
              <th scope="col">Name</th>
              <th scope="col">Category</th>
              <th scope="col">Rank</th>
              <th scope="col">Popularity</th>
              <th scope="col">Lift (heuristic)</th>
              <th scope="col">Query</th>
            </tr>
          </thead>
          <tbody>{evidence.slice(0, FIRST).map(row)}</tbody>
          {evidence.length > FIRST ? <tbody className="ledger-more">{evidence.slice(FIRST).map(row)}</tbody> : null}
        </table>
      </div>
      {evidence.length > FIRST ? (
        <label className="btn btn-sm btn-outline ledger-toggle">
          <input type="checkbox" className="sr-only" />
          <span className="when-closed">Show all {evidence.length} results</span>
          <span className="when-open">Show the first {FIRST}</span>
        </label>
      ) : null}
    </div>
  );
}
