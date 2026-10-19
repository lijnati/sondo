import Link from "next/link";

import type { AgentRunResult, ValidatedClaim, ValidatedConcept } from "@/lib/agent/schemas";
import { AGE_LABEL, categoryLabel, OBJECTIVE_LABEL } from "@/lib/brief/labels";
import { citationIndex, claimBadge, ideaBadge, ledgerStats, statusInfo, type Badge } from "@/lib/report/view";
import type { StoredRunStatus } from "@/lib/runs/events";
import { publicText } from "@/lib/runs/redact";

import { EvChip, EvidenceProvider, type EvidenceView } from "./evidence";
import { ShareButton } from "./share-button";

const ANGLE_LABEL: Record<ValidatedConcept["angle"], string> = {
  mainstream_anchor: "Mainstream anchor",
  distinctive_niche: "Distinctive niche",
  cross_category_bridge: "Cross-category bridge",
};
const ANGLE_TINT: Record<ValidatedConcept["angle"], string> = { mainstream_anchor: "mint", distinctive_niche: "cream", cross_category_bridge: "ice" };

const round = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 1000) / 1000);
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

function evidenceViews(r: AgentRunResult): EvidenceView[] {
  const cited = citationIndex(r);
  return r.evidence.map((e) => ({
    id: e.id,
    name: e.entity.name,
    category: categoryLabel(e.query.filterType),
    kind: e.entity.kind,
    rank: e.rank,
    of: e.of,
    ...(e.affinity !== undefined ? { affinity: round(e.affinity) } : {}),
    ...(e.popularity !== undefined ? { popularity: round(e.popularity) } : {}),
    ...(e.derived?.lift !== undefined ? { lift: e.derived.lift } : {}),
    ...(e.derived?.newInTarget ? { newInTarget: true } : {}),
    ...(e.derived?.quadrant ? { quadrant: e.derived.quadrant } : {}),
    variant: e.query.variant,
    signalSummary: e.query.signalSummary,
    tags: e.entity.tags.slice(0, 6).map((t) => t.name),
    citedIn: cited.get(e.id) ?? [],
  }));
}

function SupportTag({ badge }: { badge: Badge }) {
  return (
    <span className={`support support-${badge.kind}`} title={badge.title}>
      {badge.label}
    </span>
  );
}

function ClaimItem({ claim }: { claim: ValidatedClaim }) {
  const badge = claimBadge(claim);
  return (
    <div>
      <p className="claim">{claim.text}</p>
      <div className="claim-meta">
        <SupportTag badge={badge} />
        {claim.evidenceIds.map((id) => (
          <EvChip key={id} id={id} />
        ))}
      </div>
    </div>
  );
}

function ConceptCard({ c }: { c: ValidatedConcept }) {
  return (
    <article className={`concept ${ANGLE_TINT[c.angle]}`} aria-labelledby={`concept-${c.angle}`}>
      <div>
        <p className="eyebrow">{ANGLE_LABEL[c.angle]}</p>
        <h3 id={`concept-${c.angle}`}>{c.name}</h3>
        <p className="lede" style={{ marginTop: 8, fontSize: 14.5 }}>
          {c.positioning}
        </p>
      </div>
      <div className="concept-section">
        <p className="label">Cultural insight</p>
        <ClaimItem claim={c.culturalInsight} />
      </div>
      <div className="concept-section">
        <p className="label">The concept</p>
        <p className="claim">{c.concept}</p>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          For: {c.intendedAudience}
        </p>
      </div>
      {c.opportunities.length ? (
        <div className="concept-section">
          <p className="label">Opportunities</p>
          <ul>
            {c.opportunities.map((o, i) => (
              <li key={i}>
                <p className="claim">
                  <b style={{ fontWeight: 600, textTransform: "capitalize" }}>{o.kind}:</b> {o.idea}
                </p>
                <div className="claim-meta">
                  <SupportTag badge={ideaBadge(o.support)} />
                  {o.evidenceIds.map((id) => (
                    <EvChip key={id} id={id} showName />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="concept-section">
        <p className="label">Claims</p>
        <ul>
          {c.claims.map((cl, i) => (
            <li key={i}>
              <ClaimItem claim={cl} />
            </li>
          ))}
        </ul>
      </div>
      <div className="concept-section">
        <p className="label">Channels</p>
        <div className="chips">
          {c.channels.map((ch) => (
            <span key={ch} className="pill">
              {ch}
            </span>
          ))}
        </div>
      </div>
      <div className="concept-section">
        <p className="label">Assumptions to test</p>
        <ul>
          {c.assumptions.map((a, i) => (
            <li key={i} className="claim">
              {a}
            </li>
          ))}
        </ul>
      </div>
      <div className="concept-section">
        <p className="label">Risks</p>
        <ul>
          {c.risks.map((a, i) => (
            <li key={i} className="claim">
              {a}
            </li>
          ))}
        </ul>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>
        {c.grounding === "grounded"
          ? `Grounded: cites relevant evidence across ${c.citedCategories.map(categoryLabel).join(", ")}.`
          : c.grounding === "partial"
            ? "Partly grounded: fewer relevant citations or categories than Sondo requires. Treat as exploratory."
            : "Insufficient evidence: shown for transparency, not as a recommendation."}
      </p>
    </article>
  );
}

export function ReportView({
  report: r,
  status,
  failureCode,
  createdAt,
  featured,
}: {
  report: AgentRunResult;
  status: StoredRunStatus;
  failureCode: string | null;
  createdAt: string;
  featured: boolean;
}) {
  const info = statusInfo(status, failureCode);
  const stats = ledgerStats(r);
  const plan = r.plan;
  const notFound = r.limitations.find((l) => l.startsWith("Not found in Qloo:"));
  const v = r.validation;
  const warnings = [...new Set(r.warnings.map((w) => publicText(w)))];

  return (
    <EvidenceProvider items={evidenceViews(r)}>
      <div className="m-container">
        <header className="report-head">
          <p className="eyebrow">
            {featured ? "Featured report" : "Cultural intelligence report"} · {r.runId}
          </p>
          <h1 className="report-title">{r.brief.brandName}</h1>
          <div className="report-meta">
            <span className={`status status-${status}`}>{info.label}</span>
            <span className="pill">{r.brief.market}</span>
            <span className="pill">{OBJECTIVE_LABEL[r.brief.objective]}</span>
            <span className="pill">{date(createdAt)}</span>
          </div>
          <p className="lede" style={{ marginTop: 16 }}>
            Grounded in <b className="tabular">{stats.results}</b> Qloo results across {stats.categories.length} categor{stats.categories.length === 1 ? "y" : "ies"}
            {stats.categories.length ? ` (${stats.categories.join(", ")})` : ""}.
          </p>
          <div className="form-actions" style={{ marginTop: 16 }}>
            <ShareButton path={`/r/${r.runId}`} />
            <Link href="/new" className="btn btn-sm btn-outline">
              New brief
            </Link>
          </div>
        </header>

        {info.headline || notFound ? (
          <div className="stack" style={{ marginBottom: 8 }}>
            {info.headline ? (
              <div className={`notice ${info.tone}`} role="status">
                <div className="stack-sm">
                  <p>
                    <strong>{info.label}.</strong> {info.headline}
                  </p>
                  {warnings.length ? (
                    <ul style={{ paddingLeft: 18 }}>
                      {warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            ) : null}
            {notFound ? (
              <div className="notice warn">
                <p>
                  <strong>{notFound}</strong> Sondo never invents a match; the research relies on the anchors and market that did resolve.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <section className="section two-col" aria-label="Brief and audience">
          <div className="sheet">
            <p className="eyebrow">The brief</p>
            <p className="claim">{r.brief.brandDescription}</p>
            <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>
              Audience: {r.brief.audience.description}
            </p>
            {r.brief.anchors.length ? (
              <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
                Anchors: {r.brief.anchors.map((a) => a.name).join(", ")}
              </p>
            ) : null}
          </div>
          <div className="sheet">
            <p className="eyebrow">What Qloo modeled</p>
            <div className="chips">
              <span className="pill">Locality: {plan?.location ?? r.brief.market}</span>
              {(plan?.ages ?? r.brief.audience.ages ?? []).map((a) => (
                <span key={a} className="pill">
                  Age {AGE_LABEL[a]}
                </span>
              ))}
              {plan?.gender ? <span className="pill">Gender: {plan.gender}</span> : null}
              {plan?.categories.map((c) => (
                <span key={c} className="pill">
                  {categoryLabel(c)}
                </span>
              ))}
            </div>
            {plan?.notModeled.length ? (
              <>
                <p className="eyebrow" style={{ marginTop: 16 }}>
                  Not modeled
                </p>
                <div className="chips">
                  {plan.notModeled.map((n) => (
                    <span key={n} className="pill muted-pill">
                      {n}
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </section>

        <section className="section" aria-labelledby="concepts-title" style={{ paddingTop: 8 }}>
          <div className="section-head">
            <h2 id="concepts-title" className="h2">
              Three <em>concepts</em>
            </h2>
            <p className="muted" style={{ maxWidth: "52ch", fontSize: 14 }}>
              Each claim is labelled: <SupportTag badge={claimBadge({ kind: "evidence", support: "direct" })} /> names its Qloo result, <SupportTag badge={claimBadge({ kind: "evidence", support: "contextual" })} /> names its tag or category, <SupportTag badge={claimBadge({ kind: "hypothesis", support: "weak" })} /> is a strategic bet to test.
            </p>
          </div>
          {r.concepts.length ? (
            <div className="report-grid">
              {r.concepts.map((c) => (
                <ConceptCard key={c.angle} c={c} />
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <p className="mono">No concepts in this report</p>
              <p className="muted" style={{ marginTop: 10 }}>
                Sondo didn&apos;t have enough validated evidence to write concepts, so it returned the research only. It does not pad a report with unsupported ideas.
              </p>
            </div>
          )}
        </section>

        {r.opportunities.length ? (
          <section className="section" aria-labelledby="opps-title" style={{ paddingTop: 0 }}>
            <h2 id="opps-title" className="h3" style={{ marginBottom: 14 }}>
              Cultural opportunities
            </h2>
            <div className="two-col">
              {r.opportunities.map((o) => (
                <div key={o.title} className="sheet stack-sm">
                  <p style={{ fontWeight: 600 }}>{o.title}</p>
                  <ClaimItem claim={o.rationale} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {r.findings.length ? (
          <section className="section" aria-labelledby="findings-title" style={{ paddingTop: 0 }}>
            <h2 id="findings-title" className="h3" style={{ marginBottom: 6 }}>
              What the research found
            </h2>
            <p className="muted" style={{ fontSize: 14, marginBottom: 14 }}>
              Written by code from the evidence ledger, not by the model.
            </p>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Finding</th>
                    <th scope="col">Strength</th>
                    <th scope="col">Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {r.findings.map((f) => (
                    <tr key={f.id}>
                      <td>{f.statement}</td>
                      <td>{f.strength}</td>
                      <td>
                        <div className="chips">
                          {f.evidenceIds.slice(0, 6).map((id) => (
                            <EvChip key={id} id={id} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="section" aria-labelledby="evidence-title" style={{ paddingTop: 0 }}>
          <details className="disclosure">
            <summary id="evidence-title" className="h3">
              Evidence ledger ({r.evidence.length})
            </summary>
            <p className="muted" style={{ fontSize: 14, margin: "8px 0 14px" }}>
              Every Qloo result Sondo collected. Rank is within its own query. Lift and distinctiveness are Sondo heuristics.
            </p>
            <div className="table-wrap">
              <table className="data">
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
                <tbody>
                  {r.evidence.map((e) => (
                    <tr key={e.id}>
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
                      <td>{e.query.variant}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        <section className="section two-col" aria-label="Validation and limitations" style={{ paddingTop: 0 }}>
          <div className="sheet">
            <p className="eyebrow">Validation</p>
            <ul className="bars">
              <li>
                <span>Claims checked</span>
                <span className="tabular">{v.claimsChecked}</span>
              </li>
              <li>
                <span>Downgraded to hypothesis</span>
                <span className="tabular">{v.downgradedToHypothesis}</span>
              </li>
              <li>
                <span>Unrelated citations removed</span>
                <span className="tabular">{v.mismatchedCitations}</span>
              </li>
              <li>
                <span>Unsupported claims removed</span>
                <span className="tabular">{v.removed}</span>
              </li>
              <li>
                <span>Citations auto-attached (entity named in text)</span>
                <span className="tabular">{v.citationsAutoAttached}</span>
              </li>
              <li>
                <span>Repair pass</span>
                <span>{v.repairAttempted ? "Ran" : "Not needed"}</span>
              </li>
            </ul>
          </div>
          <div className="sheet">
            <p className="eyebrow">What this is, and isn&apos;t</p>
            <ul className="stack-sm" style={{ paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
              {r.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="section" aria-label="Run details" style={{ paddingTop: 0 }}>
          <details className="sheet disclosure">
            <summary>Run details and Qloo trace ({r.trace.length} calls)</summary>
            <ul className="bars" style={{ marginTop: 12 }}>
              <li>
                <span>Qloo queries</span>
                <span className="tabular">
                  {r.usage.qloo.calls} of {r.usage.qloo.budget}
                  {r.usage.qloo.cached ? ` · ${r.usage.qloo.cached} from cache` : ""}
                </span>
              </li>
              <li>
                <span>Model calls</span>
                <span className="tabular">{r.usage.llm.calls}</span>
              </li>
              <li>
                <span>Duration</span>
                <span className="tabular">{Math.round(r.usage.durationMs / 1000)} s</span>
              </li>
              <li>
                <span>Model</span>
                <span style={{ overflowWrap: "anywhere" }}>{r.model}</span>
              </li>
            </ul>
            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Endpoint</th>
                    <th scope="col">Type</th>
                    <th scope="col">Status</th>
                    <th scope="col">Results</th>
                    <th scope="col">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {r.trace.map((t) => (
                    <tr key={t.callId}>
                      <td className="num-cell">GET {t.path}</td>
                      <td>{t.params["filter.type"] ? categoryLabel(t.params["filter.type"]) : "—"}</td>
                      <td className="num-cell">
                        {String(t.status)}
                        {t.cached ? " · cached" : ""}
                        {t.retry ? ` · retry ${t.retry}` : ""}
                      </td>
                      <td className="num-cell">{t.resultCount}</td>
                      <td className="num-cell">{t.latencyMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      </div>
    </EvidenceProvider>
  );
}
