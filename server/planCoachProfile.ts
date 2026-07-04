import { TRPCError } from "@trpc/server";
import { getOnboardingState } from "./db";
import { formatReelTaxonomyLabel } from "@shared/reelNiches";
import { resolvePrimaryNicheSlug } from "@shared/primaryNiche";

export type CreatorCoachProfile = {
  niche: string;
  nicheSlug: string;
  targetAudience: string;
  brandDescription: string | null;
};

export async function getCreatorCoachProfile(userId: number): Promise<CreatorCoachProfile> {
  const state = await getOnboardingState(userId);
  if (!state) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "User profile not found.",
    });
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
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Complete your profile in Settings before using the content plan or AI Coach.",
    });
  }

  return { niche, nicheSlug, targetAudience, brandDescription };
}
