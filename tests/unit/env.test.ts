import { afterEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv, QLOO_HACKATHON_HOST } from "@/lib/env/schema";

// `server-only` throws outside the React server runtime; stub it for unit tests.
vi.mock("server-only", () => ({}));

describe("requireEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws a key-free error when QLOO_API_KEY is missing", async () => {
    vi.stubEnv("QLOO_API_KEY", "");
    const { requireEnv } = await import("@/lib/env/server");
    expect(() => requireEnv("QLOO_API_KEY")).toThrow("QLOO_API_KEY is not configured");
  });

  it("returns the key when configured", async () => {
    vi.stubEnv("QLOO_API_KEY", "synthetic-key");
    const { requireEnv } = await import("@/lib/env/server");
    expect(requireEnv("QLOO_API_KEY")).toBe("synthetic-key");
  });
});

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

describe("agent model env", () => {
  it("defaults to the free model and a $0.15 run cap", () => {
    const env = parseServerEnv({});
    expect(env.SONDO_MODEL).toBe("nvidia/nemotron-3.5-lightning-free");
    expect(env.SONDO_RUN_COST_LIMIT_USD).toBe(0.15);
    expect(env.SONDO_MODEL_INPUT_USD_PER_MTOK).toBeUndefined();
  });

  it("treats empty numeric/model vars as unset, not zero", () => {
    const env = parseServerEnv({ SONDO_RUN_COST_LIMIT_USD: "", SONDO_MODEL: " ", SONDO_MODEL_OUTPUT_USD_PER_MTOK: "" });
    expect(env.SONDO_RUN_COST_LIMIT_USD).toBe(0.15);
    expect(env.SONDO_MODEL).toBe("nvidia/nemotron-3.5-lightning-free");
    expect(env.SONDO_MODEL_OUTPUT_USD_PER_MTOK).toBeUndefined();
  });

  it("accepts overrides and rejects malformed model ids and absurd caps", () => {
    const env = parseServerEnv({ SONDO_MODEL: "openai/gpt-5-mini", SONDO_RUN_COST_LIMIT_USD: "0.05", SONDO_MODEL_INPUT_USD_PER_MTOK: "0.25" });
    expect(env).toMatchObject({ SONDO_MODEL: "openai/gpt-5-mini", SONDO_RUN_COST_LIMIT_USD: 0.05, SONDO_MODEL_INPUT_USD_PER_MTOK: 0.25 });
    expect(() => parseServerEnv({ SONDO_MODEL: "gpt5-mini" })).toThrow(/SONDO_MODEL/);
    expect(() => parseServerEnv({ SONDO_RUN_COST_LIMIT_USD: "50" })).toThrow(/SONDO_RUN_COST_LIMIT_USD/);
  });
});

describe("run settings", () => {
  it("defaults to live runs on with conservative caps", () => {
    const env = parseServerEnv({});
    expect(env.SONDO_LIVE_RUNS).toBe("on");
    expect(env.SONDO_RUNS_PER_IP_PER_DAY).toBe(5);
    expect(env.SONDO_DAILY_RUN_CAP).toBe(40);
    expect(env.SONDO_MAX_CONCURRENT_RUNS).toBe(2);
    expect(env.SONDO_IP_HASH_SECRET).toBeUndefined();
  });

  it("accepts the kill switch and bounded caps", () => {
    const env = parseServerEnv({ SONDO_LIVE_RUNS: "off", SONDO_DAILY_RUN_CAP: "10", SONDO_MAX_CONCURRENT_RUNS: "3" });
    expect(env.SONDO_LIVE_RUNS).toBe("off");
    expect(env.SONDO_DAILY_RUN_CAP).toBe(10);
    expect(env.SONDO_MAX_CONCURRENT_RUNS).toBe(3);
  });

  it.each([["SONDO_LIVE_RUNS", "maybe"], ["SONDO_MAX_CONCURRENT_RUNS", "50"], ["SONDO_DAILY_RUN_CAP", "-1"], ["SONDO_IP_HASH_SECRET", "too-short"]])("rejects %s=%s", (k, v) => {
    expect(() => parseServerEnv({ [k]: v })).toThrow(new RegExp(k));
  });

  it("never echoes a secret value in errors", () => {
    expect(() => parseServerEnv({ SONDO_IP_HASH_SECRET: "short-secret-xyz" })).toThrow(expect.objectContaining({ message: expect.not.stringContaining("short-secret-xyz") }));
  });
});
