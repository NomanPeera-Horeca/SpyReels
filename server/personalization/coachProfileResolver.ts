/**
 * Backward-compatible personalization reader (pure).
 *
 * Produces the SAME shape as server/planCoachProfile.ts (CreatorCoachProfile)
 * so the 30-Day Plan, AI Coach and remake flows can switch to it without
 * changes. With no new-model data it returns exactly what
 * getCreatorCoachProfile returns today (pinned by tests).
 *
 * Not wired yet: planCoachProfile.ts is unchanged until the migration is
 * applied and approved. Wiring = load the active profile + its items through
 * the workspace authorization helpers, then call this.
 *
 * Priority per field:
 * 1. confirmed values of the ACTIVE profile (any source)
 * 2. user-written values of that profile not yet confirmed (user_entered / user_edited)
 * 3. legacy users.* columns
 * 4. the existing defaults
 * AI suggestions the user has not confirmed are never used. Dismissed,
 * superseded and stale rows are never used. Items of any other profile or
 * workspace are ignored and counted, never merged.
 */
import { resolvePrimaryNicheSlug } from "@shared/primaryNiche";
import { formatReelTaxonomyLabel } from "@shared/reelNiches";
import type {
  ItemPayloadByKind,
  PersonalizationItemKind,
} from "@shared/personalization/model";
import {
  isStaleSuggestion,
  type ItemRecord,
} from "@shared/personalization/state";

export type CreatorCoachProfileShape = {
  niche: string;
  nicheSlug: string;
  targetAudience: string;
  brandDescription: string | null;
};

export type LegacyCoachState = {
  selectedNicheSlugs: string[] | null;
  businessDescription: string | null;
  targetAudience: string | null;
  onboardingCompletedAt: Date | null;
  onboardingSkippedAt: Date | null;
};

export type ScopedItem = ItemRecord & {
  socialProfileId: string;
  workspaceId: string;
  sortOrder: number;
};

export type FieldSource =
  | "confirmed"
  | "user_entered"
  | "legacy"
  | "inferred"
  | "default";

export type CoachProfileResolution = {
  profile: CreatorCoachProfileShape;
  sources: {
    niche: FieldSource;
    targetAudience: FieldSource;
    brandDescription: FieldSource;
  };
  /** false = same condition that makes getCreatorCoachProfile throw PRECONDITION_FAILED today. */
  hasEnoughToPlan: boolean;
  ignored: {
    otherProfileOrWorkspace: number;
    aiUnconfirmed: number;
    stale: number;
    dismissedOrSuperseded: number;
  };
};

type Tier = { items: ScopedItem[]; source: "confirmed" | "user_entered" };

export function resolveCoachPersonalization(input: {
  workspaceId: string;
  legacy: LegacyCoachState;
  /** The member's active profile in THIS workspace (already authorized), or null. */
  activeProfile: {
    id: string;
    workspaceId: string;
    deletedAt: Date | null;
  } | null;
  items: ScopedItem[] | null;
  personalizationVersion: number;
}): CoachProfileResolution {
  const ignored = {
    otherProfileOrWorkspace: 0,
    aiUnconfirmed: 0,
    stale: 0,
    dismissedOrSuperseded: 0,
  };
  const usableProfile =
    input.activeProfile &&
    input.activeProfile.workspaceId === input.workspaceId &&
    input.activeProfile.deletedAt === null
      ? input.activeProfile
      : null;

  const own: ScopedItem[] = [];
  for (const item of input.items ?? []) {
    if (
      !usableProfile ||
      item.socialProfileId !== usableProfile.id ||
      item.workspaceId !== input.workspaceId
    ) {
      ignored.otherProfileOrWorkspace++;
      continue;
    }
    if (item.status === "dismissed" || item.status === "superseded") {
      ignored.dismissedOrSuperseded++;
      continue;
    }
    if (isStaleSuggestion(item, input.personalizationVersion)) {
      ignored.stale++;
      continue;
    }
    if (item.status === "suggested" && item.source === "ai_suggested") {
      ignored.aiUnconfirmed++;
      continue;
    }
    own.push(item);
  }

  const pick = <K extends PersonalizationItemKind>(kind: K): Tier | null => {
    const ofKind = own
      .filter(i => i.kind === kind)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    const confirmed = ofKind.filter(i => i.status === "confirmed");
    if (confirmed.length) return { items: confirmed, source: "confirmed" };
    const typed = ofKind.filter(
      i => i.source === "user_entered" || i.source === "user_edited"
    );
    if (typed.length) return { items: typed, source: "user_entered" };
    return null;
  };

  // Brand description
  const brandTier = pick("brand_description");
  const legacyBrand = input.legacy.businessDescription?.trim() || null;
  const brandDescription = brandTier
    ? (
        brandTier.items[0].payload as ItemPayloadByKind["brand_description"]
      ).text.trim() || null
    : legacyBrand;
  const brandSource: FieldSource = brandTier
    ? brandTier.source
    : legacyBrand
      ? "legacy"
      : "default";

  // Audience: several audiences of the SAME profile are listed together.
  const audienceTier = pick("audience");
  const legacyAudience = input.legacy.targetAudience?.trim() || null;
  const audienceText = audienceTier
    ? audienceTier.items
        .map(i => {
          const a = i.payload as ItemPayloadByKind["audience"];
          const who = a.who.trim();
          const outcome = a.outcome.trim();
          return outcome ? `${who} (to help them ${outcome})` : who;
        })
        .filter(Boolean)
        .join("; ")
    : null;
  const targetAudience = audienceText || legacyAudience || "General audience";
  const audienceSource: FieldSource = audienceText
    ? audienceTier!.source
    : legacyAudience
      ? "legacy"
      : "default";

  // Niche: an explicit niche wins; otherwise the existing inference.
  const nicheTier = pick("niche");
  let nicheSlug: string;
  let nicheSource: FieldSource;
  let nicheLabel: string | null = null;
  if (nicheTier) {
    const payload = nicheTier.items[0].payload as ItemPayloadByKind["niche"];
    nicheSlug = payload.slug;
    nicheLabel = payload.label.trim() || null;
    nicheSource = nicheTier.source;
  } else {
    nicheSlug = resolvePrimaryNicheSlug({
      businessDescription: brandDescription,
      targetAudience: audienceText ?? input.legacy.targetAudience,
      selectedNicheSlugs: input.legacy.selectedNicheSlugs ?? [],
    });
    nicheSource =
      brandDescription ||
      audienceText ||
      legacyAudience ||
      (input.legacy.selectedNicheSlugs ?? []).length
        ? "inferred"
        : "default";
  }

  const confirmedStrategy = own.some(i => i.status === "confirmed");
  const hasEnoughToPlan =
    Boolean(brandDescription) ||
    confirmedStrategy ||
    Boolean(input.legacy.onboardingCompletedAt) ||
    Boolean(input.legacy.onboardingSkippedAt);

  return {
    profile: {
      niche: nicheLabel || formatReelTaxonomyLabel(nicheSlug),
      nicheSlug,
      targetAudience,
      brandDescription,
    },
    sources: {
      niche: nicheSource,
      targetAudience: audienceSource,
      brandDescription: brandSource,
    },
    hasEnoughToPlan,
    ignored,
  };
}
