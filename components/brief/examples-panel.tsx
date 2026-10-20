import { Suspense } from "react";

import { FeaturedReports, FeaturedSkeleton } from "@/components/app/featured-reports";

export function ExamplesPanel() {
  return (
    <section className="block" id="examples" aria-labelledby="examples-title">
      <div className="m-container">
        <div className="head">
          <h2 id="examples-title" className="h2">
            Featured <em>reports</em>.
          </h2>
          <p>
            Finished runs of the three example briefs, stored so they open instantly. Load the same brief in the form
            above to run it again.
          </p>
        </div>
        <Suspense fallback={<FeaturedSkeleton />}>
          <FeaturedReports />
        </Suspense>
      </div>
    </section>
  );
}
