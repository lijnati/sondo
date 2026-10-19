"use client";

import { useEffect } from "react";

/** One observer drives split-word headlines and blur-in reveals. */
export function MarketingMotion() {
  useEffect(() => {
    const root = document.querySelector(".marketing");
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = [...root.querySelectorAll<HTMLElement>(".reveal, .split")];
    if (reduce) {
      for (const node of nodes) node.classList.add("is-in");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
    );

    for (const node of nodes) io.observe(node);
    return () => io.disconnect();
  }, []);

  return null;
}
