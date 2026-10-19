"use client";

import { useState } from "react";

/** Copies the permanent report URL. Falls back to showing it when the clipboard is blocked. */
export function ShareButton({ path }: { path: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).toString();
  return (
    <span style={{ display: "inline-flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn-sm btn-ink"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setState("copied");
          } catch {
            setState("manual");
          }
        }}
      >
        {state === "copied" ? "Link copied" : "Copy report link"}
      </button>
      <span role="status" className="muted" style={{ fontSize: 13, overflowWrap: "anywhere" }}>
        {state === "manual" ? url : ""}
      </span>
    </span>
  );
}
