import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Report" };

/**
 * Run → report permalink (DESIGN.md §4.3–4.7). Reports are persisted from Phase 3
 * (lib/db); until then no id resolves, so every request gets the designed not-found
 * state. loading.tsx is the Suspense boundary for the runtime `params` access.
 */
export default async function ReportPage({ params }: PageProps<"/r/[id]">) {
  await params;
  notFound();
}
