import { describe, expect, it } from "vitest";

import type { CampaignConcept, StrategyOutput } from "@/lib/agent/schemas";
import { checkStrategy, finalizeStrategy, textViolations, type ValidationContext } from "@/lib/agent/validate";
import { Ledger, type EvidenceDraft } from "@/lib/evidence/ledger";

// Synthetic ledger: fictional names only.
function ledgerWith(): Ledger {
  const l = new Ledger();
  const d = (name: string, qlooId: string, filterType: string, rank = 1): EvidenceDraft => ({
    callId: "Q1",
    query: { filterType, signalSummary: "synthetic", variant: "target", inputRefs: [] },
    entity: { kind: "entity", qlooId, name, type: filterType, tags: [] },
    rank,
    of: 10,
    affinity: 0.9,
    popularity: 0.5,
  });
  l.add([
    d("Fixture Artist One", "a1", "urn:entity:artist"), // E1
    d("Fixture Podcast", "p1", "urn:entity:podcast"), // E2
    d("Fixture Show", "t1", "urn:entity:tv_show"), // E3
    d("Fixture Cafe", "c1", "urn:entity:place"), // E4
    d("Fixture Label", "b1", "urn:entity:brand"), // E5
    d("2 Fixture Queens", "p2", "urn:entity:podcast"), // E6 (name contains a digit)
    d("Fixture Novel", "k1", "urn:entity:book"), // E7
    d("Fixture Film", "m1", "urn:entity:movie"), // E8
    d("Fixture Artist One", "a1", "urn:entity:artist", 3), // E9 (same entity, baseline)
  ]);
  return l;
}

const ctx = (): ValidationContext => ({ ledger: ledgerWith(), findingIds: new Set(["F1", "F2"]), requireThree: true });

function concept(angle: CampaignConcept["angle"], ids: string[], patch: Partial<CampaignConcept> = {}): CampaignConcept {
  return {
    angle,
    name: `Concept ${angle}`,
    positioning: "A positioning statement without numbers.",
    intendedAudience: "Young adults in the city",
    culturalInsight: { text: "This audience shows strong cultural affinity with the cited signals.", kind: "evidence", evidenceIds: ids.slice(0, 2) },
    concept: "A campaign idea built around shared cultural moments.",
    opportunities: [{ kind: "partnership", idea: "Co-create a limited series with a cited partner.", evidenceIds: ids.slice(0, 1) }],
    channels: ["social video"],
    claims: [{ text: "The cited items rank highly for this audience signal set.", kind: "evidence", evidenceIds: ids }],
    assumptions: ["Partners are open to collaboration."],
    risks: ["Affinity is not purchase intent."],
    ...patch,
  };
}

const good = (): StrategyOutput => ({
  opportunities: [{ title: "Podcast culture", rationale: { text: "Podcasts carry the signal.", kind: "evidence", evidenceIds: ["E2"] }, findingIds: ["F1"] }],
  concepts: [
    concept("mainstream_anchor", ["E1", "E3", "E5"]),
    concept("distinctive_niche", ["E2", "E4", "E7"]),
    concept("cross_category_bridge", ["E6", "E8", "E4"]),
  ],
});

describe("textViolations", () => {
  const names = ["Fixture Artist One", "2 Fixture Queens"];
  it.each([
    ["a percentage", "Reaches 73% of the audience", "numeric"],
    ["a bare number", "Over 3 million fans", "numeric"],
    ["the word percent", "Fifty percent of them", "numeric"],
    ["ROI language", "Delivers strong ROI", "forbidden_phrase"],
    ["purchase intent", "Shows clear purchase intent", "forbidden_phrase"],
    ["guarantees", "This is guaranteed to work", "forbidden_phrase"],
    ["conversion talk", "Drives conversions in-store", "forbidden_phrase"],
  ])("flags %s", (_l, text, code) => {
    expect(textViolations(text, names).map((v) => v.code)).toContain(code);
  });

  it.each([
    "Affinity is not purchase intent.",
    "This does not guarantee results.",
    "We measure resonance rather than conversions.",
  ])("allows the honest caveat %j", (text) => {
    expect(textViolations(text, names)).toEqual([]);
  });

  it("still flags an assertion that follows an unrelated negation sentence", () => {
    expect(textViolations("No gimmicks. This drives conversions.", names).map((v) => v.code)).toContain("forbidden_phrase");
  });

  it("allows years and digits inside known entity names", () => {
    expect(textViolations("Since 2019, fans of 2 Fixture Queens gather here", names)).toEqual([]);
  });
});

describe("checkStrategy", () => {
  it("passes a well-grounded, differentiated strategy", () => {
    expect(checkStrategy(good(), ctx())).toEqual([]);
  });

  it("flags fabricated evidence ids", () => {
    const s = good();
    s.concepts[0]!.claims[0]!.evidenceIds = ["E1", "E999"];
    expect(checkStrategy(s, ctx())).toContainEqual(expect.objectContaining({ code: "unknown_evidence", path: "concepts[0].claims[0]" }));
  });

  it("flags evidence claims with no citations", () => {
    const s = good();
    s.concepts[1]!.claims[0] = { text: "This audience loves skate culture.", kind: "evidence", evidenceIds: [] };
    expect(checkStrategy(s, ctx()).map((v) => v.code)).toContain("missing_citation");
  });

  it("flags ledger entities mentioned without a citation", () => {
    const s = good();
    s.concepts[2]!.claims[0] = { text: "Fixture Podcast hosts are natural partners.", kind: "hypothesis", evidenceIds: [] };
    expect(checkStrategy(s, ctx()).map((v) => v.code)).toContain("uncited_entity");
  });

  it("flags duplicate angles and fewer than three concepts", () => {
    const s = good();
    s.concepts[2]!.angle = "mainstream_anchor";
    expect(checkStrategy(s, ctx()).map((v) => v.code)).toContain("duplicate_angle");
    const t = good();
    t.concepts = t.concepts.slice(0, 2);
    expect(checkStrategy(t, ctx()).map((v) => v.code)).toContain("too_few_concepts");
  });

  it("flags concepts that cite largely the same entities", () => {
    const s = good();
    s.concepts[1] = concept("distinctive_niche", ["E1", "E3", "E5"]);
    expect(checkStrategy(s, ctx()).map((v) => v.code)).toContain("overlap");
  });

  it("counts the same Qloo entity cited via different E# as overlap", () => {
    const s = good();
    s.concepts[1] = concept("distinctive_niche", ["E9", "E3", "E5"]); // E9 is E1's entity
    expect(checkStrategy(s, ctx()).map((v) => v.code)).toContain("overlap");
  });

  it("flags unknown finding ids and partnership ideas without evidence", () => {
    const s = good();
    s.opportunities[0]!.findingIds = ["F9"];
    s.concepts[0]!.opportunities[0]!.evidenceIds = [];
    const codes = checkStrategy(s, ctx()).map((v) => v.code);
    expect(codes).toContain("unknown_finding");
    expect(codes).toContain("opportunity_without_evidence");
  });

  it("flags numbers hidden in non-claim fields", () => {
    const s = good();
    s.concepts[0]!.positioning = "Reach 2 million New Yorkers";
    expect(checkStrategy(s, ctx())).toContainEqual(expect.objectContaining({ code: "numeric", path: "concepts[0].positioning" }));
  });
});

describe("finalizeStrategy", () => {
  it("auto-attaches a unique entity citation and reports it", () => {
    const s = good();
    s.concepts[2]!.claims[0] = { text: "Fixture Podcast hosts are natural partners.", kind: "hypothesis", evidenceIds: [] };
    const r = finalizeStrategy(s, ctx());
    expect(r.concepts[2]!.claims[0]!.evidenceIds).toEqual(["E2"]);
    expect(r.summary.citationsAutoAttached).toBe(1);
  });

  it("drops fabricated ids and downgrades an unsupported evidence claim to a hypothesis", () => {
    const s = good();
    s.concepts[0]!.claims[0] = { text: "The audience gathers around underground supper clubs.", kind: "evidence", evidenceIds: ["E404"] };
    const r = finalizeStrategy(s, ctx());
    expect(r.concepts[0]!.claims[0]).toMatchObject({ kind: "hypothesis", evidenceIds: [] });
    expect(r.summary.downgradedToHypothesis).toBe(1);
  });

  it("removes claims with invented statistics instead of keeping them", () => {
    const s = good();
    s.concepts[1]!.claims.push({ text: "Sixty percent of fans will buy within a week.", kind: "evidence", evidenceIds: ["E2"] });
    const r = finalizeStrategy(s, ctx());
    expect(r.concepts[1]!.claims.map((c) => c.text).join(" ")).not.toMatch(/percent|will buy/);
    expect(r.summary.removed).toBeGreaterThanOrEqual(1);
  });

  it("scrubs offending sentences from free text", () => {
    const s = good();
    s.concepts[0]!.concept = "A neighborhood film night. It will deliver 40% more sales.";
    const r = finalizeStrategy(s, ctx());
    expect(r.concepts[0]!.concept).toBe("A neighborhood film night.");
  });

  it("drops partnership ideas with no valid evidence", () => {
    const s = good();
    s.concepts[0]!.opportunities.push({ kind: "partnership", idea: "Partner with an unnamed influencer.", evidenceIds: ["E77"] });
    const r = finalizeStrategy(s, ctx());
    expect(r.concepts[0]!.opportunities).toHaveLength(1);
  });

  it("labels grounding from distinct citations and categories", () => {
    const s = good();
    s.concepts[1] = concept("distinctive_niche", ["E2"], {
      culturalInsight: { text: "A hunch about the audience.", kind: "hypothesis", evidenceIds: [] },
    });
    s.concepts[2] = concept("cross_category_bridge", [], {
      culturalInsight: { text: "A hunch.", kind: "hypothesis", evidenceIds: [] },
      opportunities: [{ kind: "creative", idea: "A mural.", evidenceIds: [] }],
      claims: [{ text: "A hunch.", kind: "hypothesis", evidenceIds: [] }],
    });
    const r = finalizeStrategy(s, ctx());
    expect(r.concepts.map((c) => c.grounding)).toEqual(["grounded", "partial", "insufficient_evidence"]);
    expect(r.concepts[0]!.citedCategories.sort()).toEqual(["artist", "brand", "tv_show"]);
  });

  it("never lets an evidence claim survive without a valid citation", () => {
    const s = good();
    s.concepts.forEach((c) => c.claims.push({ text: "Unsupported assertion.", kind: "evidence", evidenceIds: [] }));
    const r = finalizeStrategy(s, ctx());
    for (const c of r.concepts) {
      for (const cl of [c.culturalInsight, ...c.claims]) {
        if (cl.kind === "evidence") expect(cl.evidenceIds.length).toBeGreaterThan(0);
      }
    }
  });
});
