import { Menu } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { Container } from "@/components/shared/layout";
import { NavLink } from "@/components/shared/nav-link";
import { Wordmark } from "@/components/shared/wordmark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const items = [
  { href: "/new", label: "New brief" },
  { href: "/new#examples", label: "Examples" },
];

const desktopLink =
  "inline-flex h-8 items-center rounded-sm px-3 text-meta font-medium text-ink-2 transition-colors hover:bg-rule/50 hover:text-ink data-active:bg-rule/70 data-active:text-ink";
const mobileLink = "flex h-12 items-center text-body font-medium text-ink";

export function ProductNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-bg/95 backdrop-blur-[2px]">
      <Container className="flex h-14 items-center justify-between gap-4">
        <Wordmark />

        <nav aria-label="Product" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {items.map((item) => (
              <li key={item.href}>
                <Suspense
                  fallback={
                    <Link href={item.href} className={desktopLink}>
                      {item.label}
                    </Link>
                  }
                >
                  <NavLink href={item.href} className={desktopLink}>
                    {item.label}
                  </NavLink>
                </Suspense>
              </li>
            ))}
          </ul>
        </nav>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
              <Menu aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetTitle className="text-meta font-medium text-ink-2">Navigation</SheetTitle>
            <SheetDescription className="sr-only">Sondo product pages</SheetDescription>
            <nav aria-label="Product" className="mt-6">
              <ul className="flex flex-col border-t border-rule">
                {items.map((item) => (
                  <li key={item.href} className="border-b border-rule">
                    <SheetClose asChild>
                      <Link href={item.href} className={mobileLink}>
                        {item.label}
                      </Link>
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </nav>
          </SheetContent>
        </Sheet>
      </Container>
    </header>
  );
}
