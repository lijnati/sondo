import { Suspense } from "react";

import { FeaturedReports, FeaturedSkeleton } from "@/components/app/featured-reports";

export function ExamplesPanel() {
  return (
    <section className="block" id="examples" aria-labelledby="examples-title" style={{ paddingTop: 0 }}>
      <div className="m-container">
        <div className="head">
          <h2 id="examples-title" className="h2">
            Featured <em>reports</em>.
          </h2>
          <p>
            Finished runs of the example briefs below, stored so they open instantly. Use one of them as a starting
            point in the form.
          </p>
        </div>
        <Suspense fallback={<FeaturedSkeleton />}>
          <FeaturedReports />
        </Suspense>
      </div>
    </section>
  );
}
