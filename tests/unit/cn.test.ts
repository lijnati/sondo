import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils/cn";

describe("cn", () => {
  it("drops falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("lets later Tailwind utilities win, including custom tokens", () => {
    expect(cn("px-3 text-ink", "px-4 text-ink-2")).toBe("px-4 text-ink-2");
  });

  // Regression: without the token config, `text-body` (size) silently removed `text-bg`
  // (color), leaving primary buttons with invisible labels.
  it("keeps a custom text color and a custom text size together", () => {
    expect(cn("bg-ink text-bg", "text-body")).toBe("bg-ink text-bg text-body");
    expect(cn("text-meta text-ink-2")).toBe("text-meta text-ink-2");
  });

  it("still dedupes within the custom size scale", () => {
    expect(cn("text-meta", "text-body")).toBe("text-body");
  });
});
