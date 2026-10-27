import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AppNav } from "@/components/app/app-nav";
import { ReportView } from "@/components/report/report-view";
import { RunLive } from "@/components/run/run-live";
import { PageState } from "@/components/shared/states";
import { getDb } from "@/lib/db/client";
import { getContrast } from "@/lib/db/contrasts";
import { getRun, listEvents } from "@/lib/db/runs";
import { statusInfo } from "@/lib/report/view";
import { isRunId } from "@/lib/runs/ids";
import { STAGE_LABEL } from "@/lib/runs/labels";
import { STALE_AFTER_MS } from "@/lib/runs/limits";
import { summarizeRun } from "@/lib/runs/progress";

// Deduped per request: generateMetadata and the page share one read.
const load = cache(async (id: string) => {
  if (!isRunId(id)) return null;
  return getRun(getDb(), id, { staleAfterMs: STALE_AFTER_MS });
});

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const { id } = await params;
  const row = await load(id).catch(() => null);
  if (!row) return { title: "Report not found", robots: { index: false } };
  return {
    title: `${row.brief.brandName} · ${row.brief.market}`,
    description: `Sondo cultural intelligence report for ${row.brief.brandName} in ${row.brief.market}, grounded in Qloo results.`,
    // Only featured reports are meant to be found; other reports are shared by link.
    robots: { index: row.featured, follow: row.featured },
  };
}

/**
 * Run → report permalink. proxy.ts already 404s unknown ids before streaming starts;
 * notFound() here is the fallback. A running row renders the live view, which resumes
 * from the stored events; a finished row renders the stored, validated report.
 */
export default async function ReportPage({ params }: PageProps<"/r/[id]">) {
  const { id } = await params;
  const row = await load(id);
  if (!row) notFound();

  if (row.status === "running") {
    const events = await listEvents(getDb(), row.id, -1);
    return (
      <>
        <AppNav />
        <div className="m-container live-wrap">
          <RunLive runId={row.id} brandName={row.brief.brandName} initialEvents={events} startedAt={row.startedAt} />
        </div>
      </>
    );
  }

  if (!row.report) {
    const info = statusInfo(row.status, row.failureCode);
    const progress = summarizeRun(await listEvents(getDb(), row.id, -1));
    return (
      <>
        <AppNav />
        <PageState
          eyebrow={`Run ${row.id}`}
          tone={info.tone === "bad" ? "bad" : "warn"}
          title={
            <>
              {row.brief.brandName}: <em>no report</em>
            </>
          }
          actions={
            <>
              <Link href="/new" className="btn btn-butter">
                Start a new brief <span className="i" aria-hidden="true">→</span>
              </Link>
              <Link href="/#featured" className="btn btn-sm btn-outline">
                Featured reports
              </Link>
            </>
          }
        >
          <div className={`notice ${info.tone}`}>
            <p>
              <strong>{info.label}.</strong> {info.headline}
            </p>
          </div>
          <ol className="stage-recap" aria-label="Stages this run reached">
            {progress.stages.map((s) => (
              <li key={s.stage} data-status={s.status}>
                <span className="dot" aria-hidden="true" />
                <span>{STAGE_LABEL[s.stage]}</span>
                <span className="muted">{s.status === "done" ? "Done" : s.status === "skipped" || s.status === "pending" ? "Not reached" : "Stopped here"}</span>
              </li>
            ))}
          </ol>
          <p className="muted" style={{ marginTop: 14, fontSize: 14 }}>
            Nothing from this run is shown as a finding, because no validated report was saved.
          </p>
        </PageState>
      </>
    );
  }

  // Optional extra: a missing table or row must never break the report.
  const contrast = await getContrast(getDb(), row.id).catch(() => null);
  return (
    <>
      <AppNav />
      <ReportView report={row.report} status={row.status} failureCode={row.failureCode} createdAt={row.createdAt} featured={row.featured} contrast={contrast} />
    </>
  );
}
