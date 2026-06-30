import { TRPCError } from "@trpc/server";
import { getOnboardingState } from "./db";
import { formatReelTaxonomyLabel } from "@shared/reelNiches";

export type CreatorCoachProfile = {
  niche: string;
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
  const firstSlug = typeof slugs[0] === "string" ? slugs[0].trim() : "";
  const niche = firstSlug ? formatReelTaxonomyLabel(firstSlug) : "Content creator";
  const targetAudience = state.targetAudience?.trim() || "General audience";
  const brandDescription = state.businessDescription?.trim() || null;

  if (!brandDescription && !state.onboardingCompletedAt && !state.onboardingSkippedAt) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Complete your profile in Settings before using the content plan or AI Coach.",
    });
  }

  return { niche, targetAudience, brandDescription };
}
