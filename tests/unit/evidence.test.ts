import { describe, expect, it } from "vitest";

import { Ledger, type EvidenceDraft } from "@/lib/evidence/ledger";
import { assignQuadrants, overlap } from "@/lib/evidence/lift";
import { matchConfidence, normalizeName, RefRegistry } from "@/lib/qloo/refs";

const draft = (qlooId: string, rank: number, of: number, popularity?: number): EvidenceDraft => ({
  callId: "Q1",
  query: { filterType: "urn:entity:artist", signalSummary: "synthetic", variant: "target", inputRefs: [] },
  entity: { kind: "entity", qlooId, name: qlooId, type: "urn:entity:artist", tags: [] },
  rank,
  of,
  ...(popularity !== undefined ? { popularity } : {}),
});

describe("Ledger", () => {
  it("assigns stable sequential E# ids across additions", () => {
    const l = new Ledger();
    const a = l.add([draft("a", 1, 2), draft("b", 2, 2)]);
    const b = l.add([draft("c", 1, 1)]);
    expect([...a, ...b].map((i) => i.id)).toEqual(["E1", "E2", "E3"]);
    expect(l.get("E3")?.entity.qlooId).toBe("c");
    expect(l.get("E9")).toBeUndefined();
  });

  it("stores derived values separately from Qloo fields", () => {
    const l = new Ledger();
    const [item] = l.add([draft("a", 1, 1, 0.5)]);
    l.derive(item!.id, { lift: 3 });
    expect(l.get("E1")).toMatchObject({ popularity: 0.5, derived: { lift: 3 } });
  });
});

describe("quadrants and overlap (Sondo heuristic)", () => {
  it("uses rank half and an absolute popularity threshold", () => {
    const l = new Ledger();
    const items = l.add([draft("a", 1, 4, 0.99), draft("b", 2, 4, 0.2), draft("c", 3, 4, 0.95), draft("d", 4, 4, 0.1)]);
    const q = assignQuadrants(items);
    expect(Object.fromEntries(q)).toEqual({
      E1: "mainstream_fit",
      E2: "distinctive_fit",
      E3: "weak_mainstream",
      E4: "long_tail",
    });
  });

  it("does not call a 0.99-popularity item distinctive just because its list is mainstream", () => {
    const l = new Ledger();
    const q = assignQuadrants(l.add([draft("a", 1, 4, 0.995), draft("b", 2, 4, 0.99), draft("c", 3, 4, 0.998), draft("d", 4, 4, 0.997)]));
    expect([...q.values()]).toEqual(["mainstream_fit", "mainstream_fit", "weak_mainstream", "weak_mainstream"]);
  });

  it("assigns nothing when popularity is unavailable", () => {
    const l = new Ledger();
    expect(assignQuadrants(l.add([draft("a", 1, 1)])).size).toBe(0);
  });

  it("measures list overlap", () => {
    const l = new Ledger();
    const a = l.add([draft("x", 1, 2), draft("y", 2, 2)]);
    const b = l.add([draft("y", 1, 2), draft("z", 2, 2)]);
    expect(overlap(a, b)).toBe(0.5);
    expect(overlap(a, [])).toBe(0);
  });
});

describe("ref matching", () => {
  it("normalizes names", () => {
    expect(normalizeName("  The Café & Bar! ")).toBe("cafe and bar");
  });

  it.each([
    ["Fixture Brand", "Fixture Brand", "exact"],
    ["fixture brand", "FIXTURE BRAND!", "exact"],
    ["Fixture Band", "Fixture Band (US)", "close"],
    ["Fixture Brand Alpha", "Fixture Brand Alpha Beta", "close"],
    ["Sondo Test Brand Zzqx", "Unrelated Famous Brand", "weak"],
  ] as const)("%s vs %s → %s", (q, n, expected) => {
    expect(matchConfidence(q, n)).toBe(expected);
  });

  it("dedupes refs by Qloo id and rejects unknown or wrong-kind refs", () => {
    const r = new RefRegistry();
    const a = r.mint({ kind: "entity", qlooId: "id-1", name: "A", sourceCallId: "Q1" });
    const again = r.mint({ kind: "entity", qlooId: "id-1", name: "A", sourceCallId: "Q2" });
    expect(again.ref).toBe(a.ref);
    const t = r.mint({ kind: "tag", qlooId: "urn:tag:x", name: "X", sourceCallId: "Q3" });
    expect(r.qlooIds([a.ref])).toEqual(["id-1"]);
    expect(() => r.qlooIds([t.ref], "entity")).toThrow(/expected entity/);
    expect(() => r.qlooIds(["ref_e404"])).toThrow(/Unknown ref/);
  });
});
