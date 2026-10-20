"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { createContext, useContext, useState, type ReactNode } from "react";

/** The slice of an EvidenceItem the drawer shows. Values are copied from the ledger. */
export interface EvidenceView {
  id: string;
  name: string;
  category: string;
  kind: "entity" | "tag";
  rank: number;
  of: number;
  affinity?: number;
  popularity?: number;
  lift?: number;
  newInTarget?: boolean;
  quadrant?: string;
  variant: string;
  signalSummary: string;
  tags: string[];
  citedIn: string[];
}

const QUADRANT: Record<string, string> = {
  mainstream_fit: "Mainstream fit",
  distinctive_fit: "Distinctive fit",
  weak_mainstream: "Weak / mainstream",
  long_tail: "Long tail",
};

const VARIANT: Record<string, string> = {
  target: "Audience query (ages and market)",
  baseline: "Baseline query (market only)",
  deepen: "Adaptive follow-up query",
};

const Ctx = createContext<{ byId: Map<string, EvidenceView>; open: (id: string) => void } | null>(null);

export function EvidenceProvider({ items, children }: { items: EvidenceView[]; children: ReactNode }) {
  const [byId] = useState(() => new Map(items.map((i) => [i.id, i])));
  const [openId, setOpenId] = useState<string | null>(null);
  const item = openId ? byId.get(openId) : undefined;
  // Portal into the meadow root so its scoped styles apply. Only reached after a click.
  const container = item ? document.querySelector<HTMLElement>(".marketing") : null;

  return (
    <Ctx.Provider value={{ byId, open: setOpenId }}>
      {children}
      <Dialog.Root open={!!item} onOpenChange={(o) => !o && setOpenId(null)}>
        <Dialog.Portal container={container ?? undefined}>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content className="drawer" aria-describedby={undefined}>
            {item ? (
              <>
                <div className="drawer-head">
                  <p className="eyebrow">
                    Evidence <span className="drawer-id">{item.id}</span> · {item.category}
                  </p>
                  <Dialog.Close className="drawer-x" aria-label="Close">
                    ×
                  </Dialog.Close>
                </div>
                <Dialog.Title className="drawer-title">{item.name}</Dialog.Title>
                <div className="rank-meter" aria-hidden="true">
                  <span className="rank-meter-fill" style={{ width: `${((item.of - item.rank + 1) / item.of) * 100}%` }} />
                </div>
                <p className="rank-meter-cap tabular">
                  #{item.rank} of {item.of} in this Qloo query
                </p>
                <dl>
                  <dt>Qloo affinity</dt>
                  <dd className="tabular">{item.affinity !== undefined ? `${item.affinity} (normalised within this query; not a probability)` : "Not returned by Qloo"}</dd>
                  <dt>Popularity</dt>
                  <dd className="tabular">{item.popularity !== undefined ? `${item.popularity} percentile (0–1, Qloo)` : "Not returned by Qloo"}</dd>
                  {item.lift !== undefined || item.newInTarget ? (
                    <>
                      <dt>Audience lift</dt>
                      <dd className="tabular">
                        {item.newInTarget ? "New in the audience query (absent from the baseline)" : `${item.lift! > 0 ? "▲" : item.lift! < 0 ? "▼" : ""}${Math.abs(item.lift!)} places vs. baseline`} · Sondo heuristic
                      </dd>
                    </>
                  ) : null}
                  {item.quadrant ? (
                    <>
                      <dt>Distinctiveness</dt>
                      <dd>{QUADRANT[item.quadrant] ?? item.quadrant} · Sondo heuristic</dd>
                    </>
                  ) : null}
                  <dt>Query</dt>
                  <dd>
                    {VARIANT[item.variant] ?? item.variant}
                    <br />
                    <span className="muted">{item.signalSummary}</span>
                  </dd>
                  {item.tags.length ? (
                    <>
                      <dt>Qloo tags</dt>
                      <dd>{item.tags.join(", ")}</dd>
                    </>
                  ) : null}
                </dl>
                <p className="eyebrow" style={{ marginTop: 22 }}>
                  Cited in
                </p>
                {item.citedIn.length ? (
                  <ul className="cited-in">
                    {item.citedIn.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted" style={{ fontSize: 14 }}>
                    Not cited in a claim. It is part of the research ledger.
                  </p>
                )}
                <Dialog.Close className="btn btn-sm btn-outline" style={{ marginTop: 24 }}>
                  Close
                </Dialog.Close>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Ctx.Provider>
  );
}

/** An E# citation. Opens the evidence drawer. Unknown ids render as plain, inert text. */
export function EvChip({ id, showName = false }: { id: string; showName?: boolean }) {
  const ctx = useContext(Ctx);
  const item = ctx?.byId.get(id);
  if (!ctx || !item) return <span className="pill muted-pill">{id}</span>;
  return (
    <button type="button" className="ev" onClick={() => ctx.open(id)} aria-label={`Evidence ${id}: ${item.name}, ${item.category}, rank ${item.rank} of ${item.of}`}>
      {id}
      {showName ? <span className="ev-name">{item.name}</span> : null}
    </button>
  );
}
