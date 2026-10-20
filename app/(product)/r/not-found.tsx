import Link from "next/link";

import { AppNav } from "@/components/app/app-nav";
import { PageState } from "@/components/shared/states";

export default function ReportNotFound() {
  return (
    <>
      <AppNav />
      <PageState
        eyebrow="404"
        title="Report not found"
        actions={
          <>
            <Link href="/new" className="btn btn-butter">
              Build a cultural brief <span className="i" aria-hidden="true">→</span>
            </Link>
            <Link href="/#featured" className="btn btn-sm btn-outline">
              Featured reports
            </Link>
          </>
        }
      >
        <p className="lede">This report link doesn&apos;t match a stored report. It may have been mistyped, or the run never started.</p>
      </PageState>
    </>
  );
}
