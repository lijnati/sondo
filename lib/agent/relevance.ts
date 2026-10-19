/**
 * Claim-to-evidence relevance (Phase 2 validation hardening). Validation already proves a cited E# exists and
 * that the entity was retrieved. This adds a third, deterministic question: does the
 * citation plausibly support *this* text? It compares the text with the cited item's
 * identity (name), category and Qloo tags, and with other ledger entities or themes the
 * text names. It is a consistency check, not fact-checking: "unlinked" means "no
 * deterministic link found". validate.ts drops "mismatch" citations, does not count
 * "unlinked" ones towards grounding, and downgrades an evidence claim with no direct or
 * contextual citation to a hypothesis.
 *
 * Regression source: Phase 2 live Lisbon run, where "the Architecture taste theme" was
 * justified with an artist citation.
 */
import type { EvidenceItem } from "@/lib/evidence/types";

export type SupportLevel = "direct" | "contextual" | "unlinked" | "mismatch";

export interface CitationCheck {
  evidenceId: string;
  level: SupportLevel;
  reason: string;
}

/** Category vocabulary used to tell whether text is talking about a kind of entity. */
const CATEGORY_WORDS: Record<string, RegExp> = {
  artist: /\b(artists?|musicians?|bands?|singers?|music|concerts?|playlists?|albums?|songs?|gigs?|dj)\b/i,
  podcast: /\b(podcasts?|episodes?|listeners?)\b/i,
  tv_show: /\b(tv|television|series|shows?|streaming|episodes?)\b/i,
  movie: /\b(films?|movies?|cinema|screenings?)\b/i,
  brand: /\b(brands?|labels?|retailers?|co-?brand(ed|ing)?|collab(oration)?s?)\b/i,
  place: /\b(venues?|restaurants?|caf[eé]s?|bars?|hotels?|shops?|stores?|galler(y|ies)|rooftops?|bakers?|bakery|bakeries|eatery|eateries)\b/i,
  destination: /\b(destinations?|trips?|travel(lers?|ers?)?|beach(es)?|getaways?)\b/i,
  book: /\b(books?|novels?|authors?|reads?|reading)\b/i,
  person: /\b(people|personalit(y|ies)|creators?|models?|influencers?|ambassadors?)\b/i,
  taste: /\b(themes?|tastes?|aesthetics?|genres?|vibes?)\b/i,
};

/** A theme name only counts as "mentioned" when the text frames it as a theme. */
const THEME_CUE = /\b(themes?|tastes?|aesthetics?|genres?|vibes?|styles?|sounds?|sonic|motifs?)\b/i;

/**
 * Categories whose words are too generic to prove a mismatch on their own: they often
 * describe the audience ("travellers", "creators") or the client ("brand"), not a cited item.
 */
const SOFT_CATEGORIES = new Set(["taste", "brand", "person", "destination"]);

export interface RelevanceIndex {
  byId: Map<string, EvidenceItem>;
  /** Lowercased entity name → E# ids. */
  entities: Map<string, string[]>;
  /** Lowercased taste-theme name (tag evidence) → E# ids. */
  themes: Map<string, string[]>;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function contains(text: string, phrase: string): boolean {
  const p = phrase.trim().toLowerCase();
  if (p.length < 3) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(p)}($|[^\\p{L}\\p{N}])`, "u").test(text.toLowerCase());
}

export const categoryOf = (it: EvidenceItem) => (it.entity.kind === "tag" ? "taste" : it.query.filterType.replace("urn:entity:", ""));

export function buildRelevanceIndex(items: readonly EvidenceItem[]): RelevanceIndex {
  const byId = new Map<string, EvidenceItem>();
  const entities = new Map<string, string[]>();
  const themes = new Map<string, string[]>();
  for (const it of items) {
    byId.set(it.id, it);
    const key = it.entity.name.trim().toLowerCase();
    if (key.length < 4) continue;
    const map = it.entity.kind === "tag" ? themes : entities;
    map.set(key, [...(map.get(key) ?? []), it.id]);
  }
  return { byId, entities, themes };
}

/**
 * Judge each cited E# against the text. Also returns `suggested`: E# ids of ledger items
 * the text names explicitly but does not cite (unique per name), for automatic correction.
 */
export function checkCitations(text: string, evidenceIds: readonly string[], idx: RelevanceIndex): { checks: CitationCheck[]; suggested: string[] } {
  const namedEntities = [...idx.entities.entries()].filter(([name]) => contains(text, name));
  const namedThemes = THEME_CUE.test(text) ? [...idx.themes.entries()].filter(([name]) => contains(text, name)) : [];
  const namedCategories = Object.entries(CATEGORY_WORDS)
    .filter(([cat, re]) => !SOFT_CATEGORIES.has(cat) && re.test(text))
    .map(([cat]) => cat);
  const cited = evidenceIds.map((id) => idx.byId.get(id)).filter((x): x is EvidenceItem => Boolean(x));

  const checks: CitationCheck[] = cited.map((it) => {
    const cat = categoryOf(it);
    if (contains(text, it.entity.name)) return { evidenceId: it.id, level: "direct", reason: `names ${it.entity.name}` };
    const tag = it.entity.tags.find((t) => t.name.length >= 4 && contains(text, t.name));
    if (tag) return { evidenceId: it.id, level: "contextual", reason: `mentions "${tag.name}", one of its Qloo tags` };
    if (CATEGORY_WORDS[cat]?.test(text) && (cat !== "taste" || THEME_CUE.test(text))) {
      return { evidenceId: it.id, level: "contextual", reason: `talks about ${cat === "taste" ? "a taste theme" : cat.replace("_", " ")}s` };
    }
    const others = [...namedEntities, ...namedThemes].map(([name]) => name);
    if (others.length) {
      return { evidenceId: it.id, level: "mismatch", reason: `the text is about ${others.map((n) => `"${idx.byId.get((idx.entities.get(n) ?? idx.themes.get(n) ?? [])[0] ?? "")?.entity.name ?? n}"`).join(", ")}, not ${it.entity.name}` };
    }
    if (namedCategories.length && !namedCategories.includes(cat)) {
      return { evidenceId: it.id, level: "mismatch", reason: `the text is about ${namedCategories.map((c) => c.replace("_", " ")).join("/")}, but ${it.entity.name} is ${cat === "taste" ? "a taste theme" : `a ${cat.replace("_", " ")}`}` };
    }
    return { evidenceId: it.id, level: "unlinked", reason: "no name, tag or category link to the text" };
  });

  const citedSet = new Set(evidenceIds);
  const suggested = [...namedEntities, ...namedThemes]
    .filter(([, ids]) => ids.length === 1 || new Set(ids.map((i) => idx.byId.get(i)?.entity.qlooId)).size === 1)
    .map(([, ids]) => ids[0] as string)
    .filter((id) => !citedSet.has(id));
  return { checks, suggested };
}

/** One label per claim: the strongest link among its citations. */
export function claimSupport(checks: readonly CitationCheck[]): "direct" | "contextual" | "weak" {
  if (checks.some((c) => c.level === "direct")) return "direct";
  if (checks.some((c) => c.level === "contextual")) return "contextual";
  return "weak";
}
