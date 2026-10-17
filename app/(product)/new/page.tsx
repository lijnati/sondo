import type { Metadata } from "next";

import { Container, Kicker, PageHeader } from "@/components/shared/layout";
import { EmptyState } from "@/components/shared/states";

export const metadata: Metadata = { title: "New brief" };

// Composer shell (DESIGN.md §4.2). The form, live "How Sondo will read this" rail and
// featured examples arrive with the run API (ROADMAP Phase 3); nothing here is wired yet.

const readingSteps = [
  ["Brand and anchors", "Resolved against Qloo entities. Unknown names are flagged, never invented."],
  ["Audience", "Modeled with Qloo's six age buckets, gender, Qloo audiences and locality only."],
  ["Market", "Passed to Qloo as a locality. Location claims are scoped to what Qloo supports."],
  ["Not modeled", "Anything else in your brief is listed openly, so you know what the research can't see."],
] as const;

export default function NewBriefPage() {
  return (
    <Container className="py-10 md:py-14">
      <PageHeader
        kicker="New brief"
        title="Build a cultural brief"
        description="Describe your brand, audience and market. Sondo researches what this audience genuinely over-indexes on, then drafts three cited strategies."
      />

      <div className="grid grid-cols-1 gap-10 pt-10 lg:grid-cols-12 lg:gap-12">
        <div className="flex flex-col gap-10 lg:col-span-8">
          <section aria-labelledby="examples-title" id="examples" className="flex scroll-mt-20 flex-col gap-4">
            <h2 id="examples-title" className="text-h2 font-semibold">
              Featured examples
            </h2>
            <EmptyState
              title="No example reports yet"
              description="Featured reports appear here once the first live runs are generated. Each one will open instantly from a stored, fully cited report."
            />
          </section>

          <section aria-labelledby="composer-title" className="flex flex-col gap-4">
            <h2 id="composer-title" className="text-h2 font-semibold">
              Your brief
            </h2>
            <EmptyState
              title="The brief composer is on its way"
              description="Brand, audience, market, goal and up to six cultural anchors. It opens here when live research is connected."
            />
          </section>
        </div>

        <aside aria-labelledby="reading-title" className="lg:col-span-4">
          <div className="flex flex-col gap-4 rounded-md border border-rule bg-surface p-6 lg:sticky lg:top-20">
            <Kicker id="reading-title">How Sondo will read this</Kicker>
            <ol className="flex flex-col">
              {readingSteps.map(([title, body]) => (
                <li key={title} className="flex flex-col gap-1 border-t border-rule py-3 first:border-t-0 first:pt-0">
                  <p className="text-body font-medium">{title}</p>
                  <p className="text-meta text-ink-2 text-pretty">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </Container>
  );
}
