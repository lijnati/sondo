import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

/** Ruled empty box (DESIGN.md §5): says what is missing and what to do next. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 rounded-md border border-dashed border-rule-strong px-6 py-8",
        className,
      )}
    >
      <p className="text-body font-medium text-ink">{title}</p>
      {description ? <div className="max-w-prose text-meta text-ink-2 text-pretty">{description}</div> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/** Fatal error: plain language, reference in mono, a way out. Never a stack trace. */
export function ErrorState({
  title,
  description,
  reference,
  actions,
}: {
  title: string;
  description: ReactNode;
  reference?: string;
  actions?: ReactNode;
}) {
  return (
    <div role="alert" className="flex max-w-xl flex-col items-start gap-4 border-l-2 border-neg py-1 pl-6">
      <h1 className="text-h2 font-semibold">{title}</h1>
      <div className="text-body text-ink-2 text-pretty">{description}</div>
      {reference ? (
        <p className="font-mono text-meta text-ink-2">
          Reference <span className="text-ink">{reference}</span>
        </p>
      ) : null}
      {actions ? <div className="flex flex-wrap gap-3 pt-2">{actions}</div> : null}
    </div>
  );
}
