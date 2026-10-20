import type { ReactNode } from "react";

/**
 * A full-page state (not found, error, no report): eyebrow, title, plain-language
 * explanation, an optional reference in mono and a way out. Never a stack trace.
 */
export function PageState({
  eyebrow,
  title,
  children,
  reference,
  actions,
  tone,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  reference?: string;
  actions?: ReactNode;
  tone?: "warn" | "bad";
}) {
  return (
    <div className="m-container page-state" role={tone === "bad" ? "alert" : undefined}>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="page-state-title">{title}</h1>
      {children ? <div className="page-state-body">{children}</div> : null}
      {reference ? (
        <p className="mono" style={{ marginTop: 18 }}>
          Reference <span style={{ color: "var(--ink)" }}>{reference}</span>
        </p>
      ) : null}
      {actions ? <div className="form-actions">{actions}</div> : null}
    </div>
  );
}
