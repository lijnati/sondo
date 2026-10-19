import Link from "next/link";

import { AppNav } from "@/components/app/app-nav";

export default function ReportNotFound() {
  return (
    <>
      <AppNav />
      <div className="m-container" style={{ padding: "64px 0 96px", maxWidth: 680 }}>
        <p className="eyebrow">404</p>
        <h1 className="report-title" style={{ fontSize: 44 }}>
          Report not found
        </h1>
        <p className="lede" style={{ marginTop: 14 }}>
          This report link doesn&apos;t match a stored report. It may have been mistyped, or the run never started.
        </p>
        <div className="form-actions">
          <Link href="/new" className="btn btn-butter">
            Build a cultural brief
          </Link>
          <Link href="/#featured" className="btn btn-sm btn-outline">
            Featured reports
          </Link>
        </div>
      </div>
    </>
  );
}
