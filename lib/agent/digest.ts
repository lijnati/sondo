/**
 * What the model sees of the evidence. Qloo results are external, untrusted text: names
 * are sanitized and everything is placed inside a fenced data block that the
 * instructions tell the model to treat as data, never as instructions.
 */
import type { Ledger } from "@/lib/evidence/ledger";
import type { EvidenceItem } from "@/lib/evidence/types";

import type { CulturalFinding } from "./schemas";

/** Strip control characters, markup and fence markers; collapse whitespace; cap length. */
export function sanitizeName(s: string, max = 60): string {
  const cleaned = s
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/[<>`{}[\]|\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

/** Plain words, so the model does not echo internal labels like "mainstream_fit" into copy. */
const QUADRANT_WORDS = {
  mainstream_fit: "strong fit, mainstream",
  distinctive_fit: "strong fit, less mainstream",
  weak_mainstream: "weaker fit, mainstream",
  long_tail: "weaker fit, less mainstream",
} as const;

const fmt = (n: number | undefined, d = 2) => (n === undefined ? "n/a" : n.toFixed(d));

function line(it: EvidenceItem): string {
  const cat = it.entity.kind === "tag" ? "taste" : it.query.filterType.replace("urn:entity:", "");
  const lift = it.derived?.newInTarget ? "new for audience" : it.derived?.lift !== undefined ? `lift ${it.derived.lift > 0 ? "+" : ""}${it.derived.lift}` : "";
  const parts = [
    it.id,
    cat,
    sanitizeName(it.entity.name),
    `rank ${it.rank}/${it.of}`,
    `pop ${fmt(it.popularity)}`,
    lift,
    it.derived?.quadrant ? QUADRANT_WORDS[it.derived.quadrant] : "",
    it.query.variant === "deepen" ? "follow-up" : "",
    it.entity.tags.length ? `tags: ${it.entity.tags.slice(0, 3).map((t) => sanitizeName(t.name, 30)).join(", ")}` : "",
  ];
  return parts.filter(Boolean).join(" | ");
}

/**
 * Compact ledger view: target, follow-up and taste items (baselines are only used for
 * lift), top-k per category, capped overall.
 */
export function ledgerDigest(ledger: Ledger, opts: { perCategory?: number; max?: number } = {}): string {
  const perCategory = opts.perCategory ?? 8;
  const max = opts.max ?? 120;
  const groups = new Map<string, EvidenceItem[]>();
  for (const it of ledger.all()) {
    if (it.query.variant === "baseline") continue;
    const key = `${it.entity.kind === "tag" ? "taste" : it.query.filterType}|${it.callId}`;
    const g = groups.get(key) ?? [];
    if (g.length < perCategory) g.push(it);
    groups.set(key, g);
  }
  return [...groups.values()].flat().slice(0, max).map(line).join("\n");
}

export function findingsDigest(findings: readonly CulturalFinding[]): string {
  return findings.map((f) => `${f.id} [${f.kind}, ${f.strength}] ${f.statement}${f.evidenceIds.length ? ` (${f.evidenceIds.join(", ")})` : ""}`).join("\n");
}

/** Wrap external data so the model treats it as data. */
export function untrusted(label: string, body: string): string {
  return `<untrusted_qloo_data name="${label}">\n${body || "(none)"}\n</untrusted_qloo_data>`;
}
