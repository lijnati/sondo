import { describe, expect, it } from "vitest";

import { citationIndex, claimBadge, ideaBadge, ledgerStats, statusInfo } from "@/lib/report/view";

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
