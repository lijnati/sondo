/**
 * Stage A, deterministic half: the model drafts a plan, code decides what runs. The
 * clamp keeps the brief authoritative (ages, gender, market, anchors) and records
 * every change it makes, so the trace shows what the model proposed vs what ran.
 */
import { normalizeName } from "@/lib/qloo/refs";
import type { EntityType } from "@/lib/qloo/types";

import type { Brief } from "./brief";
import type { PlannedAnchor, ResearchPlan, ResearchPlanDraft } from "./schemas";

/** Max /search calls for brand + anchors + peers (Qloo budget is 24 per run). */
export const MAX_RESOLVES = 6;
export const MAX_CATEGORIES = 5;
const MIN_CATEGORIES = 3;

/** Default exploration order: broad cultural signal first, then local and long-form. */
export const DEFAULT_CATEGORIES: EntityType[] = ["artist", "podcast", "tv_show", "brand", "place", "movie", "book"];

const FALLBACK_QUESTIONS = [
  "Which artists, shows and podcasts over-index for this audience compared with the market baseline?",
  "Which brands and local places share this audience's taste?",
  "Which signals are distinctive rather than merely mainstream?",
];

export function clampPlan(draft: ResearchPlanDraft | null, brief: Brief): ResearchPlan {
  const adjustments: string[] = [];
  const excluded = new Set(brief.constraints.excludeCategories);
  const draftAnchors = new Map((draft?.anchors ?? []).map((a) => [normalizeName(a.name), a]));
  const briefNames = new Set(brief.anchors.map((a) => normalizeName(a.name)));

  // Anchors: the brief is authoritative. The draft may only supply types.
  const anchors: PlannedAnchor[] = [{ name: brief.brandName, types: ["brand"], alternateTypes: [], role: "brand" }];
  for (const a of brief.anchors) {
    const d = draftAnchors.get(normalizeName(a.name));
    const types = a.type ? [a.type] : d ? [d.type] : [];
    const alternateTypes = (d?.alternateTypes ?? []).filter((t) => !types.includes(t));
    anchors.push({ name: a.name, types, alternateTypes, role: "anchor" });
  }
  for (const d of draft?.anchors ?? []) {
    if (!briefNames.has(normalizeName(d.name))) adjustments.push(`Ignored anchor "${d.name}": not in the brief.`);
  }
  if (brief.anchors.length < 2) {
    for (const p of draft?.peerBrands ?? []) anchors.push({ name: p, types: ["brand"], alternateTypes: [], role: "peer" });
  } else if (draft?.peerBrands.length) {
    adjustments.push("Skipped peer brands: the brief already has enough anchors.");
  }
  if (anchors.length > MAX_RESOLVES) {
    adjustments.push(`Resolving only the first ${MAX_RESOLVES} names (brand, then anchors, then peers).`);
    anchors.length = MAX_RESOLVES;
  }

  // Audience: brief ages win; draft ages only when the brief gave none.
  let ages = brief.audience.ages ?? [];
  if (ages.length === 0 && draft?.ages.length) {
    ages = draft.ages;
    adjustments.push(`Age buckets inferred from the audience description: ${ages.join(", ")}.`);
  } else if (draft && draft.ages.join() !== ages.join() && draft.ages.length) {
    adjustments.push("Kept the brief's age buckets over the model's suggestion.");
  }
  const gender = brief.audience.gender;
  if (!gender && draft?.gender) adjustments.push("Dropped gender: the brief does not state one.");

  // Categories: dedupe, remove exclusions, cap, then fill to the minimum.
  const categories: EntityType[] = [];
  for (const c of draft?.categories ?? []) {
    if (excluded.has(c)) {
      adjustments.push(`Removed category "${c}": excluded by the brief.`);
      continue;
    }
    if (!categories.includes(c)) categories.push(c);
  }
  if (categories.length > MAX_CATEGORIES) {
    adjustments.push(`Capped categories at ${MAX_CATEGORIES}.`);
    categories.length = MAX_CATEGORIES;
  }
  // A model plan is topped up to the minimum; a fallback plan uses the full default set.
  const fillTo = draft ? MIN_CATEGORIES : MAX_CATEGORIES;
  for (const c of DEFAULT_CATEGORIES) {
    if (categories.length >= fillTo) break;
    if (!excluded.has(c) && !categories.includes(c)) categories.push(c);
  }

  return {
    source: draft ? "model" : "fallback",
    anchors,
    ages,
    ...(gender ? { gender } : {}),
    location: brief.market,
    categories,
    researchQuestions: draft?.researchQuestions.length ? draft.researchQuestions : FALLBACK_QUESTIONS,
    notModeled: draft?.notModeled ?? [],
    rationale: draft?.rationale ?? "Fallback plan built from the brief without a model.",
    adjustments,
  };
}

/** Used when the planning call fails: still a real, bounded research plan. */
export function fallbackPlan(brief: Brief): ResearchPlan {
  return clampPlan(null, brief);
}
