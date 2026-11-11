/**
 * Home v2 API (Phase 5). Every procedure checks the server-side Home switch
 * (assertHomeV2Access) and is read only, except switching the active
 * profile and queueing the shown public creators for background
 * pre-research (no user data). Nothing here scrapes, refreshes pools or
 * calls a model. Videos and
 * creators come from today's niche pools first, then the shared viral library
 * (matched to the profile's topics) so Home is never blank.
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
import { libraryHomeForProfile, homeVideoItems, mergeHomeLists } from "../viralPosts/libraryHome";
import { requestPrefetch, requestPrefetchForPosts } from "../research/prefetch";
import { withResearchAvatars } from "../research/creatorAvatars";
import { loadProvenIdeas, ownWinnersEnabled, profileHandles } from "../viralPosts/ownWinners";
import { combineProfilesEnabled, siblingProfileIds } from "../viralPosts/combinedProfile";
import { pillarIdeasForProfile, searchIdeasForProfile } from "../viralPosts/searchIdeas";

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

function libraryInput(userId: number, c: HomeContext) {
  return {
    userId,
    socialProfileId: c.socialProfileId,
    limit: HOME_VIDEO_LIMIT,
    creatorLimit: HOME_CREATOR_LIMIT,
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
    const [res, library] = await Promise.all([
      browseIndexedViralPosts(indexedBrowseInput(ctx.user.id, c)),
      libraryHomeForProfile(libraryInput(ctx.user.id, c)),
    ]);
    // Today's results first; the shared library fills the rest so Home is never blank.
    const merged = mergeHomeLists(
      res.creators,
      library?.creators ?? [],
      HOME_CREATOR_LIMIT,
      x => `${x.platform}:${x.handle.toLowerCase()}`
    );
    // Lasting creator photos from research (library photos are often missing or expired).
    const creators = await withResearchAvatars(merged);
    // Research these in the background so a click opens instantly. Never awaited.
    void requestPrefetch(creators);
    return { personalized: c.nicheLabel !== null, nicheLabel: c.nicheLabel, creators };
  }),

  videos: homeProcedure.query(async ({ ctx }) => {
    const c = await context(ctx);
    const [res, library] = await Promise.all([
      browseIndexedViralPosts(indexedBrowseInput(ctx.user.id, c)),
      libraryHomeForProfile(libraryInput(ctx.user.id, c)),
    ]);
    const items = homeVideoItems(res.items, library, HOME_VIDEO_LIMIT, x => `${x.platform}:${x.sourceId}`);
    void requestPrefetchForPosts(items);
    return { personalized: c.nicheLabel !== null, nicheLabel: c.nicheLabel, items };
  }),

  /**
   * "Your proven ideas": 3 of the creator's own videos that did >= 2x their
   * usual views (all their profiles when COMBINE_PROFILES is on), each with
   * the Prism formats that suit it. An extra section; the rest of Home is
   * unchanged. Empty when OWN_WINNERS is off.
   */
  provenIdeas: homeProcedure.query(async ({ ctx }) => {
    if (!ownWinnersEnabled()) return { items: [] };
    const c = await context(ctx);
    if (!c.socialProfileId) return { items: [] };
    try {
      const db = await getDb();
      if (!db) return { items: [] };
      const others = combineProfilesEnabled() ? await siblingProfileIds(db, c.socialProfileId) : [];
      const items = await loadProvenIdeas(db, {
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        accounts: await profileHandles(db, [c.socialProfileId, ...others]),
      });
      return { items };
    } catch (err) {
      console.warn("[home] proven_ideas_failed", { error: err instanceof Error ? err.message : String(err) });
      return { items: [] };
    }
  }),

  /** Video ideas from phrases people really search in the profile's topics (keyword bank). */
  searchIdeas: homeProcedure.query(async ({ ctx }) => {
    const c = await context(ctx);
    const ideas = await searchIdeasForProfile({ socialProfileId: c.socialProfileId, limit: 4 });
    // A new or very specific niche has no search phrases yet: offer the creator's own pillar sub-topics meanwhile.
    const pillarIdeas = ideas.length < 4 ? await pillarIdeasForProfile({ socialProfileId: c.socialProfileId, limit: 4 - ideas.length }) : [];
    return { ideas, pillarIdeas };
  }),

  profiles: homeProcedure.query(async ({ ctx }) => listWorkspaceProfiles(await requireDb(), octx(ctx))),

  switchProfile: homeProcedure
    .input(z.object({ profileId: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await switchActiveProfile(await requireDb(), octx(ctx), input.profileId);
      return { ok: true as const };
    }),
});
