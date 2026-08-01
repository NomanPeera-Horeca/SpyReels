/**
 * Curated, vetted factual claims for carousel remake templates that use
 * stat_split_stack (e.g. average_vs_not). Editable in code; no DB migration.
 * Populate entries separately — empty pool means all niches use unnamed fallback.
 */

export type VettedFact = {
  id: string;
  niches: string[];
  templateFit: string[];
  claimType: "timeframe" | "failure" | "age" | "scale";
  /** Verbatim verified top-line claim for the average slot. */
  factText: string;
  /** Citation note/URL for internal reference only; never shown to users. */
  source: string;
  /** Routes not_line logic: craving (a) vs fear_negation (b). */
  reframeAngle: "craving" | "fear_negation";
};

export const carouselFactPool: VettedFact[] = [];

/** Normalize niche / tag text for fuzzy contains matching. */
export function normalizeNicheToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when the remake niche fuzzy-matches any entry in fact.niches
 * (either side contains the other as a whole-token phrase).
 */
export function nicheMatchesFact(niche: string, fact: VettedFact): boolean {
  const nicheNorm = normalizeNicheToken(niche);
  if (!nicheNorm) return false;
  return fact.niches.some((tag) => {
    const tagNorm = normalizeNicheToken(tag);
    if (!tagNorm) return false;
    return (
      nicheNorm.includes(tagNorm) ||
      tagNorm.includes(nicheNorm) ||
      nicheNorm.split(" ").some((w) => w.length > 3 && tagNorm.includes(w))
    );
  });
}

export function factFitsTemplate(fact: VettedFact, templateId: string): boolean {
  return fact.templateFit.includes(templateId);
}
