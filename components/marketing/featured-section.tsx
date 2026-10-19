import { Suspense } from "react";

import { FeaturedReports, FeaturedSkeleton } from "@/components/app/featured-reports";

/** Landing: real stored reports from verified runs, linked to their permalinks. */
export function FeaturedSection() {
  return (
    <section className="block" id="featured" aria-labelledby="featured-title">
      <div className="m-container">
        <div className="head">
          <h2 id="featured-title" className="h2">
            Featured <em>reports</em>.
          </h2>
          <p>Stored runs of the fictional evaluation briefs. Each opens instantly, with every claim linked to the Qloo result it cites.</p>
        </div>
        <Suspense fallback={<FeaturedSkeleton />}>
          <FeaturedReports />
        </Suspense>
      </div>
    </section>
  );
}
