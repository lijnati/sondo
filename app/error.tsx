"use client";

import Link from "next/link";
import { useEffect } from "react";

import { AppNav } from "@/components/app/app-nav";
import { MeadowShell } from "@/components/app/meadow-shell";
import { PageState } from "@/components/shared/states";

// Next 16 error boundary props: `error` is unknown, recovery is `retry` (see next/dist/docs error.md).
export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;

  return (
    <MeadowShell>
      <AppNav />
      <PageState
        eyebrow="Error"
        tone="bad"
        title="Something went wrong"
        {...(digest ? { reference: digest } : {})}
        actions={
          <>
            <button type="button" className="btn btn-butter" onClick={() => retry()}>
              Try again
            </button>
            <Link href="/" className="btn btn-sm btn-outline">
              Home
            </Link>
          </>
        }
      >
        <p className="lede">Sondo hit an unexpected problem loading this page. Trying again usually works.</p>
      </PageState>
    </MeadowShell>
  );
}
