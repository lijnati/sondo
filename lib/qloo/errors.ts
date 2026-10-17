import type { ToolCallRecord } from "./types";

export type QlooErrorKind =
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_found"
  | "rate_limited"
  | "server"
  | "timeout"
  | "network"
  | "aborted"
  | "budget_exhausted"
  | "invalid_response"
  | "not_configured";

/** Retried at most once (ARCHITECTURE.md §2). Everything else fails immediately. */
export const RETRYABLE: ReadonlySet<QlooErrorKind> = new Set(["rate_limited", "server", "timeout", "network"]);

export class QlooError extends Error {
  override readonly name = "QlooError";
  /** Key-free trace record of the failed call, when one was made. */
  record?: ToolCallRecord;
  constructor(
    readonly kind: QlooErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function kindForStatus(status: number): QlooErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "bad_request";
}

/** Strip the key and collapse whitespace; keep error bodies short. */
export function sanitize(text: string, secret: string): string {
  let s = text;
  if (secret) s = s.split(secret).join("<redacted>");
  return s.replace(/\s+/g, " ").trim().slice(0, 300);
}
