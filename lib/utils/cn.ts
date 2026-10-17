import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Register Sondo's custom tokens (app/globals.css @theme) so tailwind-merge can tell a
// color (`text-bg`) from a font size (`text-body`). Without this it drops one of them.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "h1", "h2", "body", "meta"],
      color: ["bg", "surface", "ink", "ink-2", "rule", "rule-strong", "accent", "accent-soft", "pos", "neg", "warn"],
      radius: ["sm", "md"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
