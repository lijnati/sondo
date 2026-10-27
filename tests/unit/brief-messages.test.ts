import { describe, expect, it } from "vitest";

import { Brief } from "@/lib/agent/brief";
import { readableSignals } from "@/lib/brief/labels";
import { briefErrors } from "@/lib/brief/messages";

const valid = {
  brandName: "Fixture Footwear",
  brandDescription: "A fictional sustainable sneaker brand for city walkers.",
  audience: { description: "Young adults", ages: ["25_to_29"] },
  market: "New York City",
  objective: "launch",
};

const errorsFor = (input: unknown) => {
  const r = Brief.safeParse(input, { reportInput: true });
  return r.success ? {} : briefErrors(r.error);
};

describe("briefErrors", () => {
  it("accepts a valid brief", () => {
    expect(errorsFor(valid)).toEqual({});
  });

  it("explains each field in plain English", () => {
    const e = errorsFor({
      ...valid,
      brandName: " ",
      brandDescription: "short",
      audience: { description: "Young adults", ages: ["25_to_29", "30_to_34", "35_to_44", "45_to_54"] },
      objective: "growth",
      anchors: Array.from({ length: 7 }, (_, i) => ({ name: `Anchor ${i}` })),
    });
    expect(e).toEqual({
      brandName: "Brand name is required.",
      brandDescription: "Brand description needs at least 10 characters.",
      "audience.ages": "Age buckets: choose at most 3.",
      objective: "Choose a valid option for goal.",
      anchors: "Cultural anchors: choose at most 6.",
    });
  });

  it("reports missing required fields", () => {
    expect(errorsFor({ ...valid, market: undefined }).market).toBe("Market is required.");
    expect(errorsFor({ ...valid, market: "" }).market).toBe("Market is required.");
    expect(errorsFor({ ...valid, market: "X" }).market).toBe("Market needs at least 2 characters.");
  });
});

describe("readableSignals", () => {
  it("turns stored age bucket keys into display labels and leaves the rest alone", () => {
    expect(readableSignals("Fixture Hotel One · ages 35_to_44, 24_and_younger · in Lisbon")).toBe("Fixture Hotel One · ages 35–44, 24 and younger · in Lisbon");
    expect(readableSignals("in Austin")).toBe("in Austin");
  });
});
