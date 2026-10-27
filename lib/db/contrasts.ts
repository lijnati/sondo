/** Typed access to `report_contrasts`. Rows are parsed with Zod on the way out. */
import { StoredContrast } from "@/lib/contrast/contrast";

import type { Db } from "./sql";

export async function saveContrast(db: Db, runId: string, contrast: StoredContrast): Promise<void> {
  await db.query(
    `insert into report_contrasts (run_id, contrast) values ($1, $2::jsonb)
     on conflict (run_id) do update set contrast = excluded.contrast, created_at = now()`,
    [runId, JSON.stringify(StoredContrast.parse(contrast))],
  );
}

/** The stored contrast, or null when none exists or the row no longer validates. */
export async function getContrast(db: Db, runId: string): Promise<StoredContrast | null> {
  const rows = await db.query<{ contrast: unknown }>("select contrast from report_contrasts where run_id = $1", [runId]);
  const raw = rows[0]?.contrast;
  if (raw === undefined) return null;
  const parsed = StoredContrast.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);
  return parsed.success ? parsed.data : null;
}
