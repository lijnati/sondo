/** report_contrasts against in-process Postgres (PGlite) with the real migrations. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StoredContrast } from "@/lib/contrast/contrast";
import { getContrast, saveContrast } from "@/lib/db/contrasts";
import type { Db } from "@/lib/db/sql";

import { testDb } from "../fixtures/db";

let db: Db;
let close: () => Promise<void>;
const id = "Fixture00Run";

beforeAll(async () => {
  ({ db, close } = await testDb());
  await db.query("insert into runs (id, status, brief) values ($1, 'failed', '{}'::jsonb)", [id]);
});
afterAll(() => close());

const contrast: StoredContrast = {
  model: "mock/model",
  generatedAt: "2026-10-27T00:00:00.000Z",
  plain: [{ name: "Fixture Star", category: "artist", evidenceId: null, fromBrief: false }],
  sondoOnly: [{ evidenceId: "E2", name: "Fixture Podcast", category: "urn:entity:podcast" }],
};

describe("report contrasts", () => {
  it("returns null when none is stored", async () => {
    expect(await getContrast(db, "NoSuchRun001")).toBeNull();
  });

  it("stores, reads back and replaces a contrast", async () => {
    await saveContrast(db, id, contrast);
    expect(await getContrast(db, id)).toEqual(contrast);
    await saveContrast(db, id, { ...contrast, plain: [] });
    expect((await getContrast(db, id))?.plain).toEqual([]);
  });

  it("refuses an invalid contrast", async () => {
    await expect(saveContrast(db, id, { ...contrast, sondoOnly: [{ evidenceId: "not-an-id", name: "x", category: "y" }] })).rejects.toThrow();
  });
});
