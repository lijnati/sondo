/**
 * Deterministic claim validation (ARCHITECTURE.md §7). The model's citations are never
 * trusted: every E# is checked against the ledger, free text is scanned for invented
 * numbers and performance language, entity mentions must be cited, and concepts must be
 * grounded and differentiated. `checkStrategy` reports; `finalizeStrategy` repairs what
 * it can deterministically (auto-cite, downgrade, scrub, drop) and labels the rest.
 */
import type { Ledger } from "@/lib/evidence/ledger";
import type { EvidenceId, EvidenceItem } from "@/lib/evidence/types";

import type { CampaignConcept, Claim, CulturalOpportunity, GroundingLevel, StrategyOutput, ValidatedConcept, ValidationSummary } from "./schemas";

export type ViolationCode =
  | "unknown_evidence"
  | "missing_citation"
  | "uncited_entity"
  | "numeric"
  | "forbidden_phrase"
  | "opportunity_without_evidence"
  | "unknown_finding"
  | "duplicate_angle"
  | "too_few_concepts"
  | "overlap"
  | "weak_grounding";

export interface Violation {
  code: ViolationCode;
  path: string;
  message: string;
}

export interface ValidationContext {
  ledger: Ledger;
  findingIds: ReadonlySet<string>;
  /** True when evidence was sufficient, so three concepts are expected. */
  requireThree: boolean;
}

/** Max share of cited Qloo entities two concepts may have in common. */
export const MAX_CONCEPT_OVERLAP = 0.3;

const FORBIDDEN =
  /\b(roi|return on investment|conversions?|conversion rates?|will buy|purchase intent|guarantee[ds]?|proven|sales lift|market share|uplift)\b/i;
const PERCENT = /%|\bpercent(age)?s?\b/i;
const MAGNITUDE = /\b(million|billion|thousand|hundreds of|thousands of|millions of)\b/i;
const YEAR = /\b(19|20)\d{2}s?\b/g;

// Honest caveats ("affinity is not purchase intent") are fine; assertions are not.
const NEGATION = /\b(not|no|never|without|isn't|is not|aren't|doesn't|does not|cannot|can't|rather than|instead of|nor)\b[^.!?]{0,40}$/i;

/** The first forbidden phrase that is asserted (not negated just before it), if any. */
function assertedForbidden(text: string): string | undefined {
  const re = new RegExp(FORBIDDEN.source, "gi");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (!NEGATION.test(text.slice(0, m.index))) return m[0];
  }
  return undefined;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Numbers and performance language in a piece of model-written text. */
export function textViolations(text: string, knownNames: readonly string[]): { code: "numeric" | "forbidden_phrase"; message: string }[] {
  const out: { code: "numeric" | "forbidden_phrase"; message: string }[] = [];
  let stripped = text;
  for (const n of knownNames) if (/\d/.test(n)) stripped = stripped.replace(new RegExp(escapeRe(n), "gi"), " ");
  stripped = stripped.replace(YEAR, " ");
  if (PERCENT.test(text) || /\d/.test(stripped) || MAGNITUDE.test(text)) {
    out.push({ code: "numeric", message: "contains a number or percentage; numbers come from the ledger, not the model" });
  }
  const forbidden = assertedForbidden(text);
  if (forbidden) out.push({ code: "forbidden_phrase", message: `uses "${forbidden}", which affinity data cannot support` });
  return out;
}

// ── ledger lookups ────────────────────────────────────────────────────────

interface LedgerIndex {
  byId: Map<string, EvidenceItem>;
  /** Lowercased entity name → E# ids (several when the same name was retrieved more than once). */
  byName: Map<string, { ids: string[]; qlooIds: Set<string>; name: string }>;
  names: string[];
}

function indexLedger(ledger: Ledger): LedgerIndex {
  const byId = new Map<string, EvidenceItem>();
  const byName = new Map<string, { ids: string[]; qlooIds: Set<string>; name: string }>();
  for (const it of ledger.all()) {
    byId.set(it.id, it);
    const name = it.entity.name.trim();
    if (name.length < 4) continue; // too short to detect reliably in prose
    const key = name.toLowerCase();
    const entry = byName.get(key) ?? { ids: [], qlooIds: new Set<string>(), name };
    entry.ids.push(it.id);
    entry.qlooIds.add(it.entity.qlooId);
    byName.set(key, entry);
  }
  return { byId, byName, names: [...byName.values()].map((e) => e.name) };
}

/** Ledger entities named in the text: unique → their first E#; ambiguous → null. */
function mentions(text: string, idx: LedgerIndex): { name: string; id: string | null }[] {
  const out: { name: string; id: string | null }[] = [];
  const lower = text.toLowerCase();
  for (const [key, e] of idx.byName) {
    if (!lower.includes(key)) continue;
    if (!new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(key)}($|[^\\p{L}\\p{N}])`, "u").test(lower)) continue;
    out.push({ name: e.name, id: e.qlooIds.size === 1 ? (e.ids[0] as string) : null });
  }
  return out;
}

const category = (it: EvidenceItem) => (it.entity.kind === "tag" ? "taste" : it.query.filterType.replace("urn:entity:", ""));

// ── check ────────────────────────────────────────────────────────────────

function claimViolations(claim: Claim, path: string, idx: LedgerIndex, out: Violation[]) {
  const unknown = claim.evidenceIds.filter((id) => !idx.byId.has(id));
  if (unknown.length) out.push({ code: "unknown_evidence", path, message: `cites ${unknown.join(", ")}, which are not in the evidence ledger` });
  const valid = claim.evidenceIds.filter((id) => idx.byId.has(id));
  if (claim.kind === "evidence" && valid.length === 0) {
    out.push({ code: "missing_citation", path, message: "is marked as evidence but cites no valid E#" });
  }
  for (const v of textViolations(claim.text, idx.names)) out.push({ ...v, path });
  const cited = new Set(valid.map((id) => idx.byId.get(id)?.entity.qlooId));
  for (const m of mentions(claim.text, idx)) {
    const mentionedIds = idx.byName.get(m.name.toLowerCase())?.qlooIds ?? new Set();
    if (![...mentionedIds].some((q) => cited.has(q))) {
      out.push({ code: "uncited_entity", path, message: `mentions "${m.name}" without citing it` });
    }
  }
}

function freeTextViolations(text: string, path: string, conceptCited: Set<string | undefined>, idx: LedgerIndex, out: Violation[]) {
  for (const v of textViolations(text, idx.names)) out.push({ ...v, path });
  for (const m of mentions(text, idx)) {
    const q = idx.byName.get(m.name.toLowerCase())?.qlooIds ?? new Set();
    if (![...q].some((x) => conceptCited.has(x))) out.push({ code: "uncited_entity", path, message: `mentions "${m.name}" but the concept never cites it` });
  }
}

function conceptCitations(c: CampaignConcept, idx: LedgerIndex): string[] {
  const ids = [c.culturalInsight, ...c.claims].flatMap((cl) => cl.evidenceIds).concat(c.opportunities.flatMap((o) => o.evidenceIds));
  return [...new Set(ids.filter((id) => idx.byId.has(id)))];
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / new Set([...a, ...b]).size;
}

export function checkStrategy(output: StrategyOutput, ctx: ValidationContext): Violation[] {
  const idx = indexLedger(ctx.ledger);
  const out: Violation[] = [];

  output.opportunities.forEach((o, i) => {
    claimViolations(o.rationale, `opportunities[${i}].rationale`, idx, out);
    for (const v of textViolations(o.title, idx.names)) out.push({ ...v, path: `opportunities[${i}].title` });
    const unknown = o.findingIds.filter((f) => !ctx.findingIds.has(f));
    if (unknown.length) out.push({ code: "unknown_finding", path: `opportunities[${i}]`, message: `references ${unknown.join(", ")}, which are not findings` });
  });

  const entitySets: Set<string>[] = [];
  output.concepts.forEach((c, i) => {
    const p = `concepts[${i}]`;
    claimViolations(c.culturalInsight, `${p}.culturalInsight`, idx, out);
    c.claims.forEach((cl, j) => claimViolations(cl, `${p}.claims[${j}]`, idx, out));
    const citedIds = conceptCitations(c, idx);
    const cited = new Set(citedIds.map((id) => idx.byId.get(id)?.entity.qlooId));
    c.opportunities.forEach((o, j) => {
      const valid = o.evidenceIds.filter((id) => idx.byId.has(id));
      if (valid.length === 0) out.push({ code: "opportunity_without_evidence", path: `${p}.opportunities[${j}]`, message: "proposes a partner or placement with no valid evidence" });
      freeTextViolations(o.idea, `${p}.opportunities[${j}].idea`, cited, idx, out);
    });
    for (const field of ["name", "positioning", "intendedAudience", "concept"] as const) freeTextViolations(c[field], `${p}.${field}`, cited, idx, out);
    for (const field of ["channels", "assumptions", "risks"] as const) {
      c[field].forEach((t, j) => freeTextViolations(t, `${p}.${field}[${j}]`, cited, idx, out));
    }
    const cats = new Set(citedIds.map((id) => category(idx.byId.get(id) as EvidenceItem)));
    if (citedIds.length < 3 || cats.size < 2) {
      out.push({ code: "weak_grounding", path: p, message: `cites ${citedIds.length} evidence item(s) across ${cats.size} categor${cats.size === 1 ? "y" : "ies"}; needs at least three across two` });
    }
    entitySets.push(new Set(citedIds.map((id) => idx.byId.get(id)?.entity.qlooId as string)));
  });

  const angles = output.concepts.map((c) => c.angle);
  angles.forEach((a, i) => {
    if (angles.indexOf(a) !== i) out.push({ code: "duplicate_angle", path: `concepts[${i}]`, message: `repeats the "${a}" angle; each concept needs a different angle` });
  });
  if (ctx.requireThree && output.concepts.length < 3) {
    out.push({ code: "too_few_concepts", path: "concepts", message: `has ${output.concepts.length} concept(s); three differentiated concepts are required` });
  }
  for (let i = 0; i < entitySets.length; i++) {
    for (let j = i + 1; j < entitySets.length; j++) {
      const o = jaccard(entitySets[i] as Set<string>, entitySets[j] as Set<string>);
      if (o > MAX_CONCEPT_OVERLAP) {
        out.push({ code: "overlap", path: `concepts[${i}]~concepts[${j}]`, message: `share too many cited entities; they read as the same idea` });
      }
    }
  }
  return out;
}

// ── finalize (deterministic repair) ───────────────────────────────────────

const REMOVED_INSIGHT = "Insight withheld: it contained an unsupported numeric or performance claim.";

function scrub(text: string, names: readonly string[]): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => textViolations(s, names).length === 0).join(" ").trim();
}

interface Counters {
  autoAttached: number;
  downgraded: number;
  removed: number;
  checked: number;
}

function fixClaim(claim: Claim, idx: LedgerIndex, n: Counters): Claim | null {
  n.checked++;
  if (textViolations(claim.text, idx.names).length) {
    n.removed++;
    return null;
  }
  const ids = [...new Set(claim.evidenceIds.filter((id) => idx.byId.has(id)))];
  const cited = new Set(ids.map((id) => idx.byId.get(id)?.entity.qlooId));
  for (const m of mentions(claim.text, idx)) {
    const q = idx.byName.get(m.name.toLowerCase())?.qlooIds ?? new Set();
    if ([...q].some((x) => cited.has(x)) || !m.id) continue;
    ids.push(m.id);
    cited.add(idx.byId.get(m.id)?.entity.qlooId);
    n.autoAttached++;
  }
  let kind = claim.kind;
  if (kind === "evidence" && ids.length === 0) {
    kind = "hypothesis";
    n.downgraded++;
  }
  return { text: claim.text, kind, evidenceIds: ids.slice(0, 6) };
}

function grounding(citedIds: string[], cats: Set<string>, insight: Claim): GroundingLevel {
  if (citedIds.length >= 3 && cats.size >= 2 && insight.kind === "evidence") return "grounded";
  return citedIds.length > 0 ? "partial" : "insufficient_evidence";
}

export function finalizeStrategy(
  output: StrategyOutput,
  ctx: ValidationContext,
): { concepts: ValidatedConcept[]; opportunities: CulturalOpportunity[]; summary: Omit<ValidationSummary, "repairAttempted"> } {
  const idx = indexLedger(ctx.ledger);
  const violations = checkStrategy(output, ctx).map((v) => `${v.path}: ${v.message}`);
  const n: Counters = { autoAttached: 0, downgraded: 0, removed: 0, checked: 0 };
  const cleanText = (t: string) => {
    const s = scrub(t, idx.names);
    if (s !== t.trim()) n.removed++;
    return s;
  };

  const opportunities: CulturalOpportunity[] = output.opportunities.flatMap((o) => {
    const rationale = fixClaim(o.rationale, idx, n);
    if (!rationale) return [];
    const title = cleanText(o.title);
    if (!title) return [];
    return [{ title, rationale, findingIds: o.findingIds.filter((f) => ctx.findingIds.has(f)) }];
  });

  const concepts: ValidatedConcept[] = output.concepts.map((c) => {
    const notes: string[] = [];
    let culturalInsight = fixClaim(c.culturalInsight, idx, n);
    if (!culturalInsight) {
      culturalInsight = { text: REMOVED_INSIGHT, kind: "hypothesis", evidenceIds: [] };
      notes.push("Cultural insight removed by validation.");
    }
    const claims = c.claims.map((cl) => fixClaim(cl, idx, n)).filter((cl): cl is Claim => cl !== null);
    const opps = c.opportunities.flatMap((o) => {
      const ids = [...new Set(o.evidenceIds.filter((id) => idx.byId.has(id)))];
      const idea = cleanText(o.idea);
      if (ids.length === 0 || !idea) {
        n.removed++;
        notes.push(`Dropped an unsupported ${o.kind} idea.`);
        return [];
      }
      return [{ kind: o.kind, idea, evidenceIds: ids }];
    });
    const fixed: CampaignConcept = {
      ...c,
      name: cleanText(c.name) || c.angle.replace(/_/g, " "),
      positioning: cleanText(c.positioning),
      intendedAudience: cleanText(c.intendedAudience),
      concept: cleanText(c.concept),
      channels: c.channels.map(cleanText).filter(Boolean),
      assumptions: c.assumptions.map(cleanText).filter(Boolean),
      risks: c.risks.map(cleanText).filter(Boolean),
      culturalInsight,
      claims,
      opportunities: opps,
    };
    // Entities named in free text are cited at concept level (unique matches only).
    const citedIds = conceptCitations(fixed, idx);
    const citedQ = new Set(citedIds.map((id) => idx.byId.get(id)?.entity.qlooId));
    const textCitations: string[] = [];
    for (const t of [fixed.name, fixed.positioning, fixed.intendedAudience, fixed.concept, ...fixed.opportunities.map((o) => o.idea)]) {
      for (const m of mentions(t, idx)) {
        if (m.id && !citedQ.has(idx.byId.get(m.id)?.entity.qlooId)) {
          textCitations.push(m.id);
          citedQ.add(idx.byId.get(m.id)?.entity.qlooId);
          n.autoAttached++;
        }
      }
    }
    const allIds = [...new Set([...citedIds, ...textCitations])];
    const cats = new Set(allIds.map((id) => category(idx.byId.get(id) as EvidenceItem)));
    const level = grounding(allIds, cats, culturalInsight);
    if (level !== "grounded") notes.push(level === "partial" ? "Partially grounded: treat as a hypothesis to validate." : "Not grounded in retrieved evidence.");
    return { ...fixed, grounding: level, citedCategories: [...cats].sort(), textCitations, notes };
  });

  return {
    concepts,
    opportunities,
    summary: {
      claimsChecked: n.checked,
      citationsAutoAttached: n.autoAttached,
      downgradedToHypothesis: n.downgraded,
      removed: n.removed,
      violations,
    },
  };
}

/** Compact, model-readable violation list for the single repair call. */
export function describeViolations(violations: readonly Violation[]): string {
  return violations.map((v) => `- [${v.code}] ${v.path} ${v.message}`).join("\n");
}

export type { EvidenceId };
