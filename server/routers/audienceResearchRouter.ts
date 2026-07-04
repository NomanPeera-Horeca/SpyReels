import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getCreatorCoachProfile } from "../planCoachProfile";
import { getOrFetchAudienceSignals } from "../audienceResearch/service";

function mapSignal(signal: {
  id?: number;
  source: "reddit" | "quora" | "web";
  title: string;
  snippet: string | null;
  sourceUrl: string;
  score: number;
  fetchedAt?: Date | string;
}) {
  return {
    id: signal.id ?? 0,
    source: signal.source,
    title: signal.title,
    snippet: signal.snippet,
    sourceUrl: signal.sourceUrl,
    score: signal.score,
    fetchedAt: signal.fetchedAt ?? null,
  };
}

export const audienceResearchRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const profile = await getCreatorCoachProfile(ctx.user.id);
    const { signals, fromCache } = await getOrFetchAudienceSignals({
      workspaceId: ctx.workspaceId,
      nicheSlug: profile.nicheSlug,
      nicheLabel: profile.niche,
      targetAudience: profile.targetAudience,
    });

    return {
      signals: signals.map(mapSignal),
      fromCache,
      niche: profile.niche,
    };
  }),

  refresh: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await getCreatorCoachProfile(ctx.user.id);
    const { signals } = await getOrFetchAudienceSignals({
      workspaceId: ctx.workspaceId,
      nicheSlug: profile.nicheSlug,
      nicheLabel: profile.niche,
      targetAudience: profile.targetAudience,
      forceRefresh: true,
    });

    if (!signals.length) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Could not fetch audience questions right now. Try again in a few minutes.",
      });
    }

    return {
      signals: signals.map(mapSignal),
      niche: profile.niche,
    };
  }),
});
