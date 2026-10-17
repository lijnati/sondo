import Link from "next/link";

import { cn } from "@/lib/utils/cn";

/** Text wordmark with the accent square as the single brand mark. */
export function Wordmark({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 text-body font-semibold tracking-[-0.01em] text-ink", className)}
    >
      <span aria-hidden className="size-2.5 rounded-[2px] bg-accent" />
      Sondo
    </Link>
  );
}
