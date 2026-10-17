/**
 * Exploration CLI: run a fixed, bounded research plan for a scenario against live Qloo
 * data and print what the evidence actually shows. No LLM, no loops, no invented data.
 *
 *   pnpm explore sneakers-nyc [--depth 1] [--save] [--no-cache]
 *
 * Plan (≤ 40 calls): resolve anchors → per category, a target query (anchors +
 * audience + location) and a baseline (anchors + location) → audience lift →
 * taste analysis → demographic profile of the anchors → optional one-step bridge.
 * Output goes to the console only. `--save` writes the ledger to .qloo-cache/
 * (gitignored) — never commit Qloo results.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { assignQuadrants, computeLift, type LiftResult } from "@/lib/evidence/lift";
import type { EvidenceItem, Quadrant } from "@/lib/evidence/types";
import { QlooError } from "@/lib/qloo/errors";
import { createSession, demographics, insights, searchEntities, tasteAnalysis, type EvidenceResult } from "@/lib/qloo/operations";
import type { EntityType, ResolvedRef, ToolCallRecord } from "@/lib/qloo/types";

import { cliClient, fmt, percentile } from "./lib/cli";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTITY_TYPES = ["artist", "book", "brand", "destination", "movie", "person", "place", "podcast", "tv_show"] as const;
const AGE_BUCKETS = ["24_and_younger", "25_to_29", "30_to_34", "35_to_44", "45_to_54", "55_and_older"] as const;

const Scenario = z.object({
  id: z.string(),
  title: z.string(),
  brief: z.string(),
  anchors: z.array(z.object({ query: z.string().min(1), type: z.enum(ENTITY_TYPES) })).min(1).max(6),
  audience: z.object({ ages: z.array(z.enum(AGE_BUCKETS)).max(3).optional(), gender: z.enum(["male", "female"]).optional() }),
  location: z.string().optional(),
  categories: z.array(z.enum(ENTITY_TYPES)).min(1).max(6),
  notModeled: z.array(z.string()).default([]),
});
type Scenario = z.infer<typeof Scenario>;

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const depthArg = args.find((a, i) => args[i - 1] === "--depth") ?? "0";
const depth = Math.min(1, Math.max(0, Number(depthArg) || 0));
const target = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--depth");
if (!target) {
  console.error("Usage: pnpm explore <scenario-id|path.json> [--depth 1] [--save] [--no-cache]");
  process.exit(2);
}
const scenarioPath = target.endsWith(".json") ? resolve(target) : join(HERE, "scenarios", `${target}.json`);
const scenario: Scenario = Scenario.parse(JSON.parse(readFileSync(scenarioPath, "utf8")));

const MAX_CALLS = 40;
const records: ToolCallRecord[] = [];
const client = cliClient({ budget: { maxCalls: MAX_CALLS }, fileCache: !flag("no-cache"), onCall: (r) => records.push(r) });
const s = createSession(client, { node: "explore" });
const warnings: string[] = [];
const noSignal: string[] = [];

const AGE_LABEL: Record<(typeof AGE_BUCKETS)[number], string> = {
  "24_and_younger": "≤24",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

const QUADRANT_LABEL: Record<Quadrant, string> = {
  mainstream_fit: "mainstream fit",
  distinctive_fit: "distinctive fit",
  weak_mainstream: "weak/mainstream",
  long_tail: "long tail",
};

function liftCell(l: LiftResult | undefined): string {
  if (!l) return "";
  if (l.newInTarget) return "new";
  if (l.lift === 0) return "=";
  return l.lift > 0 ? `▲${l.lift}` : `▼${-l.lift}`;
}

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    const why = err instanceof QlooError ? `${err.kind}${err.status ? ` ${err.status}` : ""}: ${err.message}` : String(err);
    warnings.push(`${label} failed — ${why}`);
    return undefined;
  }
}

function printCategory(type: EntityType, t: EvidenceResult, lift: Map<string, LiftResult>, quadrants: Map<string, Quadrant>) {
  const rec = t.record;
  console.log(`\n${type.toUpperCase().replace("_", " ")}  ·  ${t.items[0]?.query.signalSummary ?? ""}`);
  console.log(`  ${rec.callId} ${rec.cached ? "cached" : `${rec.latencyMs}ms`}`);
  console.log(`  ${fmt.pad("E#", 5)}${fmt.pad("rank", 6)}${fmt.pad("name", 34)}${fmt.pad("affinity", 10)}${fmt.pad("pop", 7)}${fmt.pad("lift*", 7)}quadrant*`);
  for (const it of t.items) {
    const q = quadrants.get(it.id);
    console.log(
      `  ${fmt.pad(it.id, 5)}${fmt.pad(`${it.rank}/${it.of}`, 6)}${fmt.pad(it.entity.name, 34)}${fmt.pad(fmt.num(it.affinity, 3), 10)}${fmt.pad(fmt.num(it.popularity), 7)}${fmt.pad(liftCell(lift.get(it.entity.qlooId)), 7)}${q ? QUADRANT_LABEL[q] : ""}`,
    );
  }
}

async function main() {
  console.log(`\n${scenario.title}\n${scenario.brief}\n`);

  // 1. Resolve anchors. Only exact/close matches are trusted.
  const anchors: ResolvedRef[] = [];
  for (const a of scenario.anchors) {
    const r = await attempt(`resolve "${a.query}"`, () => searchEntities(s, { query: a.query, types: [a.type], take: 3 }));
    const best = r?.refs.find((x) => x.matchConfidence !== "weak");
    if (best) {
      anchors.push(best);
      console.log(`  anchor ${fmt.pad(a.query, 22)} → ${best.name} (${best.matchConfidence}, ${best.ref})`);
    } else {
      warnings.push(`Anchor "${a.query}" did not resolve to a trusted Qloo ${a.type} match — not used.`);
      console.log(`  anchor ${fmt.pad(a.query, 22)} → no trusted match (top: ${r?.refs[0]?.name ?? "none"})`);
    }
  }
  if (anchors.length === 0) {
    console.log("\nNo anchors resolved. Sondo would stop here and ask for at least one cultural anchor.");
    return finish();
  }
  const seedRefs = anchors.map((a) => a.ref);
  const ages = scenario.audience.ages;
  const gender = scenario.audience.gender;

  // 2. Target + baseline per category (run concurrently; the client caps concurrency at 4).
  const perCategory = await Promise.all(
    scenario.categories.map(async (type) => {
      const loc = type === "place" || type === "destination" ? { placeLocationQuery: scenario.location } : {};
      const sigLoc = type === "place" || type === "destination" ? {} : { locationQuery: scenario.location };
      const common = { seedRefs, take: 10, ...stripUndefined(loc) };
      const [t, b] = await Promise.all([
        attempt(`${type} target`, () =>
          insights(s, type, { ...common, audience: stripUndefined({ ...sigLoc, ages, gender }), variant: "target" })),
        attempt(`${type} baseline`, () => insights(s, type, { ...common, audience: stripUndefined({ ...sigLoc }), variant: "baseline" })),
      ]);
      return { type, t, b };
    }),
  );

  const lifted: { item: EvidenceItem; lift: LiftResult }[] = [];
  for (const { type, t, b } of perCategory) {
    if (!t) continue;
    warnings.push(...t.warnings.filter((w) => !w.startsWith("No Qloo results")));
    if (t.empty) {
      noSignal.push(`${type}: no Qloo results for ${t.filterType} with these signals`);
      continue;
    }
    const lift = new Map((b ? computeLift(t.items, b.items) : []).map((l) => [l.qlooId, l]));
    const quadrants = assignQuadrants(t.items);
    for (const it of t.items) {
      const l = lift.get(it.entity.qlooId);
      const q = quadrants.get(it.id);
      s.ledger.derive(it.id, { ...(l ? { lift: l.lift, newInTarget: l.newInTarget } : {}), ...(q ? { quadrant: q } : {}) });
      if (l) lifted.push({ item: it, lift: l });
    }
    printCategory(type, t, lift, quadrants);
    if (!b) noSignal.push(`${type}: baseline failed, so no lift`);
  }

  // 3. What over-indexes for this audience (largest rank gains + new entries).
  const movers = lifted
    .filter((x) => x.lift.lift > 0)
    .sort((a, b) => b.lift.lift - a.lift.lift || a.item.rank - b.item.rank)
    .slice(0, 8);
  console.log("\nOVER-INDEXES FOR THIS AUDIENCE vs location baseline (lift* = rank movement)");
  if (movers.length === 0) console.log("  None — audience signals did not move rankings in these categories.");
  for (const m of movers) {
    console.log(`  ${fmt.pad(m.item.id, 5)}${fmt.pad(m.item.entity.name, 34)}${fmt.pad(m.item.entity.type.replace("urn:entity:", ""), 10)}${fmt.pad(liftCell(m.lift), 6)}#${m.item.rank} (baseline ${m.lift.newInTarget ? "absent" : `#${m.lift.baselineRank}`})`);
  }

  // 4. Taste themes and demographic profile of the anchors.
  const taste = await attempt("taste analysis", () =>
    tasteAnalysis(s, { seedRefs, audience: stripUndefined({ ages, gender, locationQuery: scenario.location }), take: 10 }));
  if (taste && !taste.empty) {
    console.log(`\nTASTE THEMES (urn:tag) · ${taste.record.callId}`);
    for (const it of taste.items) console.log(`  ${fmt.pad(it.id, 5)}${fmt.pad(it.entity.name.trim(), 34)}${fmt.pad(it.entity.type.replace("urn:tag:", ""), 22)}aff ${fmt.num(it.affinity, 3)}`);
  } else if (taste) noSignal.push("taste analysis: no tags returned");

  const demo = await attempt("demographics", () => demographics(s, { seedRefs }));
  if (demo?.profiles.length) {
    console.log("\nANCHOR DEMOGRAPHIC AFFINITY (urn:demographics, −1..1, relative — not audience share)");
    for (const p of demo.profiles) {
      const name = anchors.find((a) => a.qlooId === p.qlooId)?.name ?? p.qlooId;
      const ageStr = AGE_BUCKETS.map((b) => `${AGE_LABEL[b]} ${fmt.num(p.age[b])}`).join("  ");
      console.log(`  ${fmt.pad(name, 18)} ${ageStr}  ·  f ${fmt.num(p.gender.female)} m ${fmt.num(p.gender.male)}`);
    }
  }

  // 5. Optional bridge: the top over-indexing entity seeds two more categories.
  const top = movers[0];
  if (depth >= 1 && top) {
    const bridgeRef = s.refs.mint({ kind: "entity", qlooId: top.item.entity.qlooId, name: top.item.entity.name, sourceCallId: top.item.callId });
    const fromType = top.item.entity.type.replace("urn:entity:", "");
    const targets = (["podcast", "brand", "artist", "tv_show"] as EntityType[]).filter((c) => c !== fromType).slice(0, 2);
    console.log(`\nBRIDGE (depth 1) from ${top.item.id} ${top.item.entity.name}`);
    for (const type of targets) {
      const r = await attempt(`bridge → ${type}`, () =>
        insights(s, type, { seedRefs: [bridgeRef.ref], audience: stripUndefined({ ages, locationQuery: scenario.location }), take: 5, variant: "deepen" }));
      if (r && !r.empty) console.log(`  → ${fmt.pad(type, 9)} ${r.items.map((i) => `${i.id} ${i.entity.name}`).join(" · ")}`);
      else if (r) noSignal.push(`bridge → ${type}: no results`);
    }
  }

  finish();
}

function stripUndefined<T extends Record<string, unknown>>(o: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as never;
}

function finish() {
  const live = records.filter((r) => !r.cached);
  const lat = live.map((r) => r.latencyMs);
  const stats = client.stats();
  console.log("\nNOT MODELED by this research");
  for (const n of scenario.notModeled) console.log(`  · ${n}`);
  if (noSignal.length) {
    console.log("\nNO SIGNAL / LIMITATIONS");
    for (const n of noSignal) console.log(`  · ${n}`);
  }
  if (warnings.length) {
    console.log("\nWARNINGS");
    for (const w of [...new Set(warnings)]) console.log(`  · ${w}`);
  }
  console.log(
    `\nQloo calls ${stats.callsUsed}/${MAX_CALLS} (cached ${records.length - live.length}) · p50 ${percentile(lat, 50) ?? "—"}ms · max ${lat.length ? Math.max(...lat) : "—"}ms · evidence ${s.ledger.size}`,
  );
  console.log("* lift and quadrant are Sondo heuristics (rank movement vs baseline; rank half × popularity < 0.90). Affinity is Qloo's per-query score — compare ranks, not raw values.");

  if (flag("save")) {
    const out = join(process.cwd(), ".qloo-cache", "explore", `${scenario.id}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ scenario, ledger: s.ledger.all(), refs: s.refs.all(), trace: records }, null, 2));
    console.log(`Saved ledger → ${out} (gitignored; never commit)`);
  }
}

main().catch((err) => {
  console.error("Explore crashed:", err instanceof QlooError ? `${err.kind}: ${err.message}` : err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
