import { describe, expect, it } from "vitest";

import { buildContrast, normalizeName, PlainPicks, StoredContrast } from "@/lib/contrast/contrast";

// Synthetic: fictional names, fake ids.
const ev = (id: string, name: string, type = "urn:entity:artist", kind: "entity" | "tag" = "entity") => ({ id, entity: { kind, name, type, qlooId: `q-${id}` } });

const report = {
  brief: { anchors: [{ name: "Anchor Artist" }], market: "Fixture City" },
  evidence: [
    ev("E1", "The Fixture Band"),
    ev("E2", "Fixture Podcast®", "urn:entity:podcast"),
    ev("E3", "Café Example", "urn:entity:place"),
    ev("E4", "Fixture Theme", "urn:tag:keyword", "tag"),
    ev("E5", "Uncited Brand", "urn:entity:brand"),
    ev("E6", "Fixture City", "urn:entity:destination"),
    ev("E7", "Anchor Artist"),
  ],
  findings: [{ id: "F1", evidenceIds: ["E5"] }],
  opportunities: [],
  concepts: [
    {
      name: "One",
      culturalInsight: { evidenceIds: ["E1", "E4", "E6", "E7"] },
      claims: [{ evidenceIds: ["E2"] }],
      opportunities: [{ kind: "partnership", evidenceIds: ["E3"] }],
      textCitations: [],
    },
  ],
} as never;

const meta = { model: "mock/model", generatedAt: "2026-10-27T00:00:00.000Z" };

describe("normalizeName", () => {
  it("ignores case, accents, punctuation, a leading 'the' and trademark marks", () => {
    expect(normalizeName("The Fixture Band")).toBe("fixture band");
    expect(normalizeName("Fixture Podcast®")).toBe(normalizeName("fixture podcast"));
    expect(normalizeName("Café Example")).toBe("cafe example");
    expect(normalizeName("A & B")).toBe("a and b");
  });
});

describe("buildContrast", () => {
  it("matches plain picks to the ledger by name and lists what only Sondo found", () => {
    const c = buildContrast(
      report,
      [
        { name: "fixture band", category: "artist" },
        { name: "Generic Famous Star", category: "artist" },
        { name: "The Fixture Band", category: "artist" }, // duplicate after normalising
        { name: "anchor artist", category: "artist" }, // repeats the brief
      ],
      meta,
    );
    expect(c.plain).toEqual([
      { name: "fixture band", category: "artist", evidenceId: "E1", fromBrief: false },
      { name: "Generic Famous Star", category: "artist", evidenceId: null, fromBrief: false },
      { name: "anchor artist", category: "artist", evidenceId: "E7", fromBrief: true },
    ]);
    // Concept-cited entities the plain LLM missed; tags, finding-only items, the brief's
    // anchors and its market are excluded.
    expect(c.sondoOnly.map((x) => x.evidenceId)).toEqual(["E2", "E3"]);
    expect(StoredContrast.parse(c)).toEqual(c);
  });

  it("never matches a taste tag as an entity", () => {
    const c = buildContrast(report, [{ name: "Fixture Theme", category: "brand" }], meta);
    expect(c.plain[0]!.evidenceId).toBeNull();
  });

  it("rejects model output with reasons, numbers fields or too many picks", () => {
    expect(PlainPicks.safeParse({ picks: Array.from({ length: 13 }, (_, i) => ({ name: `X${i}`, category: "brand" })) }).success).toBe(false);
    expect(PlainPicks.safeParse({ picks: [{ name: "X", category: "restaurant" }] }).success).toBe(false);
  });
});
