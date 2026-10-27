import { categoryLabel } from "@/lib/brief/labels";
import type { StoredContrast } from "@/lib/contrast/contrast";

import { EvChip } from "./evidence";

const CATEGORY: Record<string, string> = {
  artist: "Music artists",
  tv_show: "TV",
  movie: "Film",
  podcast: "Podcasts",
  book: "Books",
  brand: "Brands",
  place: "Places",
};

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * "Without Qloo": what a plain model suggested from the brief alone, next to the partners
 * Sondo's concepts cite. The model wrote only names and categories; every match and count
 * here is computed by code against this report's ledger (lib/contrast/contrast.ts).
 */
export function ContrastSection({ contrast: c }: { contrast: StoredContrast }) {
  const suggestions = c.plain.filter((p) => !p.fromBrief);
  const echoes = c.plain.filter((p) => p.fromBrief);
  const inLedger = suggestions.filter((p) => p.evidenceId);

  return (
    <section id="contrast" className="r-section" aria-labelledby="contrast-title">
      <div className="r-head">
        <h2 id="contrast-title" className="h2">
          Without Qloo, <em>by contrast</em>
        </h2>
        <p className="muted">
          The same brief, given to a plain language model with no data access. Of its <b className="tabular">{suggestions.length}</b> suggestions,{" "}
          <b className="tabular">{inLedger.length}</b> {inLedger.length === 1 ? "appears" : "appear"} among the Qloo results Sondo collected for this audience.
        </p>
      </div>

      <div className="contrast-grid">
        <div className="sheet contrast-plain">
          <p className="eyebrow">A plain LLM · brief only</p>
          <ul className="contrast-list">
            {suggestions.map((p) => (
              <li key={p.name}>
                <span className="contrast-name">{p.name}</span>
                <span className="contrast-cat">{CATEGORY[p.category] ?? p.category}</span>
                {p.evidenceId ? <EvChip id={p.evidenceId} /> : <span className="contrast-tag">Not surfaced for this audience</span>}
              </li>
            ))}
          </ul>
          {echoes.length ? (
            <p className="muted contrast-note">
              It also repeated {echoes.length === 1 ? "one of your anchors" : `${echoes.length} of your anchors`}: {echoes.map((p) => p.name).join(", ")}.
            </p>
          ) : null}
        </div>

        <div className="sheet contrast-sondo">
          <p className="eyebrow">Found only with Qloo · cited in the concepts</p>
          {c.sondoOnly.length ? (
            <ul className="contrast-list">
              {c.sondoOnly.map((s) => (
                <li key={s.evidenceId}>
                  <span className="contrast-name">{s.name}</span>
                  <span className="contrast-cat">{categoryLabel(s.category)}</span>
                  <EvChip id={s.evidenceId} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Every partner the concepts cite was also named by the plain model.</p>
          )}
        </div>
      </div>

      <p className="muted contrast-foot">
        Generated once by {c.model} from this brief alone on {day(c.generatedAt)}; names only. Matching is by exact name against this report&apos;s ledger, done by code. A pick that wasn&apos;t surfaced isn&apos;t
        necessarily wrong: Qloo just didn&apos;t rank it for this audience and market in this run.
      </p>
    </section>
  );
}
