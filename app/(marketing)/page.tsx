import { Suspense } from "react";

import { loadExcerpt } from "@/components/app/featured-reports";
import { ClosingBand } from "@/components/marketing/closing-band";
import { EvidenceTabs } from "@/components/marketing/evidence-tabs";
import { Faq } from "@/components/marketing/faq";
import { FeatureRow } from "@/components/marketing/feature-row";
import { FeaturedSection } from "@/components/marketing/featured-section";
import { Hero } from "@/components/marketing/hero";
import { HonestByDesign } from "@/components/marketing/honest-by-design";
import { ProofStrip } from "@/components/marketing/proof-strip";
import { Steps } from "@/components/marketing/steps";

/** Real excerpts of the top featured report (read from the database, zero Qloo calls). */
async function ReportExcerpts() {
  const excerpt = await loadExcerpt();
  return (
    <>
      <EvidenceTabs excerpt={excerpt} />
      <FeatureRow excerpt={excerpt} />
    </>
  );
}

function ExcerptsSkeleton() {
  return (
    <section className="block" aria-busy="true" aria-label="Loading report excerpts">
      <div className="m-container split-2" style={{ marginTop: 0 }}>
        <div className="skel" style={{ height: 320 }} />
        <div className="skel" style={{ height: 420 }} />
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ProofStrip />
      <FeaturedSection />
      <Steps />
      <Suspense fallback={<ExcerptsSkeleton />}>
        <ReportExcerpts />
      </Suspense>
      <HonestByDesign />
      <Faq />
      <ClosingBand />
    </>
  );
}
