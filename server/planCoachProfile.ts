import { TRPCError } from "@trpc/server";
import { resolveContentCategory } from "@shared/personalization/contentTaxonomy";
import { resolvePrimaryNicheSlug } from "@shared/primaryNiche";
import { formatReelTaxonomyLabel } from "@shared/reelNiches";
import { getOnboardingState } from "./db";
import { loadActiveNichePayload } from "./personalization/activeNiche";
import { coachBrandDescription, loadCoachPersonalization } from "./personalization/coachProfileLoader";

export type CreatorCoachProfile = {
  niche: string;
  nicheSlug: string;
  targetAudience: string;
  brandDescription: string | null;
};

export async function getCreatorCoachProfile(
  userId: number,
  opts: {
    /**
     * Agent / 30-Day Plan: use the creator's confirmed profile (niche,
     * audiences, goal, pillars) through coachProfileResolver. Other callers
     * keep the old fields exactly as before.
     */
    confirmedProfile?: boolean;
    workspaceId?: string;
  } = {}
): Promise<CreatorCoachProfile> {
  const state = await getOnboardingState(userId);
  if (!state) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "User profile not found.",
    });
  }

  if (opts.confirmedProfile && opts.workspaceId) {
    const personal = await loadCoachPersonalization(userId, opts.workspaceId, {
      selectedNicheSlugs: state.selectedNicheSlugs ?? [],
      businessDescription: state.businessDescription ?? null,
      targetAudience: state.targetAudience ?? null,
      onboardingCompletedAt: state.onboardingCompletedAt ?? null,
      onboardingSkippedAt: state.onboardingSkippedAt ?? null,
    });
    if (personal) {
      if (!personal.resolution.hasEnoughToPlan) throw profileIncomplete();
      const p = personal.resolution.profile;
      // Keep the taxonomy slug exactly as before (audience research and pools key on it).
      const stored = await loadActiveNichePayload(userId);
      const legacySlug = resolvePrimaryNicheSlug({
        businessDescription: state.businessDescription,
        targetAudience: state.targetAudience,
        selectedNicheSlugs: state.selectedNicheSlugs ?? [],
      });
      return {
        niche: p.niche,
        nicheSlug: resolveContentCategory(stored?.categoryLabel)?.slug ?? legacySlug,
        targetAudience: p.targetAudience,
        brandDescription: coachBrandDescription(p.brandDescription, personal.goals, personal.pillars),
      };
    }
  }

  const slugs = state.selectedNicheSlugs ?? [];
  const nicheSlug = resolvePrimaryNicheSlug({
    businessDescription: state.businessDescription,
    targetAudience: state.targetAudience,
    selectedNicheSlugs: slugs,
  });
  const niche = formatReelTaxonomyLabel(nicheSlug);
  const targetAudience = state.targetAudience?.trim() || "General audience";
  const brandDescription = state.businessDescription?.trim() || null;

  if (!brandDescription && !state.onboardingCompletedAt && !state.onboardingSkippedAt) {
    throw profileIncomplete();
  }

  const stored = await loadActiveNichePayload(userId);
  const specific = stored?.label?.trim();
  if (!specific) return { niche, nicheSlug, targetAudience, brandDescription };
  const category = resolveContentCategory(stored?.categoryLabel);
  return {
    niche: specific,
    nicheSlug: category?.slug ?? nicheSlug,
    targetAudience,
    brandDescription,
  };
}

function profileIncomplete(): TRPCError {
  return new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Complete your profile in Settings before using the content plan or AI Coach.",
  });
}
