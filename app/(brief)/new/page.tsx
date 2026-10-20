import type { Metadata } from "next";

import { BriefClose } from "@/components/brief/brief-close";
import { BriefHero } from "@/components/brief/brief-hero";
import { ComposerPanel } from "@/components/brief/composer-panel";
import { ExamplesPanel } from "@/components/brief/examples-panel";

export const metadata: Metadata = { title: "New brief" };

export default function NewBriefPage() {
  return (
    <>
      <BriefHero />
      <ComposerPanel />
      <ExamplesPanel />
      <BriefClose />
    </>
  );
}
