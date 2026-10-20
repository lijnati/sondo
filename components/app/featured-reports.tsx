import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import Link from "next/link";

import { getDb } from "@/lib/db/client";
import { featuredExcerpt, listFeatured, type FeaturedCard, type FeaturedExcerpt } from "@/lib/db/runs";
import { OBJECTIVE_LABEL } from "@/lib/brief/labels";

const TINTS = ["mint", "cream", "ice"] as const;
const ANGLE: Record<string, string> = {
  mainstream_anchor: "Mainstream anchor",
  distinctive_niche: "Distinctive niche",
  cross_category_bridge: "Cross-category bridge",
};

async function featured(): Promise<FeaturedCard[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("featured");
  return listFeatured(getDb());
}

/** One real excerpt of the top featured report for the landing page; null if unavailable. */
export async function loadExcerpt(): Promise<FeaturedExcerpt | null> {
  await connection();
  try {
    return await excerpt();
  } catch {
    return null;
  }
}

async function excerpt(): Promise<FeaturedExcerpt | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("featured");
  return featuredExcerpt(getDb());
}

/**
 * Stored featured reports, read from the database (zero Qloo calls). Only runs stored as
 * completed can be featured. Renders an honest empty or unavailable state otherwise.
 */
export async function FeaturedReports() {
  await connection();
  let cards: FeaturedCard[] | null;
  try {
    cards = await featured();
  } catch {
    cards = null;
  }

  if (!cards?.length) {
    return (
      <div className="empty-card">
        <p className="mono">{cards ? "No featured reports yet" : "Featured reports are unavailable right now"}</p>
        <p className="muted" style={{ marginTop: 10, maxWidth: "52ch" }}>
          {cards ? "Featured reports appear here once a verified run is stored. This page will not invent one." : "The report store couldn't be reached. Try again in a moment."}
        </p>
      </div>
    );
  }

  return (
    <div className="featured-cards">
      {cards.map((c, i) => (
        <Link key={c.id} href={`/r/${c.id}`} className={`featured-card card ${TINTS[i % 3]}`} style={{ minHeight: 0 }}>
          <div className="fc-top">
            <p className="eyebrow">
              {c.market} · {OBJECTIVE_LABEL[c.objective]}
            </p>
            <span className="status status-completed">Complete</span>
          </div>
          <p className="h3">{c.brandName}</p>
          {c.topFinding ? (
            <p className="fc-finding">
              <span className="fc-label">Top finding</span>
              {c.topFinding}
            </p>
          ) : null}
          <ul aria-label="Concepts">
            {c.concepts.map((k) => (
              <li key={k.angle}>
                <span className="fc-label">{ANGLE[k.angle] ?? k.angle}</span>
                {k.name}
              </li>
            ))}
          </ul>
          <div className="fc-foot">
            <span className="muted">
              <span className="tabular">{c.evidenceCount}</span> Qloo results · {c.categoryCount} categories
            </span>
            <span className="fc-open">
              Open report <span className="i" aria-hidden="true">→</span>
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function FeaturedSkeleton() {
  return (
    <div className="featured-cards" aria-busy="true" aria-label="Loading featured reports">
      {TINTS.map((t) => (
        <div key={t} className="skel" style={{ height: 260 }} />
      ))}
    </div>
  );
}
