import { Container } from "@/components/shared/layout";
import { Wordmark } from "@/components/shared/wordmark";

// The repository link is added once the public GitHub repo exists (ROADMAP Phase 1b).
export function SiteFooter() {
  return (
    <footer className="border-t border-rule">
      <Container className="flex flex-col gap-6 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Wordmark />
          <p className="max-w-sm text-meta text-ink-2">
            Cultural affinity research for campaign strategy. Powered by Qloo&apos;s cultural graph.
          </p>
        </div>
        <div className="flex flex-col gap-1 text-meta text-ink-2 md:items-end md:text-right">
          <p>Open source under the MIT License.</p>
          <p>Not affiliated with Qloo or any brand shown.</p>
        </div>
      </Container>
    </footer>
  );
}
