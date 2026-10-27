import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppNav } from "@/components/app/app-nav";
import { RunLive } from "@/components/run/run-live";
import { getDb } from "@/lib/db/client";
import { getRun, listEvents } from "@/lib/db/runs";
import { isRunId } from "@/lib/runs/ids";
import { STALE_AFTER_MS } from "@/lib/runs/limits";

export const metadata: Metadata = { title: "Research replay", robots: { index: false } };

/**
 * A sped-up replay of a finished run's stored public events, labelled as a replay throughout.
 * It never starts research and never calls Qloo or the model. proxy.ts 404s unknown ids first;
 * a run that is still going redirects to its live view.
 */
export default async function ReplayPage({ params }: PageProps<"/r/[id]/replay">) {
  const { id } = await params;
  if (!isRunId(id)) notFound();
  const db = getDb();
  const row = await getRun(db, id, { staleAfterMs: STALE_AFTER_MS });
  if (!row) notFound();
  if (row.status === "running") redirect(`/r/${id}`);
  const events = await listEvents(db, id, -1);
  if (!row.report || !events.length) redirect(`/r/${id}`);

  return (
    <>
      <AppNav />
      <div className="m-container live-wrap">
        <RunLive runId={row.id} brandName={row.brief.brandName} replay={events} />
      </div>
    </>
  );
}
