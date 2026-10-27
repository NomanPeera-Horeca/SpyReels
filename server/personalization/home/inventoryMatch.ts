/**
 * Chooses which existing Viral Posts inventory a confirmed profile may read.
 * A stored taxonomy category uses the existing supply map. No category keeps
 * the legacy keyword path. This file does not create pools, refresh providers,
 * or rank posts.
 */
import { stableHash } from "@shared/personalization/state";
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

const STRATEGY_MARK = ":s";

/** Identity of the workspace strategy that built a daily feed. */
export function dailyFeedStrategyKey(input: {
  workspaceId: string;
  categoryLabel?: string | null;
  nicheLabel?: string | null;
  goalText?: string | null;
  audienceText?: string | null;
  pillarTitles?: string[];
}): string {
  const category = input.categoryLabel?.trim() ?? "";
  if (!category) {
    return stableHash(JSON.stringify({ workspaceId: input.workspaceId, mode: "legacy" }));
  }
  return stableHash(
    JSON.stringify({
      workspaceId: input.workspaceId,
      mode: "taxonomy",
      category,
      niche: input.nicheLabel?.trim() ?? "",
      goal: input.goalText?.trim() ?? "",
      audience: input.audienceText?.trim() ?? "",
      pillars: [...(input.pillarTitles ?? [])].map((title) => title.trim()).filter(Boolean).sort(),
    })
  );
}

/** Keep the reason prefix and record the strategy that produced this row. */
export function stampFeedStrategy(reason: string, strategyKey: string): string {
  const mark = reason.lastIndexOf(STRATEGY_MARK);
  const base = mark >= 0 ? reason.slice(0, mark) : reason;
  return `${base}${STRATEGY_MARK}${strategyKey}`.slice(0, 64);
}

export function strategyKeyFromGenerationReason(
  reason: string | null | undefined
): string | null {
  if (!reason) return null;
  const mark = reason.lastIndexOf(STRATEGY_MARK);
  if (mark < 0) return null;
  const key = reason.slice(mark + STRATEGY_MARK.length);
  return /^[0-9a-f]{16}$/.test(key) ? key : null;
}

/**
 * A feed with no recorded strategy stays cached only for a profile that still
 * has no category. A stored category, a different strategy, or a switch back
 * to legacy rebuilds today. Past dates are not part of this decision.
 */
export function dailyFeedCacheMatches(
  generationReason: string | null | undefined,
  strategyKey: string,
  hasStoredCategory: boolean
): boolean {
  const stored = strategyKeyFromGenerationReason(generationReason);
  if (stored) return stored === strategyKey;
  return !hasStoredCategory;
}
