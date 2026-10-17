/** Campaign brief: the agent's only user input (PRODUCT.md §4). Validated at the boundary. */
import { z } from "zod";

import { AGE_BUCKETS, ENTITY_TYPES } from "@/lib/qloo/types";

export const EntityTypeEnum = z.enum(ENTITY_TYPES);
export const AgeBucketEnum = z.enum(AGE_BUCKETS);

export const OBJECTIVES = ["awareness", "consideration", "launch", "partnership", "market_entry"] as const;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const Brief = z.object({
  brandName: text(1, 80),
  brandDescription: text(10, 600),
  audience: z.object({
    description: text(3, 400),
    /** Only Qloo's six buckets can be modeled; anything else belongs in `description`. */
    ages: z.array(AgeBucketEnum).max(3).optional(),
    /** Set only when the brief states it; Qloo models binary gender only. */
    gender: z.enum(["male", "female"]).optional(),
  }),
  /** City or region, passed to Qloo as a locality query. Name cities precisely (e.g. "New York City"). */
  market: text(2, 80),
  objective: z.enum(OBJECTIVES),
  /** Things the audience is known to love. Type is optional; unknown types search across categories. */
  anchors: z
    .array(z.object({ name: text(1, 80), type: EntityTypeEnum.optional() }))
    .max(6)
    .default([]),
  constraints: z
    .object({
      excludeCategories: z.array(EntityTypeEnum).max(9).default([]),
      tone: text(1, 120).optional(),
      notes: text(1, 400).optional(),
    })
    .default({ excludeCategories: [] }),
});

export type Brief = z.infer<typeof Brief>;
export type BriefInput = z.input<typeof Brief>;

export function parseBrief(input: unknown): Brief {
  return Brief.parse(input);
}
