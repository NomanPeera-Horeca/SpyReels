/**
 * Chooses which existing Viral Posts inventory a confirmed profile may read.
 * A stored taxonomy category uses the existing supply map. No category keeps
 * the legacy keyword path. This file does not create pools, refresh providers,
 * or rank posts.
 */
import { indexedHomePoolSpecChoices } from "../../viralPosts/browseService";

type PoolPlan = ReturnType<typeof indexedHomePoolSpecChoices>;

export type ContentInventoryPlan =
  | { mode: "legacy" }
  | { mode: "taxonomy"; plan: PoolPlan };

export function contentInventoryPlan(input: {
  categoryLabel?: string | null;
  nicheLabel?: string | null;
  pillarTitles?: string[];
  goalText?: string | null;
  audienceText?: string | null;
  platforms?: { instagram: boolean; tiktok: boolean; youtube: boolean };
}): ContentInventoryPlan {
  const category = input.categoryLabel?.trim() ?? "";
  if (!category) return { mode: "legacy" };
  return {
    mode: "taxonomy",
    plan: indexedHomePoolSpecChoices({
      nicheText: input.nicheLabel ?? "",
      confirmedPillars: input.pillarTitles ?? [],
      goalText: input.goalText,
      audienceText: input.audienceText,
      useStoredCategory: true,
      categoryLabel: category,
      platforms: input.platforms,
    }),
  };
}

export type DailyFeedInventory =
  | { mode: "legacy" }
  | {
      mode: "taxonomy";
      niche: string;
      confirmedSpecs: PoolPlan["confirmedSpecs"];
      fallbackSpecs: PoolPlan["fallbackSpecs"];
    };

/** Same pool decision as Home. An empty niche means no relevant supply. */
export function dailyFeedInventoryDecision(
  stored: {
    categoryLabel: string;
    nicheLabel: string;
    pillarTitles: string[];
    goalText: string | null;
    audienceText: string | null;
    platforms?: { instagram: boolean; tiktok: boolean; youtube: boolean };
  } | null
): DailyFeedInventory {
  if (!stored?.categoryLabel.trim()) return { mode: "legacy" };
  const plan = contentInventoryPlan(stored);
  if (plan.mode !== "taxonomy" || !plan.plan.niche) {
    return { mode: "taxonomy", niche: "", confirmedSpecs: [], fallbackSpecs: [] };
  }
  return {
    mode: "taxonomy",
    niche: plan.plan.niche,
    confirmedSpecs: plan.plan.confirmedSpecs,
    fallbackSpecs: plan.plan.fallbackSpecs,
  };
}

/** A categorized feed with no relevant inventory stays empty. */
export function preservesEmptyTaxonomyFeed(
  generationReason: string | null | undefined
): boolean {
  return (generationReason ?? "").startsWith("taxonomy_");
}
