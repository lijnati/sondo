import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/** Static placeholder lines matching final layout (DESIGN.md §5: no spinners in content). */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden className={cn("rounded-sm bg-rule", className)} {...props} />;
}
