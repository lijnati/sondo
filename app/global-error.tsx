"use client";

import "./globals.css";

// Replaces the root layout when it fails, so it brings its own document and styles.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String(error.digest) : undefined;

  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center px-4">
        <title>Something went wrong · Sondo</title>
        <div role="alert" className="mx-auto flex max-w-xl flex-col items-start gap-4 border-l-2 border-neg pl-6">
          <h1 className="text-h2 font-semibold">Sondo is temporarily unavailable</h1>
          <p className="text-ink-2">An unexpected error stopped the page from loading. Please try again.</p>
          {digest ? <p className="font-mono text-meta text-ink-2">Reference {digest}</p> : null}
          <button
            type="button"
            onClick={() => retry()}
            className="h-10 rounded-sm bg-ink px-4 font-medium text-bg hover:bg-ink/85"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
