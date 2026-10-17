import Link from "next/link";

import { Container } from "@/components/shared/layout";
import { Wordmark } from "@/components/shared/wordmark";
import { Button } from "@/components/ui/button";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#principles", label: "What it is" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-bg/95 backdrop-blur-[2px]">
      <Container className="flex h-14 items-center justify-between gap-4">
        <Wordmark />
        <nav aria-label="Primary" className="flex items-center gap-1 md:gap-2">
          <ul className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <li key={l.href}>
                <Button asChild variant="ghost" size="sm">
                  <a href={l.href}>{l.label}</a>
                </Button>
              </li>
            ))}
          </ul>
          <Button asChild size="sm">
            <Link href="/new">Open Sondo</Link>
          </Button>
        </nav>
      </Container>
    </header>
  );
}
