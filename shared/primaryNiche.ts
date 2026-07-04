import { inferNicheFromText } from "./creatorContextInference";
import { formatReelTaxonomyLabel } from "./reelNiches";

export type PrimaryNicheInput = {
  businessDescription?: string | null;
  targetAudience?: string | null;
  selectedNicheSlugs?: string[] | null;
};

/**
 * Prefer niche inferred from saved business + audience copy. Fall back to the
 * first onboarding interest slug for legacy accounts that never saved business.
 */
export function resolvePrimaryNicheSlug(input: PrimaryNicheInput): string {
  const business = input.businessDescription?.trim() ?? "";
  const audience = input.targetAudience?.trim() ?? "";
  const combined = [business, audience].filter(Boolean).join(" ");

  if (combined) {
    const inferred = inferNicheFromText(combined);
    if (inferred?.slug) return inferred.slug;
  }

  const slugs = input.selectedNicheSlugs ?? [];
  const first = typeof slugs[0] === "string" ? slugs[0].trim() : "";
  return first || "business-entrepreneurship";
}

export function resolvePrimaryNicheLabel(input: PrimaryNicheInput): string {
  return formatReelTaxonomyLabel(resolvePrimaryNicheSlug(input));
}

/** Put inferred slugs first while keeping any manual picks the user already saved. */
export function mergeInferredNicheSlugs(
  inferredSlugs: string[],
  existingSlugs: string[]
): string[] {
  const merged: string[] = [...inferredSlugs];
  for (const slug of existingSlugs) {
    const normalized = slug.trim();
    if (normalized && !merged.includes(normalized)) merged.push(normalized);
  }
  return merged.slice(0, 5);
}
