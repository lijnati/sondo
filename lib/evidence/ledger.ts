import type { EvidenceId, EvidenceItem } from "./types";

export type EvidenceDraft = Omit<EvidenceItem, "id">;

/**
 * Run-scoped evidence store. IDs (E1, E2 …) are assigned here, in insertion order,
 * and are stable for the run. Drafts come only from normalize().
 */
export class Ledger {
  private readonly items: EvidenceItem[] = [];

  add(drafts: readonly EvidenceDraft[]): EvidenceItem[] {
    return drafts.map((d) => {
      const item: EvidenceItem = { id: `E${this.items.length + 1}`, ...d };
      this.items.push(item);
      return item;
    });
  }

  get(id: EvidenceId): EvidenceItem | undefined {
    const n = Number(id.slice(1));
    return Number.isInteger(n) && n >= 1 ? this.items[n - 1] : undefined;
  }

  /** Attach a Sondo-derived value (lift, quadrant). Qloo fields stay untouched. */
  derive(id: EvidenceId, derived: NonNullable<EvidenceItem["derived"]>): void {
    const item = this.get(id);
    if (item) item.derived = { ...item.derived, ...derived };
  }

  all(): readonly EvidenceItem[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }
}
