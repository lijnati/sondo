import { describe, expect, it } from "vitest";

import {
  buildParams,
  ENDPOINT_ALLOWLIST,
  entityTypeFromUrn,
  FILTER_TYPE_URN,
  insightsAllowlist,
  toQueryString,
} from "@/lib/qloo/params";

describe("insights allowlists", () => {
  it("drops params unsupported for the filter.type and reports them", () => {
    const { params, dropped } = buildParams("/v2/insights", insightsAllowlist("artist"), {
      "filter.type": "urn:entity:artist",
      "filter.release_year.min": 2020, // movie/tv only
      "filter.location.query": "Austin", // place/destination only
      "signal.location.query": "Austin", // live-verified for entity types
    });
    expect(params).toEqual({ "filter.type": "urn:entity:artist", "signal.location.query": "Austin" });
    expect(dropped.sort()).toEqual(["filter.location.query", "filter.release_year.min"]);
  });

  it("allows place location filters only on place/destination", () => {
    expect(insightsAllowlist("place").has("filter.location.query")).toBe(true);
    expect(insightsAllowlist("destination").has("filter.geocode.country_code")).toBe(true);
    expect(insightsAllowlist("podcast").has("filter.location.query")).toBe(false);
  });

  it("keeps type-specific filters on their own types", () => {
    expect(insightsAllowlist("movie").has("filter.release_year.min")).toBe(true);
    expect(insightsAllowlist("book").has("filter.publication_year.max")).toBe(true);
    expect(insightsAllowlist("brand").has("filter.release_year.min")).toBe(false);
  });

  it("uses dedicated lists for taste analysis and demographics", () => {
    expect(insightsAllowlist("tag").has("filter.tag.types")).toBe(true);
    expect(insightsAllowlist("tag").has("filter.popularity.max")).toBe(false);
    expect([...insightsAllowlist("demographics")].sort()).toEqual(["filter.type", "signal.interests.entities", "signal.interests.tags"]);
  });

  it("does not share /search params with /v2/insights", () => {
    expect(ENDPOINT_ALLOWLIST["/search"].has("query")).toBe(true);
    expect(ENDPOINT_ALLOWLIST["/search"].has("filter.type")).toBe(false);
    expect(insightsAllowlist("artist").has("query")).toBe(false);
  });
});

describe("filter.type URNs", () => {
  it("maps Sondo types to Qloo URNs", () => {
    expect(FILTER_TYPE_URN.tv_show).toBe("urn:entity:tv_show");
    expect(FILTER_TYPE_URN.tag).toBe("urn:tag");
    expect(FILTER_TYPE_URN.demographics).toBe("urn:demographics");
  });

  it("parses entity URNs back, ignoring non-entity URNs", () => {
    expect(entityTypeFromUrn("urn:entity:podcast")).toBe("podcast");
    expect(entityTypeFromUrn("urn:tag")).toBeUndefined();
    expect(entityTypeFromUrn("urn:entity:videogame")).toBeUndefined();
    expect(entityTypeFromUrn(undefined)).toBeUndefined();
  });
});

describe("buildParams serialization", () => {
  it("comma-joins arrays, sorts keys and skips undefined/empty values", () => {
    const { params } = buildParams("/v2/insights", insightsAllowlist("artist"), {
      take: 10,
      "signal.interests.entities": ["b-id", "a-id"],
      "signal.demographics.age": [],
      "signal.demographics.gender": undefined,
      "filter.type": "urn:entity:artist",
    });
    expect(Object.keys(params)).toEqual(["filter.type", "signal.interests.entities", "take"]);
    expect(params["signal.interests.entities"]).toBe("b-id,a-id");
  });

  it("caps take per endpoint and floors at 1", () => {
    expect(buildParams("/v2/insights", insightsAllowlist("artist"), { take: 500 }).params.take).toBe("25");
    expect(buildParams("/v2/tags", ENDPOINT_ALLOWLIST["/v2/tags"], { take: 500 }).params.take).toBe("50");
    expect(buildParams("/v2/insights", insightsAllowlist("artist"), { take: 0 }).params.take).toBe("1");
  });

  it("serializes booleans and encodes reserved characters", () => {
    const { params } = buildParams("/v2/insights", insightsAllowlist("brand"), {
      "feature.explainability": true,
      "signal.location.query": "Lower East Side, New York & Co",
    });
    expect(toQueryString(params)).toBe(
      "feature.explainability=true&signal.location.query=Lower+East+Side%2C+New+York+%26+Co",
    );
  });
});
