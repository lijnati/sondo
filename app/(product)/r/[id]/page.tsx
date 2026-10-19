import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { AppNav } from "@/components/app/app-nav";
import { ReportView } from "@/components/report/report-view";
import { RunLive } from "@/components/run/run-live";
import { getDb } from "@/lib/db/client";
import { getRun, listEvents } from "@/lib/db/runs";
import { statusInfo } from "@/lib/report/view";
import { isRunId } from "@/lib/runs/ids";
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
        <div className="m-container" style={{ padding: "32px 0 64px" }}>
          <RunLive runId={row.id} brandName={row.brief.brandName} initialEvents={events} startedAt={row.startedAt} />
        </div>
      </>
    );
  }

  if (!row.report) {
    const info = statusInfo(row.status, row.failureCode);
    const progress = summarizeRun(await listEvents(getDb(), row.id, -1));
    const reached = progress.stages.filter((s) => s.status === "done").length;
    return (
      <>
        <AppNav />
        <div className="m-container" style={{ padding: "48px 0 80px", maxWidth: 720 }}>
          <p className="eyebrow">Run {row.id}</p>
          <h1 className="report-title" style={{ fontSize: 40 }}>
            {row.brief.brandName}: no report
          </h1>
          <div className={`notice ${info.tone}`} role="alert" style={{ marginTop: 20 }}>
            <p>
              <strong>{info.label}.</strong> {info.headline}
              {reached ? ` It completed ${reached} of 5 stages before stopping.` : ""}
            </p>
          </div>
          <div className="form-actions">
            <Link href="/new" className="btn btn-butter">
              Start a new brief
            </Link>
            <Link href="/#featured" className="btn btn-sm btn-outline">
              Featured reports
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AppNav />
      <ReportView report={row.report} status={row.status} failureCode={row.failureCode} createdAt={row.createdAt} featured={row.featured} />
    </>
  );
}
