import type { Metadata } from "next";

import { BriefClose } from "@/components/brief/brief-close";
import { BriefHero } from "@/components/brief/brief-hero";
import { ComposerPanel } from "@/components/brief/composer-panel";
import { ExamplesPanel } from "@/components/brief/examples-panel";
import { ReadingCards } from "@/components/brief/reading-cards";

export const metadata: Metadata = { title: "New brief" };

export default function NewBriefPage() {
  return (
    <>
      <BriefHero />
      <ReadingCards />
      <ExamplesPanel />
      <ComposerPanel />
      <BriefClose />
    </>
  );
}
