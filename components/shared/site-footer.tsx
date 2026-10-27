import Link from "next/link";

import { BrandLogo } from "./brand-logo";
import { GithubLink } from "./github-link";

export function SiteFooter() {
  return (
    <footer className="site">
      <div className="m-container">
        <div className="foot-top">
          <div>
            <Link href="/" className="brand foot-brand" aria-label="Sondo home">
              <BrandLogo />
            </Link>
            <p className="muted" style={{ marginTop: 10, maxWidth: "36ch" }}>
              Cultural affinity research for campaign strategy. Powered by Qloo&apos;s cultural graph.
            </p>
          </div>
          <nav aria-label="Footer">
            <Link href="/#how-it-works">How it works</Link>
            <Link href="/#featured">Featured reports</Link>
            <Link href="/#principles">What it is</Link>
            <Link href="/#faq">FAQ</Link>
            <Link href="/new">New brief</Link>
            <GithubLink label="GitHub" className="gh-text" />
          </nav>
        </div>
        <div className="foot-bot">
          <span>Open source under the MIT License.</span>
          <span>Not affiliated with Qloo or any brand shown.</span>
          <span>Brands in featured reports are fictional.</span>
        </div>
      </div>
    </footer>
  );
}
