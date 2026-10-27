import Link from "next/link";

import { PixelScene } from "@/components/marketing/pixel-scene";
import { ANGLES, type AgentRunResult, type ValidatedClaim, type ValidatedConcept } from "@/lib/agent/schemas";
import { AGE_LABEL, categoryLabel, OBJECTIVE_LABEL, readableSignals } from "@/lib/brief/labels";
import {
  citationIndex,
  claimBadge,
  distinctivenessPoints,
  findingsByStrength,
  ideaBadge,
  keyFindings,
  ledgerStats,
  liftRows,
  statusInfo,
  type Badge,
} from "@/lib/report/view";
import type { StoredRunStatus } from "@/lib/runs/events";
import { publicText } from "@/lib/runs/redact";

import type { StoredContrast } from "@/lib/contrast/contrast";
import { DistinctChart, LiftChart } from "./charts";
import { ConceptTabs } from "./concept-tabs";
import { ContrastSection } from "./contrast";
import { EvChip, EvidenceProvider, type EvidenceView } from "./evidence";
import { Ledger } from "./ledger";
import { ShareButton } from "./share-button";

type Angle = ValidatedConcept["angle"];

const ANGLE_LABEL: Record<Angle, string> = {
  mainstream_anchor: "Mainstream anchor",
  distinctive_niche: "Distinctive niche",
  cross_category_bridge: "Cross-category bridge",
};
const ANGLE_TINT: Record<Angle, string> = { mainstream_anchor: "mint", distinctive_niche: "cream", cross_category_bridge: "ice" };
/** What each angle is for. Product copy, the same in every report. */
const ANGLE_ROLE: Record<Angle, string> = {
  mainstream_anchor: "Leads with what this audience already loves at scale, so the idea is easy to recognise.",
  distinctive_niche: "Leads with signals that rank well for this audience without being mainstream, where fewer brands compete.",
  cross_category_bridge: "Joins affinities from different categories into one idea, so the partnership is harder to copy.",
};
const OPP_KIND: Record<string, string> = { partnership: "Partnership", creative: "Creative", placement: "Placement", event: "Event" };
const STRENGTH: Record<string, string> = { strong: "Strong signal", moderate: "Moderate signal", weak: "Weak signal" };

const round = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 1000) / 1000);
const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
/** A stable scene seed per report, so each cover is its own meadow. */
const seedOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7);

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
    signalSummary: readableSignals(e.query.signalSummary),
    tags: e.entity.tags.slice(0, 6).map((t) => t.name),
    citedIn: cited.get(e.id) ?? [],
  }));
}

function Tier({ badge }: { badge: Badge }) {
  return (
    <span className={`support support-${badge.kind}`} title={badge.title}>
      {badge.label}
    </span>
  );
}

/** A claim, styled by its support tier so a creative bet never reads as a Qloo finding. */
function ClaimCard({ claim, lead = false }: { claim: ValidatedClaim; lead?: boolean }) {
  const badge = claimBadge(claim);
  return (
    <div className={`claim-card tier-${badge.kind}${lead ? " lead" : ""}`}>
      <p className="claim">{claim.text}</p>
      <div className="claim-meta">
        <Tier badge={badge} />
        {claim.evidenceIds.map((id) => (
          <EvChip key={id} id={id} showName />
        ))}
      </div>
    </div>
  );
}

function TierLegend() {
  return (
    <ul className="tier-legend" aria-label="How to read the labels">
      <li>
        <Tier badge={claimBadge({ kind: "evidence", support: "direct" })} /> names the Qloo result it cites
      </li>
      <li>
        <Tier badge={claimBadge({ kind: "evidence", support: "contextual" })} /> names a tag or category of it
      </li>
      <li>
        <Tier badge={claimBadge({ kind: "hypothesis", support: "weak" })} /> a strategic bet to test, not a finding
      </li>
    </ul>
  );
}

function ConceptArticle({ c }: { c: ValidatedConcept }) {
  return (
    <article className={`concept-article tint-${ANGLE_TINT[c.angle]}`} aria-labelledby={`name-${c.angle}`}>
      <header className="concept-head">
        <p className="eyebrow">{ANGLE_LABEL[c.angle]}</p>
        <h3 id={`name-${c.angle}`} className="concept-name">
          {c.name}
        </h3>
        <p className="concept-positioning">{c.positioning}</p>
        <p className={`grounding grounding-${c.grounding}`}>
          {c.grounding === "grounded"
            ? `Grounded · cites relevant evidence across ${c.citedCategories.map(categoryLabel).join(", ")}`
            : c.grounding === "partial"
              ? "Partly grounded · fewer relevant citations or categories than Sondo requires. Treat as exploratory."
              : "Insufficient evidence · shown for transparency, not as a recommendation"}
        </p>
      </header>

      <div className="concept-body">
        <div className="concept-main">
          <section>
            <h4 className="concept-label">The idea</h4>
            <p className="concept-text">{c.concept}</p>
            <p className="concept-for">
              <span className="concept-label">Who it&apos;s for</span> {c.intendedAudience}
            </p>
          </section>
          <section>
            <h4 className="concept-label">Where it shows up</h4>
            <ul className="opps">
              {c.opportunities.map((o, i) => {
                const badge = ideaBadge(o.support);
                return (
                  <li key={i} className={`opp tier-${badge.kind}`}>
                    <p>
                      <b>{OPP_KIND[o.kind] ?? o.kind}.</b> {o.idea}
                    </p>
                    <div className="claim-meta">
                      <Tier badge={badge} />
                      {o.evidenceIds.map((id) => (
                        <EvChip key={id} id={id} showName />
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="chips" style={{ marginTop: 14 }} aria-label="Channels">
              {c.channels.map((ch) => (
                <span key={ch} className="pill">
                  {ch}
                </span>
              ))}
            </div>
          </section>
        </div>

        <aside className="evidence-rail" aria-label={`Why ${c.name} could work`}>
          <h4 className="concept-label">Why it could work</h4>
          <ClaimCard claim={c.culturalInsight} lead />
          {c.claims.map((cl, i) => (
            <ClaimCard key={i} claim={cl} />
          ))}
        </aside>
      </div>

      <div className="concept-foot">
        <section>
          <h4 className="concept-label">How it differs</h4>
          <p>{ANGLE_ROLE[c.angle]}</p>
          {c.citedCategories.length ? (
            <div className="chips" style={{ marginTop: 10 }} aria-label="Categories it draws on">
              {c.citedCategories.map((k) => (
                <span key={k} className="pill">
                  {categoryLabel(k)}
                </span>
              ))}
            </div>
          ) : null}
        </section>
        <section>
          <h4 className="concept-label">What&apos;s uncertain</h4>
          <ul className="uncertain">
            {c.assumptions.map((a, i) => (
              <li key={`a${i}`}>
                <span className="uncertain-kind">Assumption to test</span>
                {a}
              </li>
            ))}
            {c.risks.map((a, i) => (
              <li key={`r${i}`}>
                <span className="uncertain-kind">Risk</span>
                {a}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </article>
  );
}

function MissingConcept({ angle }: { angle: Angle }) {
  return (
    <div className="empty-card ruled">
      <p className="eyebrow">{ANGLE_LABEL[angle]}</p>
      <p className="h3">Not written</p>
      <p className="muted" style={{ marginTop: 8, maxWidth: "56ch" }}>
        Sondo didn&apos;t have enough validated evidence for this angle, so it left it out rather than pad the report with an unsupported idea.
      </p>
    </div>
  );
}

const SECTIONS = [
  ["overview", "Overview"],
  ["contrast", "Without Qloo"],
  ["concepts", "Concepts"],
  ["signals", "Signals"],
  ["findings", "Findings"],
  ["evidence", "Evidence"],
  ["method", "Method"],
] as const;

export function ReportView({
  report: r,
  status,
  failureCode,
  createdAt,
  featured,
  contrast = null,
}: {
  report: AgentRunResult;
  contrast?: StoredContrast | null;
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
  const headline = keyFindings(r.findings);
  const lift = liftRows(r.evidence);
  const points = distinctivenessPoints(r.evidence);
  const groups = findingsByStrength(r.findings);
  const byAngle = new Map(r.concepts.map((c) => [c.angle, c]));
  const hasSignals = lift.length >= 3 || points.length >= 6;

  return (
    <EvidenceProvider items={evidenceViews(r)}>
      <header className="report-cover">
        <PixelScene preset="meadow" seed={seedOf(r.runId)} shade="cover" clearCenter={false} />
        <div className="cover-copy">
          <p className="cover-eyebrow">{featured ? "Featured report" : "Cultural intelligence report"}</p>
          <h1 className="report-title">{r.brief.brandName}</h1>
          <p className="cover-sub">
            {r.brief.market} · {OBJECTIVE_LABEL[r.brief.objective]} · {date(createdAt)}
          </p>
        </div>
      </header>

      <div className="m-container">
        <div className="report-meta">
          <div className="report-meta-l">
            <span className={`status status-${status}`}>{info.label}</span>
            <p className="report-grounding">
              Grounded in <b className="tabular">{stats.results}</b> Qloo results across <b className="tabular">{stats.categories.length}</b> categor{stats.categories.length === 1 ? "y" : "ies"}
              <span className="muted"> · {stats.categories.join(", ")}</span>
            </p>
          </div>
          <div className="report-actions">
            <Link href={`/r/${r.runId}/replay`} className="btn btn-sm btn-butter">
              Watch the research <span className="i" aria-hidden="true">▶</span>
            </Link>
            <ShareButton path={`/r/${r.runId}`} />
            <Link href="/new" className="btn btn-sm btn-outline">
              New brief
            </Link>
          </div>
        </div>

        <nav className="report-nav" aria-label="Report sections">
          {SECTIONS.filter(([id]) => (id !== "signals" || hasSignals) && (id !== "contrast" || contrast)).map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
          <span className="report-nav-id mono" aria-label={`Run ${r.runId}`}>
            {r.runId}
          </span>
        </nav>

        {info.headline || notFound ? (
          <div className="stack report-notices">
            {info.headline ? (
              <div className={`notice ${info.tone}`} role="status">
                <div className="stack-sm">
                  <p>
                    <strong>{info.label}.</strong> {info.headline}
                  </p>
                  {warnings.length ? (
                    <ul className="notice-list">
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

        {/* ── Overview ── */}
        <section id="overview" className="r-section" aria-labelledby="overview-title">
          <div className="r-head">
            <h2 id="overview-title" className="h2">
              What the research <em>found</em>
            </h2>
            <p className="muted">Written by code from the evidence ledger, not by the model. Each line links to the Qloo results behind it.</p>
          </div>
          {headline.length ? (
            <ol className="key-findings">
              {headline.map((f, i) => (
                <li key={f.id}>
                  <span className="kf-num tabular" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="kf-text">{f.statement}</p>
                    <div className="claim-meta">
                      <span className={`strength strength-${f.strength}`}>{STRENGTH[f.strength]}</span>
                      {f.evidenceIds.slice(0, 4).map((id) => (
                        <EvChip key={id} id={id} showName />
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-card ruled">
              <p className="muted">No strong or moderate signal stood out in this run. The full ledger is below.</p>
            </div>
          )}

          <div className="overview-grid">
            <div className="sheet">
              <p className="eyebrow">The brief</p>
              <p className="brief-text">{r.brief.brandDescription}</p>
              <dl className="brief-dl">
                <dt>Audience</dt>
                <dd>{r.brief.audience.description}</dd>
                {r.brief.anchors.length ? (
                  <>
                    <dt>Anchors</dt>
                    <dd>{r.brief.anchors.map((a) => a.name).join(", ")}</dd>
                  </>
                ) : null}
              </dl>
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
              </div>
              {plan?.categories.length ? (
                <>
                  <p className="eyebrow" style={{ marginTop: 16 }}>
                    Categories researched
                  </p>
                  <div className="chips">
                    {plan.categories.map((c) => (
                      <span key={c} className="pill">
                        {categoryLabel(c)}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
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
          </div>

          {r.opportunities.length ? (
            <div className="opps-wide">
              <p className="eyebrow">Opportunities in the data</p>
              <div className="opps-grid">
                {r.opportunities.map((o) => (
                  <div key={o.title} className="sheet">
                    <p className="opp-title">{o.title}</p>
                    <ClaimCard claim={o.rationale} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        {contrast ? <ContrastSection contrast={contrast} /> : null}

        {/* ── Concepts ── */}
        <section id="concepts" className="r-section" aria-labelledby="concepts-title">
          <div className="r-head">
            <h2 id="concepts-title" className="h2">
              Three <em>concepts</em>
            </h2>
            <TierLegend />
          </div>
          {r.concepts.length ? (
            <ConceptTabs
              tabs={ANGLES.map((a) => {
                const c = byAngle.get(a);
                return { key: a, kicker: ANGLE_LABEL[a], name: c?.name ?? "Not written", panel: c ? <ConceptArticle c={c} /> : <MissingConcept angle={a} /> };
              })}
            />
          ) : (
            <div className="empty-card ruled">
              <p className="h3">No concepts in this report</p>
              <p className="muted" style={{ marginTop: 10, maxWidth: "60ch" }}>
                Sondo didn&apos;t have enough validated evidence to write concepts, so it returned the research only. It does not pad a report with unsupported ideas.
              </p>
            </div>
          )}
        </section>

        {/* ── Signals ── */}
        {hasSignals ? (
          <section id="signals" className="r-section" aria-labelledby="signals-title">
            <div className="r-head">
              <h2 id="signals-title" className="h2">
                Signals, <em>charted</em>
              </h2>
              <p className="muted">Both charts read ranks and popularity straight from the ledger. Lift and the quadrants are Sondo heuristics, not Qloo scores.</p>
            </div>
            <div className="charts">
              {lift.length >= 3 ? <LiftChart rows={lift} /> : null}
              {points.length >= 6 ? <DistinctChart points={points} /> : null}
            </div>
          </section>
        ) : null}

        {/* ── Findings ── */}
        {groups.length ? (
          <section id="findings" className="r-section" aria-labelledby="findings-title">
            <div className="r-head">
              <h2 id="findings-title" className="h2">
                Every <em>finding</em>
              </h2>
              <p className="muted">
                <span className="tabular">{r.findings.length}</span> findings written by code from the ledger, grouped by strength. Open a group to read it.
              </p>
            </div>
            <div className="finding-groups">
              {groups.map((g, gi) => (
                <details key={g.strength} className="finding-group" open={gi === 0 || undefined}>
                  <summary>
                    <span className={`strength strength-${g.strength}`}>{STRENGTH[g.strength]}</span>
                    <span className="muted tabular">{g.items.length}</span>
                  </summary>
                  <ul>
                    {g.items.map((f) => (
                      <li key={f.id}>
                        <p>{f.statement}</p>
                        <div className="claim-meta">
                          {f.evidenceIds.slice(0, 6).map((id) => (
                            <EvChip key={id} id={id} />
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {/* ── Evidence ── */}
        <section id="evidence" className="r-section" aria-labelledby="evidence-title">
          <div className="r-head">
            <h2 id="evidence-title" className="h2">
              The evidence <em>ledger</em>
            </h2>
            <p className="muted">Every Qloo result Sondo collected. Rank is within its own query. Lift is a Sondo heuristic. Select an id to inspect it.</p>
          </div>
          <Ledger evidence={r.evidence} />
        </section>

        {/* ── Method ── */}
        <section id="method" className="r-section" aria-labelledby="method-title">
          <div className="r-head">
            <h2 id="method-title" className="h2">
              How this was <em>checked</em>
            </h2>
          </div>
          <div className="overview-grid">
            <div className="sheet">
              <p className="eyebrow">Claim validation</p>
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
                  <span>Citations attached because the text names the result</span>
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
              <ul className="limits">
                {r.limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </div>
          </div>
          <details className="sheet disclosure run-details">
            <summary>
              Run details and Qloo trace (<span className="tabular">{r.trace.length}</span> calls)
            </summary>
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
