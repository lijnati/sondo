"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * Link that marks itself aria-current when its path is active. usePathname() is runtime
 * data under Cache Components, so render this inside <Suspense> with a plain-link fallback.
 */
export function NavLink({ href, exact = true, ...props }: ComponentProps<typeof Link> & { href: string; exact?: boolean }) {
  const pathname = usePathname();
  const path = href.split("#")[0] ?? href;
  const active = !href.includes("#") && (exact ? pathname === path : pathname.startsWith(path));
  return <Link href={href} aria-current={active ? "page" : undefined} data-active={active || undefined} {...props} />;
}
