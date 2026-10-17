/**
 * Sondo — Phase 0 Qloo API feasibility spike.
 *
 * Zero dependencies. Runs on Node >= 23.6 via native type stripping:
 *   QLOO_API_KEY=... node spike/qloo-feasibility.ts
 *   (PowerShell: $env:QLOO_API_KEY="..."; node spike/qloo-feasibility.ts)
 *
 * Guarantees:
 *  - Reads QLOO_API_KEY from the environment only; never prints or writes it.
 *  - Uses the hackathon host only.
 *  - Aborts on the first 401 (no retries on auth failures). Stops on 429.
 *  - Hard cap on total requests.
 *  - Writes a SANITIZED summary (status codes, latency, counts, response
 *    key-paths, numeric ranges). No entity names, IDs, descriptions, or raw
 *    payloads are written to disk. A few top names are printed to the console
 *    only, for human sanity-checking.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE_URL = "https://hackathon.api.qloo.com";
const MAX_REQUESTS = 32;
const TIMEOUT_MS = 15_000;
const SPACING_MS = 300;

const API_KEY = process.env.QLOO_API_KEY?.trim();
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(HERE, "output", "feasibility-summary.json");

type Params = Record<string, string | number | boolean>;

interface CheckResult {
  id: string;
  purpose: string;
  path: string;
  params: Params; // IDs replaced by symbolic placeholders
  status: number | "timeout" | "network_error" | "skipped";
  ok: boolean;
  latencyMs: number | null;
  resultCount: number | null;
  topLevelKeys: string[];
  firstItemKeyPaths: string[];
  fieldPresence: Record<string, boolean>;
  numericRanges: Record<string, { min: number; max: number; n: number }>;
  errorMessage: string | null;
  note: string | null;
}

let requestCount = 0;
let aborted: string | null = null;
const results: CheckResult[] = [];
const placeholders = new Map<string, string>(); // real id -> placeholder

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function redactParams(params: Params): Params {
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    let s = String(v);
    for (const [real, ph] of placeholders) s = s.split(real).join(ph);
    out[k] = s;
  }
  return out;
}

function sanitizeError(text: string): string {
  let s = text.slice(0, 300);
  if (API_KEY) s = s.split(API_KEY).join("<redacted>");
  for (const [real, ph] of placeholders) s = s.split(real).join(ph);
  return s.replace(/\s+/g, " ").trim();
}

/** Collect type-annotated key paths (structure only, no values). */
function keyPaths(value: unknown, prefix = "", depth = 0, out = new Set<string>()): Set<string> {
  if (depth > 5) return out;
  if (Array.isArray(value)) {
    out.add(`${prefix}[]:array`);
    if (value.length > 0) keyPaths(value[0], `${prefix}[]`, depth + 1, out);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // skip noisy localized arrays per hackathon guide ("akas" etc.)
      if (k === "akas" || k === "short_descriptions") {
        out.add(`${prefix ? prefix + "." : ""}${k}:omitted`);
        continue;
      }
      const p = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object") keyPaths(v, p, depth + 1, out);
      else out.add(`${p}:${v === null ? "null" : typeof v}`);
    }
  }
  return out;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

function findList(body: unknown): unknown[] | null {
  const candidates = ["results.entities", "results.tags", "results.audiences", "results.demographics", "results.heatmap", "results", "entities", "tags"];
  for (const c of candidates) {
    const v = getPath(body, c);
    if (Array.isArray(v)) return v;
  }
  return null;
}

interface CallOptions {
  id: string;
  purpose: string;
  path: string;
  params: Params;
  presence?: string[]; // dotted paths checked on first item
  ranges?: string[]; // dotted numeric paths aggregated across items
  note?: string;
}

async function call(opts: CallOptions): Promise<{ body: unknown; list: unknown[] | null } | null> {
  const base: CheckResult = {
    id: opts.id,
    purpose: opts.purpose,
    path: opts.path,
    params: redactParams(opts.params),
    status: "skipped",
    ok: false,
    latencyMs: null,
    resultCount: null,
    topLevelKeys: [],
    firstItemKeyPaths: [],
    fieldPresence: {},
    numericRanges: {},
    errorMessage: null,
    note: opts.note ?? null,
  };

  if (aborted) {
    results.push({ ...base, errorMessage: `skipped: ${aborted}` });
    return null;
  }
  if (requestCount >= MAX_REQUESTS) {
    results.push({ ...base, errorMessage: "skipped: request budget exhausted" });
    return null;
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.params)) qs.set(k, String(v));
  const url = `${BASE_URL}${opts.path}?${qs.toString()}`;

  requestCount++;
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "X-Api-Key": API_KEY as string, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    results.push({
      ...base,
      status: isTimeout ? "timeout" : "network_error",
      latencyMs: Math.round(performance.now() - started),
      errorMessage: sanitizeError(err instanceof Error ? err.message : String(err)),
    });
    await sleep(SPACING_MS);
    return null;
  }
  const latencyMs = Math.round(performance.now() - started);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON */
  }

  const result: CheckResult = { ...base, status: res.status, ok: res.ok, latencyMs };

  if (res.status === 401) aborted = "401 Unauthorized — check key and host; not retrying";
  if (res.status === 429) aborted = "429 rate limited — stopping to protect quota";

  if (!res.ok || body === null) {
    result.errorMessage = sanitizeError(text || res.statusText);
    results.push(result);
    await sleep(SPACING_MS);
    return null;
  }

  const list = findList(body);
  result.topLevelKeys = body && typeof body === "object" ? Object.keys(body as object) : [];
  result.resultCount = list ? list.length : null;
  if (list && list.length > 0) {
    result.firstItemKeyPaths = [...keyPaths(list[0])].sort();
    for (const p of opts.presence ?? []) result.fieldPresence[p] = getPath(list[0], p) !== undefined;
    for (const p of opts.ranges ?? []) {
      const nums = list.map((it) => getPath(it, p)).filter((n): n is number => typeof n === "number");
      if (nums.length) result.numericRanges[p] = { min: Math.min(...nums), max: Math.max(...nums), n: nums.length };
    }
  } else {
    // still record top-level structure for non-list endpoints (e.g. compare)
    result.firstItemKeyPaths = [...keyPaths(body)].sort().slice(0, 80);
  }
  for (const p of opts.presence ?? []) {
    if (p.startsWith("$.")) result.fieldPresence[p] = getPath(body, p.slice(2)) !== undefined;
  }
  results.push(result);

  // console-only sanity peek (never written to disk)
  const names = (list ?? []).slice(0, 3).map((it) => (it as Record<string, unknown>).name ?? (it as Record<string, unknown>).tag_id ?? "?");
  console.log(`  ${opts.id.padEnd(28)} ${res.status} ${String(latencyMs).padStart(5)}ms  n=${result.resultCount ?? "-"}  ${names.join(" | ")}`);

  await sleep(SPACING_MS);
  return { body, list };
}

function firstEntityId(list: unknown[] | null): string | null {
  const it = list?.[0] as Record<string, unknown> | undefined;
  return typeof it?.entity_id === "string" ? it.entity_id : null;
}

async function resolveEntity(label: string, query: string, type: string): Promise<string | null> {
  const r = await call({
    id: `search:${label}`,
    purpose: `Resolve "${query}" to a Qloo entity ID via /search`,
    path: "/search",
    params: { query, types: type, take: 3 },
    presence: ["entity_id", "name", "types", "popularity", "properties", "tags"],
    ranges: ["popularity"],
  });
  const id = firstEntityId(r?.list ?? null);
  if (id) placeholders.set(id, `<${label}>`);
  return id;
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.error(
      "QLOO_API_KEY is not set. Nothing was called.\n" +
        "Request a hackathon key: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide#getting-your-api-key\n" +
        "Then run: QLOO_API_KEY=... node spike/qloo-feasibility.ts",
    );
    process.exitCode = 2;
    return;
  }

  console.log(`Qloo feasibility spike → ${BASE_URL} (max ${MAX_REQUESTS} requests)\n`);

  // 1. Entity resolution (also validates host + auth)
  const brand = await resolveEntity("brand:Patagonia", "Patagonia", "urn:entity:brand");
  const peer = await resolveEntity("brand:Arc'teryx", "Arc'teryx", "urn:entity:brand");
  const artist = await resolveEntity("artist:Bon Iver", "Bon Iver", "urn:entity:artist");
  await resolveEntity("brand:obscure", "Sondo Test Brand Zzqx", "urn:entity:brand"); // expected empty / low-quality match

  // 2. Tag + audience lookup
  const tags = await call({
    id: "tags:outdoor",
    purpose: "Resolve tag IDs via /v2/tags (filter.query)",
    path: "/v2/tags",
    params: { "filter.query": "outdoor", take: 5 },
    presence: ["id", "tag_id", "name", "type", "types"],
  });
  const tagItem = tags?.list?.[0] as Record<string, unknown> | undefined;
  const tagId = (tagItem?.id ?? tagItem?.tag_id) as string | undefined;

  await call({
    id: "audiences:types",
    purpose: "List audience types via /v2/audiences/types (availability on hackathon host)",
    path: "/v2/audiences/types",
    params: { take: 20 },
  });
  const auds = await call({
    id: "audiences:search",
    purpose: "List audiences via /v2/audiences (needed for signal.demographics.audiences)",
    path: "/v2/audiences",
    params: { "filter.audience.types": "urn:audience:hobbies_and_interests", take: 5 },
    presence: ["id", "entity_id", "name", "parents", "type"],
  });
  const audItem = auds?.list?.[0] as Record<string, unknown> | undefined;
  const audienceId = (audItem?.id ?? audItem?.entity_id) as string | undefined;
  if (audienceId) placeholders.set(audienceId, "<audience:first>");

  if (!brand) {
    console.log("\nCore brand did not resolve; skipping dependent Insights checks.");
  } else {
    const evidenceFields = ["entity_id", "name", "subtype", "popularity", "query.affinity", "query.measurements.audience_growth", "tags", "properties.image.url", "external"];
    const ranges = ["query.affinity", "popularity", "query.measurements.audience_growth"];

    // 3. Cross-category affinity discovery
    for (const t of ["urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:podcast", "urn:entity:place", "urn:entity:book"]) {
      await call({
        id: `insights:brand→${t.split(":").pop()}`,
        purpose: `Cross-category: ${t} with affinity to brand`,
        path: "/v2/insights",
        params: { "filter.type": t, "signal.interests.entities": brand, take: 10 },
        presence: evidenceFields,
        ranges,
      });
    }

    // 4. Explainability with multiple signals
    await call({
      id: "insights:explainability",
      purpose: "feature.explainability with 2–3 input entities",
      path: "/v2/insights",
      params: {
        "filter.type": "urn:entity:brand",
        "signal.interests.entities": [brand, artist, peer].filter(Boolean).join(","),
        "feature.explainability": true,
        take: 10,
      },
      presence: [...evidenceFields, "query.explainability", "$.query.explainability", "$.query"],
      ranges,
    });

    // 5. Demographic signals
    await call({
      id: "insights:demographics-signal",
      purpose: "signal.demographics.age + gender shaping",
      path: "/v2/insights",
      params: {
        "filter.type": "urn:entity:artist",
        "signal.interests.entities": brand,
        "signal.demographics.age": "25_to_29,30_to_34",
        "signal.demographics.gender": "female",
        take: 10,
      },
      presence: evidenceFields,
      ranges,
    });

    if (audienceId) {
      await call({
        id: "insights:audience-signal",
        purpose: "signal.demographics.audiences shaping",
        path: "/v2/insights",
        params: { "filter.type": "urn:entity:artist", "signal.interests.entities": brand, "signal.demographics.audiences": audienceId, take: 10 },
        presence: evidenceFields,
        ranges,
      });
    }

    // 6. Geographic constraints
    await call({
      id: "insights:signal.location.query",
      purpose: "signal.location.query on a non-place type (documented in use-case, absent from per-type matrix)",
      path: "/v2/insights",
      params: { "filter.type": "urn:entity:artist", "signal.interests.entities": brand, "signal.location.query": "Austin", take: 10 },
      presence: [...evidenceFields, "$.query.locality"],
      ranges,
    });
    await call({
      id: "insights:filter.location.query",
      purpose: "filter.location.query on places",
      path: "/v2/insights",
      params: { "filter.type": "urn:entity:place", "signal.interests.entities": brand, "filter.location.query": "Austin", take: 10 },
      presence: [...evidenceFields, "properties.geocode", "$.query.locality"],
      ranges,
    });
    await call({
      id: "insights:location-only",
      purpose: "Location-only signal (no entity) — baseline for audience lift",
      path: "/v2/insights",
      params: { "filter.type": "urn:entity:artist", "signal.location.query": "Austin", take: 10 },
      presence: evidenceFields,
      ranges,
    });

    // 7. Taste analysis + demographics outputs (guide lists only entity filter.types → may 403)
    await call({
      id: "insights:urn:tag",
      purpose: "Taste analysis (filter.type=urn:tag) — availability on hackathon host",
      path: "/v2/insights",
      params: { "filter.type": "urn:tag", "signal.interests.entities": brand, take: 10 },
      presence: ["tag_id", "id", "name", "subtype", "query.affinity", "query"],
      ranges: ["query.affinity"],
    });
    await call({
      id: "insights:urn:demographics",
      purpose: "Demographic distribution (filter.type=urn:demographics) — availability",
      path: "/v2/insights",
      params: { "filter.type": "urn:demographics", "signal.interests.entities": brand },
      presence: ["entity_id", "query.age", "query.gender"],
    });

    // 8. Comparative analysis
    if (peer) {
      await call({
        id: "analysis:compare",
        purpose: "/v2/analysis/compare brand vs peer",
        path: "/v2/analysis/compare",
        params: { "a.signal.interests.entities": brand, "b.signal.interests.entities": peer },
        presence: ["$.results", "$.success"],
      });
    }

    // 9. Tag-filtered cross-category
    if (tagId) {
      await call({
        id: "insights:filter.tags",
        purpose: "filter.tags with resolved tag",
        path: "/v2/insights",
        params: { "filter.type": "urn:entity:place", "signal.interests.entities": brand, "filter.tags": tagId, take: 10 },
        presence: evidenceFields,
      });
    }

    // 10. Latency repeat (same request x3 → server-side caching / variance)
    for (let i = 1; i <= 3; i++) {
      await call({
        id: `latency:repeat-${i}`,
        purpose: "Latency variance on identical request",
        path: "/v2/insights",
        params: { "filter.type": "urn:entity:movie", "signal.interests.entities": brand, take: 20 },
      });
    }
  }

  // 11. Entity-type spelling conflict: guide says video_game, deep-dive enum says videogame
  for (const t of ["urn:entity:video_game", "urn:entity:videogame"]) {
    await call({
      id: `type-spelling:${t.split(":").pop()}`,
      purpose: "Resolve documented spelling conflict for video game type",
      path: "/v2/insights",
      params: { "filter.type": t, "signal.location.query": "New York City", take: 3 },
    });
  }

  // 12. Failure modes
  await call({
    id: "failure:invalid-tag",
    purpose: "Invalid tag → expect 'at least one valid signal or filter is required'",
    path: "/v2/insights",
    params: { "filter.type": "urn:entity:movie", "signal.interests.tags": "urn:tag:nonexistent:sondo_xyz" },
  });
  await call({
    id: "failure:unsupported-param",
    purpose: "Unsupported param for type → expect silently ignored (200)",
    path: "/v2/insights",
    params: { "filter.type": "urn:entity:artist", "filter.release_year.min": 2020, "signal.location.query": "Austin", take: 3 },
  });

  writeSummary();
}

function writeSummary(): void {
  const latencies = results.map((r) => r.latencyMs).filter((n): n is number => typeof n === "number").sort((a, b) => a - b);
  const pct = (p: number) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] : null);
  const summary = {
    generatedAt: new Date().toISOString(),
    host: BASE_URL,
    requestsMade: requestCount,
    aborted,
    totals: {
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok && r.status !== "skipped").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      emptyResults: results.filter((r) => r.ok && r.resultCount === 0).length,
    },
    latencyMs: { p50: pct(50), p90: pct(90), max: latencies.at(-1) ?? null },
    checks: results,
    disclaimer: "Sanitized: contains no API key, entity names, entity IDs, or raw Qloo payloads. Safe to commit.",
  };
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(summary, null, 2));
  console.log(`\nRequests: ${requestCount}  ok=${summary.totals.ok} failed=${summary.totals.failed} skipped=${summary.totals.skipped} empty=${summary.totals.emptyResults}`);
  console.log(`Latency p50=${summary.latencyMs.p50}ms p90=${summary.latencyMs.p90}ms`);
  if (aborted) console.log(`ABORTED: ${aborted}`);
  console.log(`Summary → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error("Spike crashed:", sanitizeError(err instanceof Error ? err.stack ?? err.message : String(err)));
  process.exitCode = 1;
});
