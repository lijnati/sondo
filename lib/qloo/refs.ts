import type { EntityType, RefId, ResolvedRef } from "./types";

/** Lowercase, strip accents and punctuation, collapse whitespace, drop a leading "the". */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");
}

/**
 * How well a Qloo result name matches what the user typed. `/search` never returns
 * empty for nonsense (spike), so anything below "close" must not be trusted as the
 * user's entity.
 */
export function matchConfidence(query: string, name: string): ResolvedRef["matchConfidence"] {
  const q = normalizeName(query);
  const n = normalizeName(name);
  if (!q || !n) return "weak";
  if (q === n) return "exact";
  const qt = new Set(q.split(" "));
  const nt = new Set(n.split(" "));
  const shared = [...qt].filter((t) => nt.has(t)).length;
  // Every query token present in the result name (e.g. "Bon Iver" → "Bon Iver (band)").
  if (shared === qt.size && n.startsWith(q)) return "close";
  const jaccard = shared / new Set([...qt, ...nt]).size;
  return jaccard >= 0.6 ? "close" : "weak";
}

const PREFIX: Record<ResolvedRef["kind"], string> = { entity: "e", tag: "t", audience: "a", locality: "l" };

/**
 * Mints `ref_*` handles for things Qloo actually returned. The LLM (Phase 2) only ever
 * sees refs, so it cannot reference an ID that no response contained.
 */
export class RefRegistry {
  private readonly byRef = new Map<RefId, ResolvedRef>();
  private readonly byKey = new Map<string, RefId>();
  private seq = 0;

  mint(input: {
    kind: ResolvedRef["kind"];
    qlooId: string;
    name: string;
    sourceCallId: string;
    entityType?: EntityType;
    popularity?: number;
    query?: string;
  }): ResolvedRef {
    const key = `${input.kind}:${input.qlooId}`;
    const existing = this.byKey.get(key);
    if (existing) return this.byRef.get(existing) as ResolvedRef;

    const ref: RefId = `ref_${PREFIX[input.kind]}${++this.seq}`;
    const resolved: ResolvedRef = {
      ref,
      kind: input.kind,
      qlooId: input.qlooId,
      name: input.name,
      matchConfidence: input.query === undefined ? "exact" : matchConfidence(input.query, input.name),
      sourceCallId: input.sourceCallId,
      ...(input.entityType ? { entityType: input.entityType } : {}),
      ...(input.popularity !== undefined ? { popularity: input.popularity } : {}),
    };
    this.byRef.set(ref, resolved);
    this.byKey.set(key, ref);
    return resolved;
  }

  get(ref: RefId): ResolvedRef | undefined {
    return this.byRef.get(ref);
  }

  /** Resolve refs to Qloo IDs, throwing on any ref this registry did not mint. */
  qlooIds(refs: readonly RefId[], kind?: ResolvedRef["kind"]): string[] {
    return refs.map((r) => {
      const found = this.byRef.get(r);
      if (!found) throw new Error(`Unknown ref ${r}`);
      if (kind && found.kind !== kind) throw new Error(`Ref ${r} is a ${found.kind}, expected ${kind}`);
      return found.qlooId;
    });
  }

  refForQlooId(qlooId: string): RefId | undefined {
    for (const [key, ref] of this.byKey) if (key.endsWith(`:${qlooId}`)) return ref;
    return undefined;
  }

  all(): ResolvedRef[] {
    return [...this.byRef.values()];
  }
}
