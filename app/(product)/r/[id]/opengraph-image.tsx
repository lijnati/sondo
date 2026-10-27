import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { OBJECTIVE_LABEL } from "@/lib/brief/labels";
import { getDb } from "@/lib/db/client";
import { getRun } from "@/lib/db/runs";
import { ledgerStats } from "@/lib/report/view";
import { isRunId } from "@/lib/runs/ids";
import { STALE_AFTER_MS } from "@/lib/runs/limits";

export const alt = "Sondo cultural intelligence report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#183D32";
const BUTTER = "#FFE46B";
const PAPER = "#F7F9F5";
const MEADOW = ["#2F5D3A", "#3B7044", "#4C8650", "#3B7044", "#2F5D3A", "#46804B"];

const asset = (p: string) => readFile(join(process.cwd(), "assets", p));

/**
 * Link preview for a report: brand, market, the three concept names and the ledger size.
 * Everything shown is read from the stored report; an unknown or unfinished run gets the
 * plain Sondo card. Status is printed as stored, so a partial report never looks complete.
 */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [semibold, regular, lockup] = await Promise.all([asset("fonts/Geist-SemiBold.ttf"), asset("fonts/Geist-Regular.ttf"), asset("sondo-lockup-white.svg")]);
  const logo = `data:image/svg+xml;base64,${lockup.toString("base64")}`;
  const row = isRunId(id) ? await getRun(getDb(), id, { staleAfterMs: STALE_AFTER_MS }).catch(() => null) : null;
  const r = row?.report ?? null;
  const stats = r ? ledgerStats(r) : null;
  const status = row?.status === "completed" ? "Complete" : row?.status === "partial" ? "Partial" : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INK, color: PAPER, fontFamily: "Geist" }}>
        <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, padding: "56px 72px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain img */}
            <img src={logo} height={44} width={172} alt="" />
            {status ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, color: status === "Complete" ? BUTTER : PAPER }}>
                <div style={{ width: 12, height: 12, borderRadius: 12, background: status === "Complete" ? BUTTER : PAPER }} />
                {status}
              </div>
            ) : null}
          </div>

          {r && row ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
              <div style={{ fontSize: 24, opacity: 0.75, letterSpacing: 2, textTransform: "uppercase" }}>Cultural intelligence report</div>
              <div style={{ fontSize: 84, fontWeight: 600, letterSpacing: -3, marginTop: 6, lineHeight: 1.02 }}>{r.brief.brandName}</div>
              <div style={{ display: "flex", fontSize: 30, opacity: 0.85, marginTop: 10 }}>
                {`${r.brief.market} · ${OBJECTIVE_LABEL[r.brief.objective]}`}
              </div>
              {r.concepts.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
                  {r.concepts.map((c) => (
                    <div key={c.angle} style={{ display: "flex", padding: "10px 20px", borderRadius: 999, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.25)", fontSize: 24 }}>
                      {c.name.length > 38 ? `${c.name.slice(0, 36)}…` : c.name}
                    </div>
                  ))}
                </div>
              ) : null}
              {stats ? (
                <div style={{ display: "flex", fontSize: 24, marginTop: 28, opacity: 0.9 }}>
                  {`Grounded in ${stats.results} Qloo results across ${stats.categories.length} categor${stats.categories.length === 1 ? "y" : "ies"}`}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 90 }}>
              <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: -3, lineHeight: 1.05 }}>Stop guessing what your audience loves.</div>
              <div style={{ fontSize: 30, opacity: 0.85, marginTop: 18 }}>Campaign concepts where every cultural claim traces to a Qloo result.</div>
            </div>
          )}
        </div>

        {/* A pixel meadow strip: the product's visual signature, drawn as flat blocks. */}
        <div style={{ display: "flex", height: 44 }}>
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} style={{ width: 40, height: 44 - (((i * 7) % 5) * 6), marginTop: ((i * 7) % 5) * 6, background: MEADOW[i % MEADOW.length] }} />
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist", data: regular, weight: 400, style: "normal" },
      ],
    },
  );
}
