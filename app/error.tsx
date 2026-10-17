"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Container } from "@/components/shared/layout";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";

// Next 16 error boundary props: `error` is unknown, recovery is `retry` (see next/dist/docs error.md).
export default function ErrorBoundary({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;

  return (
    <main id="main" className="flex-1">
      <Container className="py-16 md:py-24">
        <ErrorState
          title="Something went wrong"
          description="Sondo hit an unexpected problem loading this page. Trying again usually works."
          {...(digest ? { reference: digest } : {})}
          actions={
            <>
              <Button onClick={() => retry()}>Try again</Button>
              <Button asChild variant="secondary">
                <Link href="/">Home</Link>
              </Button>
            </>
          }
        />
      </Container>
    </main>
  );
}
