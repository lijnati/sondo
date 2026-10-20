import { describe, expect, it } from "vitest";

import { citationIndex, claimBadge, distinctivenessPoints, findingsByStrength, ideaBadge, keyFindings, ledgerStats, liftRows, statusInfo } from "@/lib/report/view";

describe("claimBadge", () => {
  it("only calls an evidence claim with a direct or contextual citation supported", () => {
    expect(claimBadge({ kind: "evidence", support: "direct" }).kind).toBe("direct");
    expect(claimBadge({ kind: "evidence", support: "contextual" }).kind).toBe("contextual");
    expect(claimBadge({ kind: "evidence", support: "weak" }).kind).toBe("hypothesis");
    expect(claimBadge({ kind: "hypothesis", support: "direct" }).kind).toBe("hypothesis");
    expect(ideaBadge("weak").label).toBe("Creative idea");
  });
});

describe("ledgerStats", () => {
  it("counts results and distinct categories from the ledger", () => {
    const evidence = [{ query: { filterType: "urn:entity:artist" } }, { query: { filterType: "urn:entity:artist" } }, { query: { filterType: "urn:tag" } }];
    expect(ledgerStats({ evidence } as never)).toEqual({ results: 3, categories: ["Music artists", "Taste themes"] });
  });
});

describe("statusInfo", () => {
  it("explains non-complete states", () => {
    expect(statusInfo("completed", null).headline).toBeUndefined();
    expect(statusInfo("partial", null).tone).toBe("warn");
    expect(statusInfo("failed", "qloo_unauthorized").headline).toContain("data provider");
    expect(statusInfo("interrupted", "interrupted").label).toBe("Interrupted");
  });
});

describe("citationIndex", () => {
  it("lists where each evidence id is cited", () => {
    const idx = citationIndex({
      findings: [{ id: "F1", evidenceIds: ["E1"] }],
      opportunities: [],
      concepts: [
        {
          name: "Night Shift",
          culturalInsight: { evidenceIds: ["E1", "E2"] },
          claims: [{ evidenceIds: ["E2"] }],
          opportunities: [{ kind: "partnership", evidenceIds: ["E3"] }],
          textCitations: [],
        },
      ],
    } as never);
    expect(idx.get("E1")).toEqual(["Finding F1", "Night Shift: insight"]);
    expect(idx.get("E2")).toEqual(["Night Shift: insight", "Night Shift: claim"]);
    expect(idx.get("E3")).toEqual(["Night Shift: partnership"]);
  });
});

// Synthetic ledger items (fictional names) carrying only the fields the helpers read.
const item = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  entity: { kind: "entity", name: `Fictional ${id}` },
  query: { filterType: "urn:entity:artist", variant: "target" },
  rank: 1,
  of: 10,
  ...over,
});

describe("keyFindings", () => {
  const f = (id: string, strength: string, category: string, kind = "audience_lift") => ({ id, kind, strength, category, statement: id, evidenceIds: ["E1"] });
  it("leads with strong findings, spreads categories and skips weak or gap findings", () => {
    const out = keyFindings(
      [f("F1", "moderate", "artist"), f("F2", "strong", "artist"), f("F3", "strong", "artist"), f("F4", "strong", "podcast"), f("F5", "weak", "brand"), f("F6", "strong", "tv", "gap")] as never,
      3,
    );
    expect(out.map((x) => x.id)).toEqual(["F2", "F4", "F3"]);
  });

  it("groups findings by strength in a fixed order and drops empty groups", () => {
    const groups = findingsByStrength([f("F1", "weak", "a"), f("F2", "strong", "b")] as never);
    expect(groups.map((g) => g.strength)).toEqual(["strong", "weak"]);
  });
});

describe("liftRows", () => {
  it("derives the baseline rank from the stored lift and lists new items after movers", () => {
    const rows = liftRows([
      item("E1", { rank: 2, derived: { lift: 3 } }),
      item("E2", { rank: 1, derived: { lift: 7 } }),
      item("E3", { rank: 4, derived: { newInTarget: true, lift: 7 } }),
      item("E4", { rank: 5, derived: { lift: -2 } }),
      item("E5", { rank: 1, derived: { lift: 9 }, query: { filterType: "urn:entity:artist", variant: "baseline" } }),
    ] as never);
    expect(rows.map((r) => r.id)).toEqual(["E2", "E1", "E3"]);
    expect(rows[0]).toMatchObject({ targetRank: 1, baselineRank: 8, lift: 7, newInTarget: false });
    expect(rows[2]?.baselineRank).toBeUndefined();
  });
});

describe("distinctivenessPoints", () => {
  it("keeps only audience-query entities with popularity and a quadrant", () => {
    const pts = distinctivenessPoints([
      item("E1", { rank: 1, of: 11, popularity: 0.8, derived: { quadrant: "distinctive_fit" } }),
      item("E2", { rank: 11, of: 11, popularity: 0.99, derived: { quadrant: "weak_mainstream" } }),
      item("E3", { popularity: 0.5 }),
      item("E4", { derived: { quadrant: "long_tail" } }),
    ] as never);
    expect(pts.map((p) => [p.id, p.position])).toEqual([
      ["E1", 0],
      ["E2", 1],
    ]);
  });
});
