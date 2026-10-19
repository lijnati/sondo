import Link from "next/link";

/** Light top bar for report and run pages (the brief page uses the sky hero nav). */
export function AppNav() {
  return (
    <header className="app-nav">
      <Link href="/" className="brand" aria-label="Sondo home">
        <span className="brand-mark" aria-hidden="true" />
        Sondo
      </Link>
      <nav aria-label="Primary">
        <Link href="/#featured">Featured reports</Link>
        <Link href="/new" className="btn btn-sm btn-butter">
          New brief
        </Link>
      </nav>
    </header>
  );
}
