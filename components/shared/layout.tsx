import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/** Page-width container: 16px gutters on mobile, 32px from md. Max 1280px content. */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1280px] px-4 md:px-8", className)} {...props} />;
}

/** 12-column grid with the standard gutter. Children set their own col-span. */
export function Grid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid grid-cols-4 gap-x-4 gap-y-8 md:grid-cols-12 md:gap-x-6", className)} {...props} />;
}

/** Hairline rule — the primary structural device (DESIGN.md §2). */
export function Rule({ className, ...props }: ComponentProps<"hr">) {
  return <hr className={cn("border-0 border-t border-rule", className)} {...props} />;
}

/** Small mono uppercase label above headings. */
export function Kicker({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("font-mono text-meta uppercase tracking-[0.08em] text-ink-2", className)} {...props} />;
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 border-b border-rule pb-8 md:flex-row md:items-end md:justify-between">
      <div className="flex max-w-2xl flex-col gap-3">
        {kicker ? <Kicker>{kicker}</Kicker> : null}
        <h1 className="text-h1 font-semibold text-balance">{title}</h1>
        {description ? <p className="text-body text-ink-2 text-pretty">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-3">{actions}</div> : null}
    </header>
  );
}
