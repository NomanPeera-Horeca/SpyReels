/**
 * Mirrors `drizzle/schema.ts` `reels.niche` ENUM — shared by Zod input and UI labels.
 */
export const REEL_NICHE_VALUES = [
  "real_estate",
  "fitness",
  "food",
  "beauty",
  "business",
  "finance",
  "marketing",
  "parenting",
  "travel",
  "fashion",
  "tech",
  "education",
  "lifestyle",
  "spirituality",
  "hospitality",
] as const;

export type ReelNiche = (typeof REEL_NICHE_VALUES)[number];

export function formatReelTaxonomyLabel(raw: string): string {
  return raw
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}
