/** User-facing names for the five public run stages. Client-safe. */
import type { Stage } from "./events";

export const STAGE_LABEL: Record<Stage, string> = {
  planning: "Planning",
  research: "Qloo research",
  critique: "Critique",
  strategy: "Concepts",
  validation: "Claim validation",
};
