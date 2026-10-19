/** Private Postgres Qloo cache against in-process Postgres. Synthetic bodies only. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PgQlooCache } from "@/lib/db/qloo-cache";
import type { Db } from "@/lib/db/sql";

import { testDb } from "../fixtures/db";

let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  ({ db, close } = await testDb());
});
afterAll(async () => close());

describe("PgQlooCache", () => {
  it("stores, overwrites and expires entries", async () => {
    const cache = new PgQlooCache(db);
    expect(await cache.get("k1")).toBeUndefined();
    await cache.set("k1", { results: [{ name: "Fixture" }] });
    await cache.set("k1", { results: [{ name: "Fixture 2" }] });
    expect(await cache.get("k1")).toEqual({ results: [{ name: "Fixture 2" }] });
    await db.query("update qloo_cache set fetched_at = now() - interval '8 days' where key = 'k1'");
    expect(await cache.get("k1")).toBeUndefined();
  });

  it("degrades to a miss when the database fails", async () => {
    const broken: Db = { query: () => Promise.reject(new Error("down")), transaction: () => Promise.reject(new Error("down")) };
    const cache = new PgQlooCache(broken);
    expect(await cache.get("k")).toBeUndefined();
    await expect(cache.set("k", {})).resolves.toBeUndefined();
  });
});

describe("PgQlooCache timeouts", () => {
  it("treats a hanging database as a miss within the time cap", async () => {
    const hanging: Db = { query: () => new Promise(() => {}), transaction: () => new Promise(() => {}) };
    const cache = new PgQlooCache(hanging, 50);
    const t0 = Date.now();
    expect(await cache.get("k")).toBeUndefined();
    await cache.set("k", {});
    expect(Date.now() - t0).toBeLessThan(1_000);
  });
});
