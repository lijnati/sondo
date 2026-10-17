import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Container, Grid, Kicker } from "@/components/shared/layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

// Placeholder landing (DESIGN.md §4.1). The proof strip (an excerpt from a stored featured
// report) is added once featured runs exist. Nothing on this page is invented data.

const steps = [
  {
    n: "01",
    title: "Brief",
    body: "Your brand, audience, market and goal. Sondo shows which parts Qloo can model, and which it can't.",
  },
  {
    n: "02",
    title: "Research",
    body: "Live Qloo queries across music, film, TV, podcasts, brands and places, for your audience and for a baseline.",
  },
  {
    n: "03",
    title: "Critique",
    body: "Deterministic checks for coverage, empty categories and signals that are merely mainstream.",
  },
  {
    n: "04",
    title: "Strategies",
    body: "Three differentiated directions. Every cultural claim cites the Qloo result behind it, with a plan to validate it.",
  },
];

const is = [
  "Cultural affinity research grounded in Qloo results",
  "What over-indexes for your audience versus a baseline",
  "Hypotheses with a concrete plan to test them",
];

const isNot = [
  "Purchase intent, conversion or ROI forecasts",
  "Audience size or share (“X% of your audience”)",
  "A guarantee that a campaign will work",
];

export default function LandingPage() {
  return (
    <>
      <section aria-labelledby="hero-title" className="border-b border-rule">
        <Container className="py-16 md:py-28">
          <Grid>
            <div className="col-span-4 flex flex-col gap-6 md:col-span-9">
              <Kicker>Cultural intelligence strategist</Kicker>
              <h1
                id="hero-title"
                className="text-[2.5rem] leading-[2.875rem] font-semibold tracking-[-0.02em] text-balance md:text-display"
              >
                Stop guessing what your audience loves.
              </h1>
              <p className="max-w-2xl text-[1.0625rem] leading-7 text-ink-2 text-pretty">
                Sondo turns a brand brief into three evidence-backed campaign strategies, grounded in Qloo&apos;s
                cultural graph. Every cultural claim traces to a specific Qloo result.
              </p>
              <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                <Button asChild>
                  <Link href="/new">
                    Build a cultural brief
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
                <Button asChild variant="secondary">
                  <a href="#how-it-works">How it works</a>
                </Button>
              </div>
            </div>
          </Grid>
        </Container>
      </section>

      <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-14 border-b border-rule">
        <Container className="py-16 md:py-20">
          <div className="mb-10 flex flex-col gap-3">
            <Kicker>How it works</Kicker>
            <h2 id="how-title" className="text-h1 font-semibold">
              From brief to cited strategy
            </h2>
          </div>
          <ol className="grid grid-cols-1 border-t border-rule sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <li
                key={s.n}
                className="flex flex-col gap-3 border-b border-rule py-6 sm:pr-6 lg:border-b-0 lg:border-r lg:px-6 lg:first:pl-0 lg:last:border-r-0"
              >
                <span className="font-mono text-meta text-accent tabular">{s.n}</span>
                <h3 className="text-h2 font-semibold">{s.title}</h3>
                <p className="text-body text-ink-2 text-pretty">{s.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <section id="principles" aria-labelledby="principles-title" className="scroll-mt-14">
        <Container className="py-16 md:py-20">
          <div className="mb-10 flex flex-col gap-3">
            <Kicker>Honest by design</Kicker>
            <h2 id="principles-title" className="text-h1 font-semibold">
              What Sondo is, and isn&apos;t
            </h2>
          </div>
          <div className="grid grid-cols-1 overflow-hidden rounded-md border border-rule bg-surface md:grid-cols-2">
            <PrincipleList title="Sondo is" items={is} />
            <PrincipleList title="Sondo isn't" items={isNot} muted className="border-t border-rule md:border-l md:border-t-0" />
          </div>
        </Container>
      </section>
    </>
  );
}

function PrincipleList({
  title,
  items,
  muted = false,
  className,
}: {
  title: string;
  items: string[];
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 p-6 md:p-8", className)}>
      <h3 className="text-meta font-medium uppercase tracking-[0.08em] text-ink-2">{title}</h3>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li
            key={item}
            className={cn(
              "flex gap-3 border-t border-rule py-3 text-body first:border-t-0 first:pt-0",
              muted ? "text-ink-2" : "text-ink",
            )}
          >
            <span aria-hidden className={cn("mt-2.5 h-px w-3 shrink-0", muted ? "bg-ink-2" : "bg-accent")} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
