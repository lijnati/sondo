import Link from "next/link";

import { BrandLogo } from "@/components/shared/brand-logo";
import { GithubLink } from "@/components/shared/github-link";

/** Light top bar for report and run pages (the brief page uses the sky hero nav). */
export function AppNav() {
  return (
    <header className="app-nav">
      <Link href="/" className="brand" aria-label="Sondo home">
        <BrandLogo />
      </Link>
      <nav aria-label="Primary">
        <Link href="/#featured">Featured reports</Link>
        <GithubLink />
        <Link href="/new" className="btn btn-sm btn-butter">
          New brief
        </Link>
      </nav>
    </header>
  );
}
