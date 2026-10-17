/**
 * Stage B/C executors. Every Qloo request goes through lib/qloo/operations (allowlists,
 * schemas, budget, pacing). The model never reaches this layer directly: it can only
 * propose actions that the dispatcher (adapt.ts) validates first.
 */
import { assignQuadrants, computeLift, type LiftResult } from "@/lib/evidence/lift";
import type { DemographicProfile, EvidenceItem } from "@/lib/evidence/types";
import { QlooError } from "@/lib/qloo/errors";
import {
  demographics as qlooDemographics,
  insights,
  searchEntities,
  tasteAnalysis,
  type EvidenceResult,
  type InsightsInput,
  type QlooSession,
} from "@/lib/qloo/operations";
import type { AudienceSignals, EntityType, ResolvedRef } from "@/lib/qloo/types";

import type { Decision, PlannedAnchor, ResearchPlan } from "./schemas";
import type { RunEvent } from "./types";

/**
 * Types searched when an anchor's category is unknown (one /search call). Excludes
 * place: venue names collide with common words and other entities worldwide, so a
 * place anchor must be typed explicitly.
 */
const ANY_TYPE: EntityType[] = ["brand", "artist", "tv_show", "movie", "podcast", "book"];
const TAKE = 10;

export interface CategoryState {
  type: EntityType;
  target?: EvidenceResult;
  baseline?: EvidenceResult;
  lift: LiftResult[];
  /** Additional lists from niche lens / bridges. */
  extra: EvidenceResult[];
  error?: string;
}

export interface ResearchState {
  s: QlooSession;
  plan: ResearchPlan;
  seeds: ResolvedRef[];
  unresolved: string[];
  categories: Map<EntityType, CategoryState>;
  taste: EvidenceResult[];
  profiles: DemographicProfile[];
  decisions: Decision[];
  warnings: string[];
  /** Keys of actions already executed, to refuse duplicates. */
  done: Set<string>;
  emit: (e: RunEvent) => void;
}

export function newResearchState(s: QlooSession, plan: ResearchPlan, emit: (e: RunEvent) => void): ResearchState {
  return { s, plan, seeds: [], unresolved: [], categories: new Map(), taste: [], profiles: [], decisions: [], warnings: [], done: new Set(), emit };
}

export function qlooCallsLeft(st: ResearchState): number {
  return st.s.client.stats().callsRemaining;
}

/** Calls the core plan still needs: target + baseline per category, taste, demographics. */
export function coreReserve(plan: ResearchPlan): number {
  const perCategory = plan.ages.length || plan.gender ? 2 : 1;
  return plan.categories.length * perCategory + 2;
}

export function recordDecision(st: ResearchState, d: Omit<Decision, "id">): Decision {
  const decision: Decision = { id: `D${st.decisions.length + 1}`, ...d };
  st.decisions.push(decision);
  st.emit({ t: "decision", decision });
  return decision;
}

function describeError(err: unknown): string {
  return err instanceof QlooError ? `${err.kind}${err.status ? ` ${err.status}` : ""}` : err instanceof Error ? err.message : String(err);
}

/** Rethrow errors that must end the run (auth, cancellation); swallow the rest as warnings. */
function fatal(err: unknown): boolean {
  return err instanceof QlooError && (err.kind === "unauthorized" || err.kind === "aborted");
}

// ── Stage B: resolve ─────────────────────────────────────────────────────

async function tryResolve(st: ResearchState, a: PlannedAnchor, types: EntityType[]): Promise<ResolvedRef | undefined> {
  const r = await searchEntities(st.s, { query: a.name, types: types.length ? types : ANY_TYPE, take: 3 });
  st.warnings.push(...r.warnings.filter((w) => !w.startsWith("No Qloo entity")));
  return r.refs.find((x) => x.matchConfidence !== "weak");
}

/** Resolve brand, anchors and peers. Untrusted (weak) matches are never used as seeds. */
export async function resolveAnchors(st: ResearchState): Promise<void> {
  for (const a of st.plan.anchors) {
    if (qlooCallsLeft(st) <= coreReserve(st.plan)) {
      st.warnings.push(`Skipped resolving "${a.name}" to keep Qloo budget for research.`);
      continue;
    }
    let ref: ResolvedRef | undefined;
    try {
      ref = await tryResolve(st, a, a.types);
      // Evidence-dependent fallback: a typed anchor that did not resolve is retried once
      // across the plan's *plausible* alternate types. Never across every type: live, a
      // magazine searched as a brand matched a same-named place abroad and skewed every
      // downstream query (Phase 2 Lisbon run). No alternates → record and skip.
      if (!ref && a.role !== "brand" && a.types.length > 0 && a.alternateTypes.length === 0) {
        recordDecision(st, {
          round: 0,
          proposedBy: "rule",
          action: { tool: "retryAnchor", name: a.name, types: [] },
          reason: `"${a.name}" had no trusted ${a.types.join("/")} match.`,
          outcome: "skipped",
          outcomeReason: "No plausible alternate types were planned; guessing across categories risks matching an unrelated entity with the same name.",
          evidenceAdded: 0,
        });
      } else if (!ref && a.role !== "brand" && a.types.length > 0 && qlooCallsLeft(st) > coreReserve(st.plan)) {
        const alt = a.alternateTypes;
        const d = recordDecision(st, {
          round: 0,
          proposedBy: "rule",
          action: { tool: "retryAnchor", name: a.name, types: alt },
          reason: `"${a.name}" had no trusted ${a.types.join("/")} match; retrying across ${alt.join(", ")}.`,
          outcome: "executed",
          evidenceAdded: 0,
        });
        ref = await tryResolve(st, a, alt);
        d.outcomeReason = ref ? `Resolved as ${ref.entityType ?? "entity"} "${ref.name}" (${ref.matchConfidence}).` : "Still no trusted match.";
      }
    } catch (err) {
      if (fatal(err)) throw err;
      st.warnings.push(`Could not resolve "${a.name}": ${describeError(err)}.`);
    }
    if (ref) {
      if (!st.seeds.some((x) => x.ref === ref.ref)) st.seeds.push(ref);
    } else if (a.role === "brand") {
      st.warnings.push(`Brand "${a.name}" is not in Qloo (expected for new or fictional brands); research is grounded in anchors and the market.`);
    } else {
      st.unresolved.push(a.name);
    }
  }
}

// ── Stage B/C: explore ───────────────────────────────────────────────────

function audience(st: ResearchState, type: EntityType, withAudience: boolean): Pick<InsightsInput, "audience" | "placeLocationQuery"> {
  const isPlace = type === "place" || type === "destination";
  const a: AudienceSignals = {};
  if (!isPlace) a.locationQuery = st.plan.location;
  if (withAudience) {
    if (st.plan.ages.length) a.ages = st.plan.ages;
    if (st.plan.gender) a.gender = st.plan.gender;
  }
  return { audience: a, ...(isPlace ? { placeLocationQuery: st.plan.location } : {}) };
}

const seedRefs = (st: ResearchState) => st.seeds.map((x) => x.ref);

function writeDerived(st: ResearchState, target: EvidenceItem[], lift: LiftResult[]) {
  const quadrants = assignQuadrants(target);
  const byQ = new Map(lift.map((l) => [l.qlooId, l]));
  for (const it of target) {
    const l = byQ.get(it.entity.qlooId);
    const q = quadrants.get(it.id);
    st.s.ledger.derive(it.id, { ...(l ? { lift: l.lift, newInTarget: l.newInTarget } : {}), ...(q ? { quadrant: q } : {}) });
  }
}

/** Target (anchors + audience + market) vs baseline (anchors + market) for one category. */
export async function exploreCategory(st: ResearchState, type: EntityType): Promise<number> {
  const state: CategoryState = st.categories.get(type) ?? { type, lift: [], extra: [] };
  st.categories.set(type, state);
  const seeds = seedRefs(st);
  const hasAudience = st.plan.ages.length > 0 || Boolean(st.plan.gender);
  const base = { ...(seeds.length ? { seedRefs: seeds } : {}), take: TAKE };
  try {
    const [target, baseline] = await Promise.all([
      insights(st.s, type, { ...base, ...audience(st, type, true), variant: "target" }),
      hasAudience ? insights(st.s, type, { ...base, ...audience(st, type, false), variant: "baseline" }) : Promise.resolve(undefined),
    ]);
    state.target = target;
    if (baseline) state.baseline = baseline;
    st.warnings.push(...target.warnings.filter((w) => w.startsWith("Dropped") || w.startsWith("Skipped")));
    state.lift = baseline ? computeLift(target.items, baseline.items) : [];
    writeDerived(st, target.items, state.lift);
    st.emit({ t: "evidence.added", count: target.items.length + (baseline?.items.length ?? 0), category: type });
    return target.items.length;
  } catch (err) {
    if (fatal(err)) throw err;
    state.error = describeError(err);
    st.warnings.push(`${type}: research failed (${state.error}).`);
    return 0;
  }
}

/** Same audience signals, restricted to less popular entities. */
export async function nicheLens(st: ResearchState, type: EntityType): Promise<number> {
  const seeds = seedRefs(st);
  const r = await insights(st.s, type, {
    ...(seeds.length ? { seedRefs: seeds } : {}),
    ...audience(st, type, true),
    popularityMax: 0.6,
    take: TAKE,
    variant: "deepen",
  });
  const state = st.categories.get(type) ?? { type, lift: [], extra: [] };
  state.extra.push(r);
  st.categories.set(type, state);
  writeDerived(st, r.items, []);
  st.emit({ t: "evidence.added", count: r.items.length, category: type });
  return r.items.length;
}

/** Use a retrieved entity as the seed in another category (cross-category bridge). */
export async function bridge(st: ResearchState, evidenceId: string, type: EntityType): Promise<number> {
  const item = st.s.ledger.get(evidenceId as `E${number}`);
  if (!item || item.entity.kind !== "entity") throw new Error(`${evidenceId} is not an entity in the ledger`);
  // Minted from a ledger item, i.e. from a parsed Qloo response — never from model text.
  const ref = st.s.refs.mint({ kind: "entity", qlooId: item.entity.qlooId, name: item.entity.name, sourceCallId: item.callId });
  const r = await insights(st.s, type, { seedRefs: [ref.ref], ...audience(st, type, true), take: TAKE, variant: "deepen" });
  const state = st.categories.get(type) ?? { type, lift: [], extra: [] };
  state.extra.push(r);
  st.categories.set(type, state);
  writeDerived(st, r.items, []);
  st.emit({ t: "evidence.added", count: r.items.length, category: type });
  return r.items.length;
}

/** Taste analysis (urn:tag) for the seeds + audience, optionally scoped to a category. */
export async function tasteThemes(st: ResearchState, parent: EntityType | null): Promise<number> {
  const seeds = seedRefs(st);
  const r = await tasteAnalysis(st.s, {
    ...(seeds.length ? { seedRefs: seeds } : {}),
    audience: { ...(st.plan.ages.length ? { ages: st.plan.ages } : {}), locationQuery: st.plan.location },
    ...(parent ? { parentTypes: [parent] } : {}),
    take: TAKE,
  });
  st.taste.push(r);
  st.emit({ t: "evidence.added", count: r.items.length, category: "taste" });
  return r.items.length;
}

export async function anchorDemographics(st: ResearchState): Promise<void> {
  const seeds = st.seeds.filter((x) => x.kind === "entity");
  if (!seeds.length) return;
  try {
    const r = await qlooDemographics(st.s, { seedRefs: seeds.map((x) => x.ref) });
    st.profiles = r.profiles;
  } catch (err) {
    if (fatal(err)) throw err;
    st.warnings.push(`Demographic profile unavailable (${describeError(err)}).`);
  }
}
