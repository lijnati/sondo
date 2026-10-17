"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

const control =
  "w-full rounded-sm border border-rule-strong bg-surface px-3 text-body text-ink placeholder:text-ink-2/70 transition-colors hover:border-ink-2 focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-neg";

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-meta font-medium text-ink", className)} {...props} />;
}

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(control, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2", className)} {...props} />;
}

/** Help or error text under a control; link it with aria-describedby. */
export function FieldHint({ className, tone = "muted", ...props }: ComponentProps<"p"> & { tone?: "muted" | "error" }) {
  return (
    <p
      className={cn("text-meta", tone === "error" ? "text-neg" : "text-ink-2", className)}
      {...(tone === "error" ? { role: "alert" } : {})}
      {...props}
    />
  );
}
