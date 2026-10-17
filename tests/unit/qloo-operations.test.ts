import { describe, expect, it } from "vitest";

import { computeLift } from "@/lib/evidence/lift";
import { createQlooClient } from "@/lib/qloo/client";
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
} from "@/lib/qloo/operations";

import * as F from "../fixtures/qloo";

/** Route fake responses by path + filter.type; record every requested URL. */
function sessionWith(routes: Record<string, { status?: number; body: unknown }>) {
  const urls: URL[] = [];
  const fetchFn = async (input: string | URL | Request) => {
    const url = new URL(String(input));
    urls.push(url);
    const key = `${url.pathname}${url.searchParams.get("filter.type") ? `:${url.searchParams.get("filter.type")}` : ""}`;
    const route = routes[key] ?? routes[url.pathname];
    if (!route) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  };
  const client = createQlooClient({ apiKey: "synthetic", fetch: fetchFn as unknown as typeof fetch });
  return { s: createSession(client), urls };
}

async function resolveBrand(s: ReturnType<typeof sessionWith>["s"]) {
  const { refs } = await searchEntities(s, { query: "Fixture Brand Alpha", types: ["brand"] });
  return refs[0]!;
}

describe("entity, tag and audience discovery", () => {
  it("mints refs from /search with match confidence and entity type", async () => {
    const { s, urls } = sessionWith({ "/search": { body: F.searchBody } });
    const brand = await resolveBrand(s);
    expect(brand).toMatchObject({ kind: "entity", qlooId: F.ID.brandA, entityType: "brand", matchConfidence: "exact", popularity: 0.91 });
    expect(brand.ref).toMatch(/^ref_e\d+$/);
    expect(urls[0]?.searchParams.get("types")).toBe("urn:entity:brand");
  });

  it("flags a weak match instead of trusting it", async () => {
    const { s } = sessionWith({ "/search": { body: F.searchBody } });
    const { refs } = await searchEntities(s, { query: "Totally Different Name", types: ["brand"] });
    expect(refs[0]?.matchConfidence).toBe("weak");
  });

  it("treats a /search 404 as no results, keeping the trace record", async () => {
    const { s } = sessionWith({});
    const res = await searchEntities(s, { query: "nothing", types: ["brand"] });
    expect(res.refs).toEqual([]);
    expect(res.record.status).toBe(404);
    expect(res.warnings[0]).toMatch(/No Qloo entity matched/);
  });

  it("resolves tags, audiences and audience types", async () => {
    const { s } = sessionWith({
      "/v2/tags": { body: F.tagsBody },
      "/v2/audiences": { body: F.audiencesBody },
      "/v2/audiences/types": { body: F.audienceTypesBody },
    });
    const tags = await searchTags(s, { query: "folk" });
    expect(tags.refs[0]).toMatchObject({ kind: "tag", qlooId: "urn:tag:genre:fixture_folk" });
    const aud = await searchAudiences(s, { audienceTypes: ["urn:audience:hobbies_and_interests"] });
    expect(aud.refs[0]).toMatchObject({ kind: "audience", name: "Fixture Hikers" });
    const types = await listAudienceTypes(s);
    expect(types.types).toEqual(["urn:audience:hobbies_and_interests", "urn:audience:life_stage"]);
  });
});

describe("insights → evidence", () => {
  it("normalizes entities verbatim and records what is missing", async () => {
    const { s, urls } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights": { body: F.insightsTargetBody } });
    const brand = await resolveBrand(s);
    const res = await insights(s, "artist", {
      seedRefs: [brand.ref],
      audience: { ages: ["25_to_29", "30_to_34"], locationQuery: "New York" },
      take: 10,
    });
    const url = urls.at(-1)!;
    expect(url.searchParams.get("signal.interests.entities")).toBe(F.ID.brandA);
    expect(url.searchParams.get("signal.demographics.age")).toBe("25_to_29,30_to_34");
    expect(url.searchParams.get("signal.location.query")).toBe("New York");

    expect(res.items.map((i) => i.id)).toEqual(["E1", "E2", "E3"]);
    const [first, , third] = res.items;
    expect(first).toMatchObject({
      rank: 1,
      of: 3,
      affinity: 0.97,
      popularity: 0.95,
      entity: { kind: "entity", type: "urn:entity:artist", name: "Fixture Artist One", imageUrl: "https://example.test/img.jpg" },
      query: { filterType: "urn:entity:artist", variant: "target", inputRefs: [brand.ref] },
    });
    expect(first?.query.signalSummary).toContain("Fixture Brand Alpha");
    expect(first?.missing).toBeUndefined();
    // Missing values stay missing — never 0 or a guess.
    expect(third?.affinity).toBeUndefined();
    expect(third?.popularity).toBeUndefined();
    expect(third?.missing).toEqual(["affinity", "popularity", "tags", "image"]);
    expect(res.record.callId).toBe(first?.callId);
  });

  it("drops unsupported params with a warning rather than sending them", async () => {
    const { s, urls } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights": { body: F.insightsTargetBody } });
    const brand = await resolveBrand(s);
    const res = await insights(s, "podcast", { seedRefs: [brand.ref], placeLocationQuery: "Austin" });
    expect(urls.at(-1)?.searchParams.has("filter.location.query")).toBe(false);
    expect(res.warnings.join(" ")).toMatch(/Dropped "filter.location.query"/);
  });

  it("reports an empty result honestly", async () => {
    const { s } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights": { body: F.emptyInsightsBody } });
    const brand = await resolveBrand(s);
    const res = await insights(s, "podcast", { seedRefs: [brand.ref] });
    expect(res.empty).toBe(true);
    expect(res.items).toEqual([]);
    expect(res.warnings.at(-1)).toMatch(/No Qloo results for urn:entity:podcast/);
  });

  it("maps explainability contributions back to refs", async () => {
    const { s } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights": { body: F.explainBody } });
    const brand = await resolveBrand(s);
    const res = await insights(s, "artist", { seedRefs: [brand.ref], explain: true });
    expect(res.items[0]?.explainability).toEqual([{ ref: brand.ref, contribution: 0.8 }]);
  });

  it("rejects refs it never minted (no raw IDs from callers)", async () => {
    const { s } = sessionWith({});
    await expect(insights(s, "artist", { seedRefs: ["ref_e999"] })).rejects.toThrow(/Unknown ref/);
  });

  // Regression (Phase 1b live probe): some live items carry `tags: null`, or a tag
  // without an `id`. One bad sub-field must not discard the whole response.
  it("tolerates null tags and malformed tag entries", async () => {
    const [a, b] = F.insightsTargetBody.results.entities;
    const body = {
      results: {
        entities: [
          { ...a, tags: null },
          { ...b, tags: [{ name: "no id" }, { id: "urn:tag:genre:ok", name: "Ok" }] },
        ],
      },
    };
    const { s } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights": { body } });
    const brand = await resolveBrand(s);
    const res = await insights(s, "artist", { seedRefs: [brand.ref] });
    expect(res.items).toHaveLength(2);
    expect(res.items[0]?.entity.tags).toEqual([]);
    expect(res.items[0]?.missing).toEqual(["tags"]);
    expect(res.items[1]?.entity.tags).toEqual([{ id: "urn:tag:genre:ok", name: "Ok" }]);
  });

  it("skips an item missing required fields and says so", async () => {
    const [a] = F.insightsTargetBody.results.entities;
    const [, b] = F.insightsTargetBody.results.entities;
    const body = { results: { entities: [a, { name: "no entity_id" }, b] } };
    const { s } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights": { body } });
    const brand = await resolveBrand(s);
    const res = await insights(s, "artist", { seedRefs: [brand.ref] });
    expect(res.items).toHaveLength(2);
    // Ranks are Qloo's original positions, not renumbered after the skip.
    expect(res.items.map((i) => [i.rank, i.of])).toEqual([
      [1, 3],
      [3, 3],
    ]);
    expect(res.warnings).toContain("Skipped 1 malformed /v2/insights result");
  });

  it("raises invalid_response when the container shape is wrong", async () => {
    const { s } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights": { body: { results: { nope: 1 } } } });
    const brand = await resolveBrand(s);
    const err = await insights(s, "artist", { seedRefs: [brand.ref] }).catch((e: unknown) => e);
    expect((err as QlooError).kind).toBe("invalid_response");
  });

  it("raises invalid_response when every item is invalid", async () => {
    const { s } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights": { body: { results: { entities: [{ name: "no id" }] } } } });
    const brand = await resolveBrand(s);
    const err = await insights(s, "artist", { seedRefs: [brand.ref] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect((err as QlooError).kind).toBe("invalid_response");
  });
});

describe("taste analysis, demographics and compare", () => {
  it("turns urn:tag results into tag evidence", async () => {
    const { s } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights:urn:tag": { body: F.tasteBody } });
    const brand = await resolveBrand(s);
    const res = await tasteAnalysis(s, { seedRefs: [brand.ref], tagTypes: ["urn:tag:keyword:media"] });
    expect(res.filterType).toBe("urn:tag");
    expect(res.items[0]).toMatchObject({ entity: { kind: "tag", qlooId: "urn:tag:keyword:fixture_trail" }, affinity: 0.99, popularity: 0.3 });
    expect(res.items[1]?.affinity).toBeUndefined();
    expect(res.items[1]?.missing).toEqual(["affinity", "popularity"]);
  });

  it("copies demographic affinities verbatim", async () => {
    const { s } = sessionWith({ "/search": { body: F.searchBody }, "/v2/insights:urn:demographics": { body: F.demographicsBody } });
    const brand = await resolveBrand(s);
    const res = await demographics(s, { seedRefs: [brand.ref] });
    expect(res.profiles[0]).toMatchObject({ qlooId: F.ID.brandA, ref: brand.ref, gender: { male: 0.05, female: -0.05 } });
    expect(res.profiles[0]?.age["30_to_34"]).toBe(0.3);
  });

  it("exposes compare scores as experimental, outside the ledger", async () => {
    const { s } = sessionWith({ "/search": { body: F.searchBody }, "/v2/analysis/compare": { body: F.compareBody } });
    const brand = await resolveBrand(s);
    const before = s.ledger.size;
    const res = await compare(s, { aRefs: [brand.ref], bRefs: [brand.ref] });
    expect(res.items[0]).toMatchObject({ name: "Fixture Shared", score: 2.5 });
    expect(res.scoreNote).toMatch(/undocumented/);
    expect(s.ledger.size).toBe(before);
  });
});

describe("audience lift (Sondo heuristic)", () => {
  it("computes rank movement against the baseline and flags new entries", async () => {
    const { s } = sessionWith({ "/search": { body: F.searchBody } });
    const brand = await resolveBrand(s);
    const t = sessionWith({ "/v2/insights": { body: F.insightsTargetBody } });
    t.s.refs.mint({ kind: "entity", qlooId: brand.qlooId, name: brand.name, sourceCallId: "x" });
    const target = await insights(t.s, "artist", { seedRefs: ["ref_e1"] });
    const b = sessionWith({ "/v2/insights": { body: F.insightsBaselineBody } });
    b.s.refs.mint({ kind: "entity", qlooId: brand.qlooId, name: brand.name, sourceCallId: "x" });
    const baseline = await insights(b.s, "artist", { seedRefs: ["ref_e1"], variant: "baseline" });

    const lift = computeLift(target.items, baseline.items);
    expect(lift).toEqual([
      { qlooId: F.ID.artist1, targetRank: 1, baselineRank: 2, lift: 1, newInTarget: false },
      { qlooId: F.ID.artist2, targetRank: 2, baselineRank: 4, lift: 2, newInTarget: true },
      { qlooId: F.ID.artist3, targetRank: 3, baselineRank: 3, lift: 0, newInTarget: false },
    ]);
  });
});
