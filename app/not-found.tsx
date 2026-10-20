import Link from "next/link";

import { AppNav } from "@/components/app/app-nav";
import { MeadowShell } from "@/components/app/meadow-shell";
import { PageState } from "@/components/shared/states";

export default function NotFound() {
  return (
    <MeadowShell>
      <AppNav />
      <PageState
        eyebrow="404"
        title="Page not found"
        actions={
          <>
            <Link href="/new" className="btn btn-butter">
              Build a cultural brief <span className="i" aria-hidden="true">→</span>
            </Link>
            <Link href="/" className="btn btn-sm btn-outline">
              Home
            </Link>
          </>
        }
      >
        <p className="lede">There&apos;s nothing at this address.</p>
      </PageState>
    </MeadowShell>
  );
}
