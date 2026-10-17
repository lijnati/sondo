import { describe, expect, it } from "vitest";

import { parseBrief, type BriefInput } from "@/lib/agent/brief";
import { clampPlan, fallbackPlan, MAX_RESOLVES } from "@/lib/agent/plan";
import type { ResearchPlanDraft } from "@/lib/agent/schemas";

const briefInput: BriefInput = {
  brandName: "Fixture Footwear",
  brandDescription: "A fictional sustainable sneaker brand for city walkers.",
  audience: { description: "Culturally engaged young adults", ages: ["25_to_29", "30_to_34"] },
  market: "New York City",
  objective: "launch",
  anchors: [{ name: "Fixture Brand Alpha", type: "brand" }, { name: "Fixture Artist One" }],
  constraints: { excludeCategories: ["book"] },
};

const draft: ResearchPlanDraft = {
  anchors: [
    { name: "fixture artist one", type: "artist", alternateTypes: ["person"] },
    { name: "Invented Anchor", type: "brand", alternateTypes: [] },
  ],
  peerBrands: ["Fixture Peer"],
  ages: ["24_and_younger"],
  gender: "female",
  categories: ["artist", "book", "podcast", "artist", "tv_show", "brand", "place", "movie"],
  researchQuestions: ["What do they watch?"],
  notModeled: ["income"],
  rationale: "synthetic",
};

describe("brief validation", () => {
  it("accepts a minimal brief and applies defaults", () => {
    const b = parseBrief({ ...briefInput, anchors: undefined, constraints: undefined });
    expect(b.anchors).toEqual([]);
    expect(b.constraints.excludeCategories).toEqual([]);
  });

  it.each([
    ["unknown age bucket", { audience: { description: "x y z", ages: ["18_to_24"] } }],
    ["too many anchors", { anchors: Array.from({ length: 7 }, (_, i) => ({ name: `A${i}` })) }],
    ["unknown objective", { objective: "sales" }],
    ["empty market", { market: " " }],
    ["non-binary gender value Qloo cannot model", { audience: { description: "x y z", gender: "other" } }],
  ])("rejects %s", (_label, patch) => {
    expect(() => parseBrief({ ...briefInput, ...patch })).toThrow();
  });
});

describe("clampPlan", () => {
  const brief = parseBrief(briefInput);
  const plan = clampPlan(draft, brief);

  it("keeps brief anchors, takes types from the draft, and ignores invented anchors", () => {
    const names = plan.anchors.map((a) => [a.name, a.role, a.types.join("|")]);
    expect(names).toContainEqual(["Fixture Artist One", "anchor", "artist"]);
    expect(names).toContainEqual(["Fixture Brand Alpha", "anchor", "brand"]);
    expect(plan.anchors.find((a) => a.name === "Invented Anchor")).toBeUndefined();
    expect(plan.adjustments.join(" ")).toMatch(/Invented Anchor/);
  });

  it("tries the brand itself first and caps total resolutions", () => {
    expect(plan.anchors[0]).toMatchObject({ name: "Fixture Footwear", role: "brand", types: ["brand"] });
    expect(plan.anchors.length).toBeLessThanOrEqual(MAX_RESOLVES);
  });

  it("uses the brief's ages, not the model's, and never invents gender", () => {
    expect(plan.ages).toEqual(["25_to_29", "30_to_34"]);
    expect(plan.gender).toBeUndefined();
    expect(plan.adjustments.join(" ")).toMatch(/gender/i);
  });

  it("dedupes categories, removes exclusions and caps at five", () => {
    expect(plan.categories).toEqual(["artist", "podcast", "tv_show", "brand", "place"]);
  });

  it("always uses the brief's market as the location", () => {
    expect(plan.location).toBe("New York City");
  });

  it("fills categories when the draft gives too few", () => {
    const p = clampPlan({ ...draft, categories: ["book"] }, brief);
    expect(p.categories.length).toBeGreaterThanOrEqual(3);
    expect(p.categories).not.toContain("book");
  });

  it("infers ages from the draft only when the brief has none", () => {
    const p = clampPlan(draft, parseBrief({ ...briefInput, audience: { description: "Gen Z" } }));
    expect(p.ages).toEqual(["24_and_younger"]);
    expect(p.adjustments.join(" ")).toMatch(/inferred/i);
  });

  it("keeps gender only when the brief states it", () => {
    const p = clampPlan(draft, parseBrief({ ...briefInput, audience: { ...briefInput.audience, gender: "female" } }));
    expect(p.gender).toBe("female");
  });

  it("adds peers only when the brief has fewer than two anchors", () => {
    expect(plan.anchors.some((a) => a.role === "peer")).toBe(false);
    const p = clampPlan(draft, parseBrief({ ...briefInput, anchors: [] }));
    expect(p.anchors.filter((a) => a.role === "peer").map((a) => a.name)).toEqual(["Fixture Peer"]);
  });
});

describe("fallbackPlan", () => {
  it("builds a usable plan from the brief alone", () => {
    const p = fallbackPlan(parseBrief(briefInput));
    expect(p.source).toBe("fallback");
    expect(p.categories.length).toBeGreaterThanOrEqual(3);
    expect(p.categories).not.toContain("book");
    // Untyped anchor searches across categories in one call.
    expect(p.anchors.find((a) => a.name === "Fixture Artist One")?.types).toEqual([]);
  });
});
