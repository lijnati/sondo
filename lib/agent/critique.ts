/**
 * Stage D: deterministic evidence evaluation. Findings are written by code from ledger
 * values (rank, lift, quadrant, shared tags) — never by the model — and carry E# ids.
 * Flags describe what is weak or missing; they drive the adaptive rounds.
 */
import type { EvidenceItem } from "@/lib/evidence/types";
import type { EntityType } from "@/lib/qloo/types";

import type { ResearchState } from "./research";
import type { CulturalFinding, FindingKind } from "./schemas";
import { sanitizeName } from "./digest";

export type FlagCode =
  | "empty_category"
  | "failed_category"
  | "audience_not_distinctive"
  | "all_mainstream"
  | "no_seeds"
  | "unresolved_anchor"
  | "demographic_conflict"
  | "bridge_candidate"
  | "no_taste_themes";

export interface Flag {
  code: FlagCode;
  category?: EntityType;
  evidenceId?: string;
  detail: string;
}

export interface Critique {
  findings: CulturalFinding[];
  flags: Flag[];
  sufficient: boolean;
  coverage: { category: EntityType; items: number; liftSignals: number; distinctive: number; overlapWithBaseline?: number }[];
}

/** An entity counts as an audience-lift signal when it gains ≥ 3 ranks, or is new in the top 5. */
export const isLiftSignal = (it: EvidenceItem) =>
  Boolean(it.derived && ((it.derived.lift ?? 0) >= 3 || (it.derived.newInTarget && it.rank <= 5)));

const MIN_ITEMS = 5;
const MIN_CATEGORIES = 3;
const NOT_DISTINCTIVE_OVERLAP = 0.8;

function overlapShare(a: EvidenceItem[], b: EvidenceItem[]): number {
  if (!a.length || !b.length) return 0;
  const ids = new Set(b.map((x) => x.entity.qlooId));
  return a.filter((x) => ids.has(x.entity.qlooId)).length / a.length;
}

const label = (t: string) => t.replace("_", " ");

export function critique(st: ResearchState): Critique {
  const findings: CulturalFinding[] = [];
  const flags: Flag[] = [];
  const add = (kind: FindingKind, statement: string, evidenceIds: string[], strength: CulturalFinding["strength"], category?: string) =>
    findings.push({ id: `F${findings.length + 1}`, kind, statement, evidenceIds, strength, ...(category ? { category } : {}) });

  if (st.seeds.length === 0) flags.push({ code: "no_seeds", detail: "No anchor resolved; research uses market and audience signals only." });
  for (const name of st.unresolved) {
    flags.push({ code: "unresolved_anchor", detail: `"${sanitizeName(name)}" could not be matched to a Qloo entity.` });
    add("gap", `The anchor "${sanitizeName(name)}" is not in Qloo, so it does not shape this research.`, [], "weak");
  }

  const coverage: Critique["coverage"] = [];
  const topItemsByCategory = new Map<EntityType, EvidenceItem[]>();
  for (const [type, c] of st.categories) {
    const items = [...(c.target?.items ?? []), ...c.extra.flatMap((e) => e.items)];
    topItemsByCategory.set(type, items);
    const target = c.target?.items ?? [];
    const lifts = target.filter(isLiftSignal);
    const distinct = items.filter((i) => i.derived?.quadrant === "distinctive_fit" || i.derived?.quadrant === "long_tail");
    const ov = c.baseline ? overlapShare(target, c.baseline.items) : undefined;
    coverage.push({ category: type, items: items.length, liftSignals: lifts.length, distinctive: distinct.length, ...(ov !== undefined ? { overlapWithBaseline: ov } : {}) });

    if (c.error) flags.push({ code: "failed_category", category: type, detail: `${label(type)} research failed (${c.error}).` });
    else if (items.length === 0) {
      flags.push({ code: "empty_category", category: type, detail: `No Qloo results for ${label(type)} with these signals.` });
      add("weak", `Qloo returned no ${label(type)} results for this audience and market.`, [], "weak", type);
      continue;
    }
    if (ov !== undefined && ov >= NOT_DISTINCTIVE_OVERLAP) {
      flags.push({ code: "audience_not_distinctive", category: type, detail: `${label(type)} results barely change with the audience signals.` });
      add("weak", `In ${label(type)}, this audience looks like the general market: the lists barely differ.`, target.slice(0, 2).map((i) => i.id), "weak", type);
    }

    // Leading affinity in the category.
    const top = target[0];
    if (top) add("affinity", `${sanitizeName(top.entity.name)} leads ${label(type)} affinity for this audience signal set.`, [top.id], "moderate", type);

    // Audience lift: what this audience over-indexes on compared with the market baseline.
    for (const it of lifts.slice(0, 2)) {
      const how = it.derived?.newInTarget ? "appears only for this audience, not in the market baseline" : "ranks higher for this audience than in the market baseline";
      add("audience_lift", `${sanitizeName(it.entity.name)} ${how} (${label(type)}).`, [it.id], it.rank <= 3 ? "strong" : "moderate", type);
      if (it.entity.kind === "entity") flags.push({ code: "bridge_candidate", category: type, evidenceId: it.id, detail: `${it.id} over-indexes for this audience; it could seed another category.` });
    }

    // Distinctive: high fit, lower mainstream popularity (Sondo heuristic).
    for (const it of items.filter((i) => i.derived?.quadrant === "distinctive_fit").slice(0, 2)) {
      add("distinctive", `${sanitizeName(it.entity.name)} combines strong fit with below-mainstream popularity (${label(type)}, Sondo heuristic).`, [it.id], "moderate", type);
    }
  }

  // Cross-category intersections: the same Qloo tag on top items in different categories.
  const tagHits = new Map<string, { name: string; ids: Map<EntityType, string> }>();
  for (const [type, items] of topItemsByCategory) {
    for (const it of items.slice(0, 10)) {
      for (const tag of it.entity.tags) {
        const e = tagHits.get(tag.id) ?? { name: tag.name, ids: new Map<EntityType, string>() };
        if (!e.ids.has(type)) e.ids.set(type, it.id);
        tagHits.set(tag.id, e);
      }
    }
  }
  const intersections = [...tagHits.values()].filter((e) => e.ids.size >= 2).sort((a, b) => b.ids.size - a.ids.size).slice(0, 3);
  for (const e of intersections) {
    const cats = [...e.ids.keys()].map(label).join(", ");
    add("intersection", `The theme "${sanitizeName(e.name)}" connects top results across ${cats}.`, [...e.ids.values()].slice(0, 4), e.ids.size >= 3 ? "strong" : "moderate");
  }

  const themes = st.taste.flatMap((t) => t.items).slice(0, 3);
  if (themes.length) add("theme", `Leading taste themes for this audience: ${themes.map((t) => sanitizeName(t.entity.name)).join(", ")}.`, themes.map((t) => t.id), "moderate");
  else flags.push({ code: "no_taste_themes", detail: "No taste themes retrieved yet." });

  // Demographic conflict: anchors skew away from the brief's target ages (relative −1..1 scale).
  for (const p of st.profiles) {
    const vals = st.plan.ages.map((a) => p.age[a]).filter((v): v is number => typeof v === "number");
    if (vals.length && vals.every((v) => v < -0.3)) {
      const name = st.seeds.find((x) => x.qlooId === p.qlooId)?.name ?? "An anchor";
      flags.push({ code: "demographic_conflict", detail: `${sanitizeName(name)} skews away from the target age buckets.` });
      add("conflict", `${sanitizeName(name)}'s Qloo demographic profile skews away from the target ages, so it may pull results toward a different audience.`, [], "moderate");
    }
  }

  const anyDistinctive = coverage.some((c) => c.distinctive > 0);
  if (!anyDistinctive && coverage.length) flags.push({ code: "all_mainstream", detail: "Every retrieved list is mainstream; no distinctive signals yet." });

  const covered = coverage.filter((c) => c.items >= MIN_ITEMS).length;
  const sufficient = covered >= MIN_CATEGORIES && coverage.some((c) => c.liftSignals > 0 || c.distinctive > 0);
  return { findings, flags, sufficient, coverage };
}
