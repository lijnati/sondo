import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Report not found", robots: { index: false } };

/**
 * proxy.ts rewrites unknown or malformed report ids here. notFound() runs before any
 * await or Suspense boundary, so the response carries a real 404 status.
 */
export default function MissingReport() {
  notFound();
}
