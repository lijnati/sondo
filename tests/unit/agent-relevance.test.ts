import { describe, expect, it } from "vitest";

import { buildRelevanceIndex, checkCitations, claimSupport } from "@/lib/agent/relevance";
import { Ledger, type EvidenceDraft } from "@/lib/evidence/ledger";

// Synthetic stand-ins shaped like the Phase 2 Lisbon run (fictional names).
function ledger() {
  const l = new Ledger();
  const entity = (name: string, filterType: string, tags: string[] = []): EvidenceDraft => ({
    callId: "Q1",
    query: { filterType, signalSummary: "s", variant: "target", inputRefs: [] },
    entity: { kind: "entity", qlooId: name, name, type: filterType, tags: tags.map((t) => ({ id: `urn:tag:${t}`, name: t })) },
    rank: 1,
    of: 10,
  });
  const theme = (name: string): EvidenceDraft => ({
    callId: "Q2",
    query: { filterType: "urn:tag", signalSummary: "s", variant: "target", inputRefs: [] },
    entity: { kind: "tag", qlooId: `urn:tag:${name}`, name, type: "urn:tag:keyword", tags: [] },
    rank: 1,
    of: 10,
  });
  l.add([
    entity("Fixture Loop Artist", "urn:entity:artist", ["Indie", "Experimental"]), // E1 (the tUnE-yArDs stand-in)
    theme("Architecture"), // E2
    entity("Fixture Hotel Group", "urn:entity:brand", ["Hotel", "Design"]), // E3 (Sydell Group stand-in)
    entity("Fixture Talk Show", "urn:entity:podcast", ["Comedy"]), // E4
    theme("Home & Garden"), // E5
    entity("Fixture Bakery", "urn:entity:place", ["Bakery"]), // E6
  ]);
  return buildRelevanceIndex(l.all());
}

describe("citation relevance", () => {
  // Regression: Phase 2 live Lisbon run — a creative idea about the "Architecture taste theme"
  // cited an artist. The citation existed and the entity was retrieved, but it did not
  // support the claim.
  it("flags a theme claim that cites an unrelated artist, and suggests the theme's evidence", () => {
    const r = checkCitations("Lobby displays that visualise the Architecture taste theme, tying the hotel's spatial design to the theme.", ["E1"], ledger());
    expect(r.checks).toEqual([expect.objectContaining({ evidenceId: "E1", level: "mismatch" })]);
    expect(r.checks[0]?.reason).toMatch(/Architecture/);
    expect(r.suggested).toEqual(["E2"]);
  });

  it("rates a citation whose entity is named as direct", () => {
    const r = checkCitations("An artist residency with Fixture Loop Artist.", ["E1"], ledger());
    expect(r.checks[0]?.level).toBe("direct");
  });

  it("rates a citation as contextual when the text names its category", () => {
    expect(checkCitations("A sponsored slot on a comedy podcast about the city.", ["E4"], ledger()).checks[0]?.level).toBe("contextual");
  });

  it("rates a citation as contextual when the text names one of its Qloo tags", () => {
    expect(checkCitations("Visual assets drawn from the Hotel and Design world.", ["E3"], ledger()).checks[0]?.level).toBe("contextual");
  });

  it("accepts a theme claim that cites the theme itself", () => {
    expect(checkCitations("Visuals inspired by the Home & Garden taste theme.", ["E5"], ledger()).checks[0]?.level).toBe("direct");
  });

  it("flags a category claim when no cited item is in that category", () => {
    const r = checkCitations("A pop-up at a neighborhood bakery and cafe.", ["E1"], ledger());
    expect(r.checks[0]?.level).toBe("mismatch");
  });

  it("does not treat ordinary words as theme mentions without a theme cue", () => {
    // "hotel" alone is the brief's subject, not a claim about the Hotel tag.
    expect(checkCitations("Live music nights at the hotel rooftop with Fixture Loop Artist.", ["E1"], ledger()).checks[0]?.level).toBe("direct");
  });

  it("marks a citation with no textual link as unlinked", () => {
    expect(checkCitations("Travellers seek authentic moments.", ["E4"], ledger()).checks[0]?.level).toBe("unlinked");
  });

  it("summarizes claim support from its citations", () => {
    expect(claimSupport([{ evidenceId: "E1", level: "direct", reason: "" }, { evidenceId: "E4", level: "unlinked", reason: "" }])).toBe("direct");
    expect(claimSupport([{ evidenceId: "E4", level: "contextual", reason: "" }])).toBe("contextual");
    expect(claimSupport([{ evidenceId: "E4", level: "unlinked", reason: "" }])).toBe("weak");
    expect(claimSupport([])).toBe("weak");
  });
});
