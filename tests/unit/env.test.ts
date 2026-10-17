import { describe, expect, it } from "vitest";

import { parseServerEnv, QLOO_HACKATHON_HOST } from "@/lib/env/schema";

// Synthetic values only — never real credentials.
describe("parseServerEnv", () => {
  it("runs with no integrations configured", () => {
    const env = parseServerEnv({});
    expect(env.QLOO_API_KEY).toBeUndefined();
    expect(env.AI_GATEWAY_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.QLOO_BASE_URL).toBe(QLOO_HACKATHON_HOST);
  });

  it("treats blank values as unset", () => {
    const env = parseServerEnv({ QLOO_API_KEY: "  ", DATABASE_URL: "" });
    expect(env.QLOO_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("accepts the hackathon host with a trailing slash", () => {
    expect(parseServerEnv({ QLOO_BASE_URL: `${QLOO_HACKATHON_HOST}/` }).QLOO_BASE_URL).toBe(QLOO_HACKATHON_HOST);
  });

  it.each(["https://api.qloo.com", "https://staging.api.qloo.com", "http://hackathon.api.qloo.com"])(
    "rejects non-hackathon host %s",
    (url) => {
      expect(() => parseServerEnv({ QLOO_BASE_URL: url })).toThrow(/QLOO_BASE_URL/);
    },
  );

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://u:p@example.test/db" })).toThrow(/DATABASE_URL/);
  });

  it("accepts a postgres DATABASE_URL", () => {
    const url = "postgresql://user:pass@db.example.test/sondo";
    expect(parseServerEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it("never includes secret values in the error message", () => {
    const secret = "synthetic-secret-value-123";
    try {
      parseServerEnv({ QLOO_API_KEY: secret, QLOO_BASE_URL: "https://api.qloo.com" });
      expect.unreachable();
    } catch (e) {
      expect(String(e)).not.toContain(secret);
    }
  });
});
