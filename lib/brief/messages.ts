/**
 * Plain-English messages for Brief validation issues, shared by the form and the API so
 * both say the same thing. Client-safe.
 */
import type { z } from "zod";

import { FIELD_LABEL } from "./labels";

/** Groups array paths onto their field ("anchors.2.name" → "anchors"). */
export function fieldKey(path: readonly PropertyKey[]): string {
  const parts = path.map(String);
  if (parts[0] === "anchors") return "anchors";
  if (parts[0] === "audience" && parts[1] === "ages") return "audience.ages";
  if (parts[0] === "constraints" && parts[1] === "excludeCategories") return "constraints.excludeCategories";
  return parts.join(".") || "brief";
}

export function friendlyIssue(issue: z.core.$ZodIssue): string {
  const key = fieldKey(issue.path);
  const label = FIELD_LABEL[key] ?? "This field";
  switch (issue.code) {
    case "too_small":
      if (issue.origin === "string") return Number(issue.minimum) <= 1 || (typeof issue.input === "string" && issue.input.trim() === "") ? `${label} is required.` : `${label} needs at least ${issue.minimum} characters.`;
      if (issue.origin === "array") return `Add at least ${issue.minimum} to ${label.toLowerCase()}.`;
      return `${label} is too small.`;
    case "too_big":
      if (issue.origin === "string") return key === "anchors" ? `Each anchor can be at most ${issue.maximum} characters.` : `${label} can be at most ${issue.maximum} characters.`;
      if (issue.origin === "array") return `${label}: choose at most ${issue.maximum}.`;
      return `${label} is too large.`;
    case "invalid_value":
      return `Choose a valid option for ${label.toLowerCase()}.`;
    case "invalid_type":
      return issue.input === undefined ? `${label} is required.` : `${label} has the wrong format.`;
    default:
      return `${label} isn't valid.`;
  }
}

/** First message per field. */
export function briefErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = fieldKey(issue.path);
    out[key] ??= friendlyIssue(issue);
  }
  return out;
}
