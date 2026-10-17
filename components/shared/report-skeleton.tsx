import { Container } from "@/components/shared/layout";
import { Skeleton } from "@/components/ui/skeleton";

const tabs = ["Overview", "Signals", "Strategies", "Evidence"];

/** Loading shape of /r/[id], mirroring the final report layout (DESIGN.md §3, §5). */
export function ReportSkeleton() {
  return (
    <Container className="py-10 md:py-14" aria-busy="true">
      <p className="sr-only" role="status">
        Loading report
      </p>
      <div className="flex flex-col gap-4 border-b border-rule pb-8">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-9 w-full max-w-md" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div aria-hidden className="flex gap-6 overflow-x-auto border-b border-rule">
        {tabs.map((t) => (
          <span key={t} className="whitespace-nowrap py-3 text-meta text-ink-2/60">
            {t}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-8 pt-8 md:grid-cols-12">
        <div className="flex flex-col gap-3 md:col-span-8">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-6 h-40 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-3 md:col-span-4">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      </div>
    </Container>
  );
}
