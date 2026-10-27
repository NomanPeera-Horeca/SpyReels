/**
 * Home v2 API (Phase 5). Every procedure checks the server-side Home switch
 * (assertHomeV2Access) and is read only, except switching the active
 * profile. Nothing here scrapes, refreshes pools or calls a model.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { assertHomeV2Access } from "../experienceAccess";
import type { Db } from "../personalization/db/analysisStore";
import {
  listWorkspaceProfiles,
  loadOnboardingState,
  switchActiveProfile,
  type OnboardingCtx,
} from "../personalization/onboarding/onboardingService";
import {
  CREATOR_SIGNAL_RECENT_DAYS,
  HOME_CREATOR_LIMIT,
  homeContextFromState,
  videoMatchText,
  type HomeContext,
} from "../personalization/home/homeService";
import { contentInventoryPlan } from "../personalization/home/inventoryMatch";
import { browseIndexedViralPosts } from "../viralPosts/browseService";

export const HOME_VIDEO_LIMIT = 4;

function indexedBrowseInput(userId: number, c: HomeContext) {
  const plan = contentInventoryPlan({
    categoryLabel: c.categoryLabel,
    nicheLabel: c.nicheLabel,
    pillarTitles: c.pillarTitles,
    goalText: c.goalText,
    audienceText: c.audienceText,
  });
  const taxonomy = plan.mode === "taxonomy";
  return {
    userId,
    description: taxonomy ? c.nicheLabel : videoMatchText(c),
    pillars: c.pillarTitles,
    goalText: c.goalText,
    audienceText: c.audienceText,
    matchMode: taxonomy ? ("taxonomy" as const) : ("legacy" as const),
    categoryLabel: taxonomy ? c.categoryLabel : null,
    specificNiche: taxonomy ? c.nicheLabel : null,
    limit: HOME_VIDEO_LIMIT,
    creatorLimit: HOME_CREATOR_LIMIT,
    recentDays: CREATOR_SIGNAL_RECENT_DAYS,
  };
}

const homeProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  await assertHomeV2Access(ctx.user);
  return next();
});

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db as Db;
}

const octx = (ctx: { user: { id: number }; workspaceId: string }): OnboardingCtx => ({
  userId: ctx.user.id,
  workspaceId: ctx.workspaceId,
});

async function context(ctx: { user: { id: number }; workspaceId: string }) {
  const db = await requireDb();
  return homeContextFromState(await loadOnboardingState(db, octx(ctx)));
}

export const homeV2Router = router({
  context: homeProcedure.query(({ ctx }) => context(ctx)),

  creators: homeProcedure.query(async ({ ctx }) => {
    const c = await context(ctx);
    const res = await browseIndexedViralPosts(indexedBrowseInput(ctx.user.id, c));
    return { personalized: c.nicheLabel !== null, nicheLabel: c.nicheLabel, creators: res.creators };
  }),

  videos: homeProcedure.query(async ({ ctx }) => {
    const c = await context(ctx);
    const res = await browseIndexedViralPosts(indexedBrowseInput(ctx.user.id, c));
    return { personalized: c.nicheLabel !== null, nicheLabel: c.nicheLabel, items: res.items };
  }),

  profiles: homeProcedure.query(async ({ ctx }) => listWorkspaceProfiles(await requireDb(), octx(ctx))),

  switchProfile: homeProcedure
    .input(z.object({ profileId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await switchActiveProfile(await requireDb(), octx(ctx), input.profileId);
      return { ok: true as const };
    }),
});
