"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface ConceptTab {
  key: string;
  kicker: string;
  name: string;
  panel: ReactNode;
}

/**
 * Concept switcher: a real tablist (arrow keys, Home/End) over server-rendered panels.
 * A link to `#concept-<key>` opens that concept.
 */
export function ConceptTabs({ tabs }: { tabs: ConceptTab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const fromHash = () => {
      const i = tabs.findIndex((t) => window.location.hash === `#concept-${t.key}`);
      if (i >= 0) setActive(i);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  function onKey(e: KeyboardEvent) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (active === last ? 0 : active + 1) : e.key === "ArrowLeft" ? (active === 0 ? last : active - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="concept-tabs">
      <div className="concept-tablist" role="tablist" aria-label="Concepts" onKeyDown={onKey}>
        {tabs.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={i === active}
            aria-controls={`concept-${t.key}`}
            tabIndex={i === active ? 0 : -1}
            className="concept-tab"
            onClick={() => setActive(i)}
          >
            <span className="concept-tab-kicker">
              <span className="concept-tab-num" aria-hidden="true">
                {i + 1}
              </span>
              {t.kicker}
            </span>
            <span className="concept-tab-name">{t.name}</span>
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} role="tabpanel" id={`concept-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={i !== active} tabIndex={0} className="concept-panel">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
