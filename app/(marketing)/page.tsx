import { ClosingBand } from "@/components/marketing/closing-band";
import { EvidenceTabs } from "@/components/marketing/evidence-tabs";
import { Faq } from "@/components/marketing/faq";
import { FeatureRow } from "@/components/marketing/feature-row";
import { FeaturedSection } from "@/components/marketing/featured-section";
import { Hero } from "@/components/marketing/hero";
import { HonestByDesign } from "@/components/marketing/honest-by-design";
import { ProofStrip } from "@/components/marketing/proof-strip";
import { Steps } from "@/components/marketing/steps";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ProofStrip />
      <FeaturedSection />
      <Steps />
      <EvidenceTabs />
      <FeatureRow />
      <HonestByDesign />
      <Faq />
      <ClosingBand />
    </>
  );
}
