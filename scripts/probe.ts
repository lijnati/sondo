/**
 * Live Qloo capability probe (Phase 1b). Exercises the real data layer — the same
 * client, allowlists, schemas and normalize() the agent will use — against the
 * hackathon host, then grades each capability verified / partial / unavailable.
 *
 *   pnpm probe
 *
 * Writes a SANITIZED summary to scripts/output/probe-summary.json: statuses,
 * latencies, counts, field presence, numeric ranges and overlap metrics only.
 * No entity names, IDs or payloads are written (safe to commit). Budget: 32 calls.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { overlap } from "@/lib/evidence/lift";
import type { EvidenceItem } from "@/lib/evidence/types";
import { QlooError } from "@/lib/qloo/errors";
import {
  compare,
  createSession,
  demographics,
  insights,
  listAudienceTypes,
  searchAudiences,
  searchEntities,
  searchTags,
  tasteAnalysis,
  type EvidenceResult,
} from "@/lib/qloo/operations";
import type { EntityType, ResolvedRef, ToolCallRecord } from "@/lib/qloo/types";

import { cliClient, fmt, percentile } from "./lib/cli";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "output", "probe-summary.json");
const BUDGET = 32;

type Grade = "verified" | "partial" | "unavailable";

interface CheckSummary {
  id: string;
  ok: boolean;
  callIds: string[];
  resultCount?: number;
  fields?: Record<string, boolean>;
  ranges?: Record<string, { min: number; max: number; n: number }>;
  metrics?: Record<string, number>;
  dropped?: string[];
  error?: string;
}

const records: ToolCallRecord[] = [];
const checks: CheckSummary[] = [];
const capabilities: { capability: string; grade: Grade; evidence: string }[] = [];

const client = cliClient({ budget: { maxCalls: BUDGET }, onCall: (r) => records.push(r) });
const s = createSession(client, { node: "probe" });

function range(values: (number | undefined)[]) {
  const nums = values.filter((v): v is number => typeof v === "number");
  return nums.length ? { min: +Math.min(...nums).toFixed(4), max: +Math.max(...nums).toFixed(4), n: nums.length } : undefined;
}

function evidenceStats(items: EvidenceItem[]) {
  const fields = {
    affinity: items.length > 0 && items.every((i) => i.affinity !== undefined),
    popularity: items.length > 0 && items.every((i) => i.popularity !== undefined),
    tags: items.some((i) => i.entity.tags.length > 0),
    image: items.some((i) => i.entity.imageUrl !== undefined),
    explainability: items.some((i) => (i.explainability?.length ?? 0) > 0),
  };
  const ranges: CheckSummary["ranges"] = {};
  const a = range(items.map((i) => i.affinity));
  const p = range(items.map((i) => i.popularity));
  if (a) ranges.affinity = a;
  if (p) ranges.popularity = p;
  return { fields, ranges };
}

/** Run one check; record a sanitized summary and keep going on failure. */
async function check<T>(id: string, fn: () => Promise<T>, summarize: (r: T) => Partial<CheckSummary>): Promise<T | undefined> {
  const before = records.length;
  try {
    const r = await fn();
    const extra = summarize(r);
    checks.push({ id, ok: true, callIds: records.slice(before).map((x) => x.callId), ...extra });
    const n = extra.resultCount ?? "-";
    console.log(`  ✓ ${fmt.pad(id, 34)} n=${n}${extra.metrics ? `  ${JSON.stringify(extra.metrics)}` : ""}`);
    return r;
  } catch (err) {
    const msg = err instanceof QlooError ? `${err.kind}${err.status ? ` ${err.status}` : ""}` : "error";
    checks.push({ id, ok: false, callIds: records.slice(before).map((x) => x.callId), error: msg });
    console.log(`  ✗ ${fmt.pad(id, 34)} ${msg}`);
    return undefined;
  }
}

const fromEvidence = (r: EvidenceResult): Partial<CheckSummary> => ({
  resultCount: r.items.length,
  ...evidenceStats(r.items),
  ...(r.warnings.some((w) => w.startsWith("Dropped")) ? { dropped: r.warnings.filter((w) => w.startsWith("Dropped")) } : {}),
});

function grade(capability: string, g: Grade, evidence: string) {
  capabilities.push({ capability, grade: g, evidence });
}

async function resolve(id: string, query: string, type: EntityType): Promise<ResolvedRef | undefined> {
  const r = await check(id, () => searchEntities(s, { query, types: [type], take: 3 }), (x) => ({
    resultCount: x.refs.length,
    metrics: { exactOrClose: x.refs[0] && x.refs[0].matchConfidence !== "weak" ? 1 : 0 },
  }));
  return r?.refs[0];
}

async function main() {
  console.log(`Qloo capability probe → hackathon host (budget ${BUDGET} calls)\n`);

  // 1. Access + entity search across types (well-known anchors; inputs only).
  const brand = await resolve("search:brand", "Patagonia", "brand");
  if (!brand) {
    console.error("\nCore search failed; stopping (see errors above).");
    return finish();
  }
  const peer = await resolve("search:brand-peer", "The North Face", "brand");
  const artist = await resolve("search:artist", "Bon Iver", "artist");
  await resolve("search:podcast", "The Joe Rogan Experience", "podcast");
  const nonsense = await check("search:nonsense", () => searchEntities(s, { query: "Sondo Zzqx Nonexistent Label", types: ["brand"], take: 3 }), (x) => ({
    resultCount: x.refs.length,
    metrics: { topMatchIsWeak: x.refs[0]?.matchConfidence === "weak" ? 1 : 0 },
  }));
  grade("Entity search (/search)", brand && artist ? "verified" : "partial", "Resolves brand and artist anchors; returns popularity and tags.");
  grade(
    "Unknown-name handling",
    nonsense && (nonsense.refs.length === 0 || nonsense.refs[0]?.matchConfidence === "weak") ? "verified" : "partial",
    "Nonsense queries return unrelated results; matchConfidence flags them as weak.",
  );

  // 2. Cross-category affinity from a brand signal.
  const base: Partial<Record<EntityType, EvidenceResult>> = {};
  for (const type of ["artist", "movie", "tv_show", "podcast", "book", "place", "brand"] as EntityType[]) {
    const r = await check(`insights:brand→${type}`, () => insights(s, type, { seedRefs: [brand.ref], take: 10, variant: "baseline" }), fromEvidence);
    if (r) base[type] = r;
  }
  const nonEmpty = Object.values(base).filter((r) => r && r.items.length > 0).length;
  const withAffinity = Object.values(base).filter((r) => r && r.items.length > 0 && r.items.every((i) => i.affinity !== undefined)).length;
  grade("Cross-category insights", nonEmpty >= 4 ? "verified" : nonEmpty > 0 ? "partial" : "unavailable", `${nonEmpty}/7 categories non-empty for a brand signal.`);
  grade("query.affinity on results", withAffinity === nonEmpty && nonEmpty > 0 ? "verified" : withAffinity > 0 ? "partial" : "unavailable", `${withAffinity}/${nonEmpty} non-empty categories carry affinity on every item.`);

  // 3. Explainability.
  const explainSeeds = [brand.ref, ...(artist ? [artist.ref] : [])];
  const ex = await check("insights:explainability", () => insights(s, "brand", { seedRefs: explainSeeds, explain: true, take: 10 }), fromEvidence);
  const explained = ex?.items.filter((i) => (i.explainability?.length ?? 0) > 0).length ?? 0;
  grade("Explainability", explained > 0 ? "verified" : ex ? "partial" : "unavailable", `${explained}/${ex?.items.length ?? 0} results carry per-input contributions.`);

  // 4. G3: do age/gender signals change rankings? (overlap of top-10 vs baseline)
  const g3: number[] = [];
  for (const type of ["artist", "podcast"] as EntityType[]) {
    const b = base[type];
    const r = await check(`insights:age+gender→${type}`, () =>
      insights(s, type, { seedRefs: [brand.ref], audience: { ages: ["25_to_29", "30_to_34"], gender: "female" }, take: 10 }), (x) => ({
      ...fromEvidence(x),
      ...(b ? { metrics: { overlapWithBaseline: +overlap(x.items, b.items).toFixed(2) } } : {}),
    }));
    if (r && b) g3.push(overlap(r.items, b.items));
  }
  grade(
    "Age/gender signals shift ranking (G3)",
    g3.length && g3.every((o) => o < 0.8) ? "verified" : g3.length ? "partial" : "unavailable",
    `Top-10 overlap with baseline: ${g3.map(fmt.pct).join(", ") || "n/a"} (lower = stronger shift).`,
  );

  // 5. G4: location on non-place types.
  const g4: number[] = [];
  for (const type of ["artist", "podcast"] as EntityType[]) {
    const b = base[type];
    const r = await check(`insights:location→${type}`, () =>
      insights(s, type, { seedRefs: [brand.ref], audience: { locationQuery: "New York" }, take: 10 }), (x) => ({
      ...fromEvidence(x),
      ...(b ? { metrics: { overlapWithBaseline: +overlap(x.items, b.items).toFixed(2) } } : {}),
    }));
    if (r && b) g4.push(overlap(r.items, b.items));
  }
  const nyc = await check("insights:location-only NYC→artist", () => insights(s, "artist", { audience: { locationQuery: "New York" }, take: 10 }), fromEvidence);
  const la = await check("insights:location-only LA→artist", () => insights(s, "artist", { audience: { locationQuery: "Los Angeles" }, take: 10 }), (x) => ({
    ...fromEvidence(x),
    ...(nyc ? { metrics: { overlapWithNYC: +overlap(x.items, nyc.items).toFixed(2) } } : {}),
  }));
  const cityOverlap = nyc && la ? overlap(la.items, nyc.items) : undefined;
  grade(
    "signal.location.query on non-place types (G4)",
    cityOverlap !== undefined && cityOverlap < 0.8 ? (g4.some((o) => o < 0.8) ? "verified" : "partial") : "unavailable",
    `Location-only NYC vs LA overlap ${cityOverlap === undefined ? "n/a" : fmt.pct(cityOverlap)}; brand+location vs brand overlap ${g4.map(fmt.pct).join(", ") || "n/a"}.`,
  );
  const place = await check("insights:place filter.location.query", () =>
    insights(s, "place", { seedRefs: [brand.ref], placeLocationQuery: "New York", take: 10 }), fromEvidence);
  grade("Place results filtered by city", place && place.items.length > 0 ? "verified" : "unavailable", `${place?.items.length ?? 0} places returned for filter.location.query.`);

  // 6. Tags and audiences.
  const tags = await check("tags:search", () => searchTags(s, { query: "sustainability", take: 5 }), (x) => ({ resultCount: x.refs.length }));
  grade("Tag search (/v2/tags)", tags && tags.refs.length > 0 ? "verified" : "unavailable", `${tags?.refs.length ?? 0} tags for a keyword query.`);
  const audTypes = await check("audiences:types", () => listAudienceTypes(s), (x) => ({ resultCount: x.types.length }));
  const firstType = audTypes?.types.find((t) => t.includes("hobbies")) ?? audTypes?.types[0];
  const auds = firstType
    ? await check("audiences:search", () => searchAudiences(s, { audienceTypes: [firstType], take: 10 }), (x) => ({ resultCount: x.refs.length }))
    : undefined;
  const audRef = auds?.refs[0];
  let audOverlap: number | undefined;
  if (audRef && base.artist) {
    const baseArtist = base.artist;
    const r = await check("insights:audience→artist", () =>
      insights(s, "artist", { seedRefs: [brand.ref], audience: { audienceRefs: [audRef.ref] }, take: 10 }), (x) => ({
      ...fromEvidence(x),
      metrics: { overlapWithBaseline: +overlap(x.items, baseArtist.items).toFixed(2) },
    }));
    if (r) audOverlap = overlap(r.items, baseArtist.items);
  }
  grade(
    "Audiences (/v2/audiences + signal)",
    audRef && audOverlap !== undefined ? (audOverlap < 0.8 ? "verified" : "partial") : auds ? "partial" : "unavailable",
    `${audTypes?.types.length ?? 0} audience types; audience signal overlap with baseline ${audOverlap === undefined ? "n/a" : fmt.pct(audOverlap)}.`,
  );

  // 7. Taste analysis, demographics, compare.
  const taste = await check("insights:urn:tag (taste)", () => tasteAnalysis(s, { seedRefs: [brand.ref], take: 10 }), fromEvidence);
  grade("Taste analysis (urn:tag)", taste && taste.items.length > 0 ? (taste.items.every((i) => i.affinity !== undefined) ? "verified" : "partial") : "unavailable", `${taste?.items.length ?? 0} tags with affinity.`);
  const demo = await check("insights:urn:demographics", () => demographics(s, { seedRefs: [brand.ref] }), (x) => ({
    resultCount: x.profiles.length,
    metrics: { ageBuckets: Object.keys(x.profiles[0]?.age ?? {}).length, genderKeys: Object.keys(x.profiles[0]?.gender ?? {}).length },
  }));
  const buckets = Object.keys(demo?.profiles[0]?.age ?? {}).length;
  grade("Demographic profile (urn:demographics)", buckets === 6 ? "verified" : demo ? "partial" : "unavailable", `${buckets}/6 age buckets and gender affinities (−1..1) returned.`);
  if (peer) {
    const cmp = await check("analysis:compare", () => compare(s, { aRefs: [brand.ref], bRefs: [peer.ref] }), (x) => ({
      resultCount: x.items.length,
      ...(range(x.items.map((i) => i.score)) ? { ranges: { score: range(x.items.map((i) => i.score))! } } : {}),
    }));
    grade("Compare (/v2/analysis/compare)", cmp && cmp.items.length > 0 ? "partial" : "unavailable", "Returns items with query.score; scale undocumented → exploration only.");
  }

  // 8. Allowlist: a place-only filter on an artist query is dropped client-side and reported.
  await check("allowlist:drop place filter on artist", () =>
    insights(s, "artist", { seedRefs: [brand.ref], placeLocationQuery: "New York", take: 3 }), fromEvidence);

  finish();
}

function finish() {
  const live = records.filter((r) => !r.cached);
  const lat = live.map((r) => r.latencyMs);
  const summary = {
    generatedAt: new Date().toISOString(),
    host: "https://hackathon.api.qloo.com",
    calls: { made: live.length, cached: records.length - live.length, failed: records.filter((r) => typeof r.status !== "number" || r.status >= 400).length, budget: BUDGET },
    latencyMs: { p50: percentile(lat, 50), p90: percentile(lat, 90), max: lat.length ? Math.max(...lat) : undefined },
    capabilities,
    checks,
    // Request trace without values that could contain Qloo IDs: path, param keys, filter.type.
    trace: records.map((r) => ({
      callId: r.callId,
      tool: r.tool,
      path: r.path,
      filterType: r.params["filter.type"],
      paramKeys: Object.keys(r.params),
      status: r.status,
      latencyMs: r.latencyMs,
      resultCount: r.resultCount,
      retry: r.retry,
    })),
    disclaimer: "Sanitized: no API key, entity names, entity IDs or raw Qloo payloads. Safe to commit.",
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(summary, null, 2)}\n`);

  console.log("\nCapability                                   Grade        Evidence");
  for (const c of capabilities) console.log(`  ${fmt.pad(c.capability, 42)} ${fmt.pad(c.grade, 12)} ${c.evidence}`);
  console.log(`\nCalls ${summary.calls.made} (failed ${summary.calls.failed}) · p50 ${summary.latencyMs.p50}ms · p90 ${summary.latencyMs.p90}ms · max ${summary.latencyMs.max}ms`);
  console.log(`Summary → ${OUT}`);
}

main().catch((err) => {
  console.error("Probe crashed:", err instanceof QlooError ? `${err.kind}: ${err.message}` : err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
