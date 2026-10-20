/** Display labels for brief values. Client-safe. */
import type { OBJECTIVES } from "@/lib/agent/brief";
import type { AgeBucket, EntityType } from "@/lib/qloo/types";

export const AGE_LABEL: Record<AgeBucket, string> = {
  "24_and_younger": "24 and younger",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55 and older",
};

export const CATEGORY_LABEL: Record<EntityType, string> = {
  artist: "Music artists",
  book: "Books",
  brand: "Brands",
  destination: "Destinations",
  movie: "Film",
  person: "People",
  place: "Places",
  podcast: "Podcasts",
  tv_show: "TV",
};

export const OBJECTIVE_LABEL: Record<(typeof OBJECTIVES)[number], string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  launch: "Launch",
  partnership: "Partnership",
  market_entry: "Market entry",
};

/** "urn:entity:podcast" | "podcast" | "urn:tag" → a readable category name. */
export function categoryLabel(value: string): string {
  const key = value.replace(/^urn:entity:/, "");
  if (key in CATEGORY_LABEL) return CATEGORY_LABEL[key as EntityType];
  if (key === "urn:tag" || key === "taste" || key === "taste themes" || key.startsWith("urn:tag")) return "Taste themes";
  if (key === "urn:demographics" || key === "demographics") return "Demographics";
  return key.replace(/_/g, " ");
}

export const FIELD_LABEL: Record<string, string> = {
  brandName: "Brand name",
  brandDescription: "Brand description",
  audience: "Audience",
  "audience.description": "Audience description",
  "audience.ages": "Age buckets",
  "audience.gender": "Gender",
  market: "Market",
  objective: "Goal",
  anchors: "Cultural anchors",
  "constraints.excludeCategories": "Excluded categories",
  "constraints.tone": "Tone",
  "constraints.notes": "Notes",
};
