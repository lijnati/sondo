/**
 * SYNTHETIC Qloo response fixtures. Fictional names and fake UUIDs only — shaped like the
 * live key-paths recorded by the spike/probe, but containing no Qloo data. Never paste
 * real responses here (hackathon rule: no Qloo data in public repos).
 */

export const ID = {
  brandA: "00000000-0000-4000-8000-00000000000a",
  brandB: "00000000-0000-4000-8000-00000000000b",
  artist1: "00000000-0000-4000-8000-000000000101",
  artist2: "00000000-0000-4000-8000-000000000102",
  artist3: "00000000-0000-4000-8000-000000000103",
  artist4: "00000000-0000-4000-8000-000000000104",
} as const;

export const searchBody = {
  results: [
    {
      entity_id: ID.brandA,
      name: "Fixture Brand Alpha",
      types: ["urn:entity:brand"],
      popularity: 0.91,
      tags: [{ tag_id: "urn:tag:keyword:fixture_outdoors", name: "Fixture Outdoors", type: "urn:tag:keyword" }],
      properties: { description: "synthetic" },
    },
  ],
};

export const tagsBody = {
  success: true,
  duration: 12,
  results: { tags: [{ id: "urn:tag:genre:fixture_folk", name: "Fixture Folk", type: "urn:tag:genre", popularity: 0.4, parents: [{ type: "urn:tag" }] }] },
};

export const audiencesBody = {
  success: true,
  results: { audiences: [{ id: "urn:audience:fixture:hikers", entity_id: "x", name: "Fixture Hikers", type: "urn:audience:hobbies_and_interests", parents: [] }] },
};

export const audienceTypesBody = {
  success: true,
  results: { audience_types: [{ type: "urn:audience:hobbies_and_interests", parents: [] }, { type: "urn:audience:life_stage" }] },
};

const artist = (id: string, name: string, affinity: number | undefined, popularity: number | undefined) => ({
  entity_id: id,
  name,
  type: "urn:entity",
  subtype: "urn:entity:artist",
  ...(popularity !== undefined ? { popularity } : {}),
  query: {
    ...(affinity !== undefined ? { affinity } : {}),
    measurements: { audience_growth: 0 },
  },
  tags: [{ id: "urn:tag:genre:fixture_folk", name: "Fixture Folk", type: "urn:tag:genre" }],
  properties: { image: { url: "https://example.test/img.jpg" } },
});

/** Target query: 3 artists; the 3rd has no affinity and no popularity (must stay missing). */
export const insightsTargetBody = {
  success: true,
  results: {
    entities: [
      artist(ID.artist1, "Fixture Artist One", 0.97, 0.95),
      artist(ID.artist2, "Fixture Artist Two", 0.95, 0.42),
      { ...artist(ID.artist3, "Fixture Artist Three", undefined, undefined), tags: [], properties: {} },
    ],
  },
};

/** Baseline: artist2 is absent, artist4 new. */
export const insightsBaselineBody = {
  success: true,
  results: {
    entities: [
      artist(ID.artist4, "Fixture Artist Four", 0.96, 0.99),
      artist(ID.artist1, "Fixture Artist One", 0.95, 0.95),
      artist(ID.artist3, "Fixture Artist Three", 0.9, 0.3),
    ],
  },
};

export const explainBody = {
  success: true,
  results: {
    entities: [
      {
        ...artist(ID.artist1, "Fixture Artist One", 0.97, 0.95),
        query: { affinity: 0.97, explainability: { signal: { interests: { entities: [{ entity_id: ID.brandA, score: 0.8 }] } } } },
      },
    ],
  },
};

export const emptyInsightsBody = { success: true, results: { entities: [] } };

export const tasteBody = {
  success: true,
  results: {
    tags: [
      { tag_id: "urn:tag:keyword:fixture_trail", name: "Fixture Trail", subtype: "urn:tag:keyword:media", tag_value: "x", types: ["urn:entity:movie"], popularity: 0.3, query: { affinity: 0.99 } },
      { tag_id: "urn:tag:keyword:fixture_camp", name: "Fixture Camp", subtype: "urn:tag:keyword:media", tag_value: "y", types: [], query: {} },
    ],
  },
};

export const demographicsBody = {
  success: true,
  results: {
    demographics: [
      {
        entity_id: ID.brandA,
        query: {
          age: { "24_and_younger": -0.2, "25_to_29": 0.1, "30_to_34": 0.3, "35_to_44": 0.2, "45_to_54": -0.1, "55_and_older": -0.4 },
          gender: { male: 0.05, female: -0.05 },
        },
      },
    ],
  },
};

export const compareBody = {
  duration: 5,
  results: { tags: [{ tag_id: "urn:tag:keyword:fixture_shared", name: "Fixture Shared", subtype: "urn:tag:keyword", type: "urn:tag", popularity: 0.5, query: { score: 2.5 } }] },
};
