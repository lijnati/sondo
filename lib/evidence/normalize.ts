/**
 * Schema-validated Qloo results → evidence drafts. Invariants (ARCHITECTURE.md §4):
 * affinity and popularity are copied verbatim or left undefined — never computed,
 * estimated, or defaulted — and anything missing is listed in `missing`.
 */
import type { z } from "zod";

import type { InsightsDemographics, InsightsEntity, InsightsTag } from "@/lib/qloo/schemas";
import type { RefRegistry } from "@/lib/qloo/refs";
import type { AgeBucket, RefId } from "@/lib/qloo/types";

import type { EvidenceDraft } from "./ledger";
import type { DemographicProfile, EvidenceVariant, MissingField } from "./types";

export interface NormalizeContext {
  callId: string;
  /** Qloo's original 1-based positions and list length (items may have been skipped). */
  positions?: number[];
  total?: number;
  filterType: string;
  variant: EvidenceVariant;
  signalSummary: string;
  inputRefs: RefId[];
  refs: RefRegistry;
}

function missingFields(fields: Record<MissingField, boolean>): MissingField[] | undefined {
  const missing = (Object.keys(fields) as MissingField[]).filter((k) => !fields[k]);
  return missing.length ? missing : undefined;
}

export function normalizeEntities(items: z.output<typeof InsightsEntity>[], ctx: NormalizeContext): EvidenceDraft[] {
  return items.map((it, i) => {
    const affinity = it.query?.affinity;
    const imageUrl = it.properties?.image?.url;
    const explain = it.query?.explainability
      ?.map((e) => ({ ref: ctx.refs.refForQlooId(e.entity_id), contribution: e.score }))
      .filter((e): e is { ref: RefId; contribution: number } => e.ref !== undefined);

    return {
      callId: ctx.callId,
      query: { filterType: ctx.filterType, signalSummary: ctx.signalSummary, variant: ctx.variant, inputRefs: ctx.inputRefs },
      entity: {
        kind: "entity",
        qlooId: it.entity_id,
        name: it.name,
        type: it.subtype ?? ctx.filterType,
        ...(imageUrl ? { imageUrl } : {}),
        tags: it.tags.map((t) => ({ id: t.id, name: t.name })),
      },
      rank: ctx.positions?.[i] ?? i + 1,
      of: ctx.total ?? items.length,
      ...(affinity !== undefined ? { affinity } : {}),
      ...(it.popularity !== undefined ? { popularity: it.popularity } : {}),
      ...(explain?.length ? { explainability: explain } : {}),
      ...withMissing({
        affinity: affinity !== undefined,
        popularity: it.popularity !== undefined,
        tags: it.tags.length > 0,
        image: Boolean(imageUrl),
      }),
    };
  });
}

/** Taste analysis (filter.type=urn:tag) results become tag evidence. */
export function normalizeTags(items: z.output<typeof InsightsTag>[], ctx: NormalizeContext): EvidenceDraft[] {
  return items.map((it, i) => {
    const affinity = it.query?.affinity;
    return {
      callId: ctx.callId,
      query: { filterType: ctx.filterType, signalSummary: ctx.signalSummary, variant: ctx.variant, inputRefs: ctx.inputRefs },
      entity: { kind: "tag", qlooId: it.tag_id, name: it.name, type: it.subtype ?? "urn:tag", tags: [] },
      rank: ctx.positions?.[i] ?? i + 1,
      of: ctx.total ?? items.length,
      ...(affinity !== undefined ? { affinity } : {}),
      ...(it.popularity !== undefined ? { popularity: it.popularity } : {}),
      ...withMissing({ affinity: affinity !== undefined, popularity: it.popularity !== undefined, tags: true, image: true }),
    };
  });
}

function withMissing(fields: Record<MissingField, boolean>): { missing?: MissingField[] } {
  const missing = missingFields(fields);
  return missing ? { missing } : {};
}

export function normalizeDemographics(
  items: z.output<typeof InsightsDemographics>[],
  callId: string,
  refs: RefRegistry,
): DemographicProfile[] {
  return items.map((it) => {
    const age: Partial<Record<AgeBucket, number>> = {};
    for (const [bucket, v] of Object.entries(it.query.age ?? {})) {
      if (typeof v === "number") age[bucket as AgeBucket] = v;
    }
    const gender: DemographicProfile["gender"] = {};
    if (it.query.gender?.male !== undefined) gender.male = it.query.gender.male;
    if (it.query.gender?.female !== undefined) gender.female = it.query.gender.female;
    const ref = refs.refForQlooId(it.entity_id);
    return { callId, qlooId: it.entity_id, ...(ref ? { ref } : {}), age, gender };
  });
}
