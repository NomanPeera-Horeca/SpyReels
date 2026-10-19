/**
 * Onboarding v2 API (Phase 5). Every procedure except `experience` checks
 * the server-side rollout switch first (assertOnboardingV2Access), so these
 * endpoints are unreachable for customers until the CEO enables them.
 *
 * Costs: the first account analysis is part of onboarding and never touches
 * research credits (scrapeCount). Provider requests are metered and capped
 * per lookup and per analysis attempt. Refresh is not exposed here until its
 * allowance is approved.
 */
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ATTRIBUTION_SOURCES,
  PERSONALIZATION_STEPS,
  PRIMARY_USE_CASES,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@shared/personalization/model";
import { GROWTH_NICHE_OPTIONS } from "@shared/personalization/growthNiches";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { parseSocialHandle } from "@shared/personalization/state";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { assertOnboardingV2Access, getExperienceAccess } from "../experienceAccess";
import { createAnalysisStore, type Db } from "../personalization/db/analysisStore";
import { requestProfileAnalysis } from "../personalization/analysis/requestProfileAnalysis";
import {
  enqueueProfileAnalysis,
  enqueueRecommendations,
  getRecommendationState,
} from "../personalization/jobs";
import {
  addItem,
  completeOnboarding,
  confirmProfile,
  editItem,
  loadOnboardingState,
  removeItem,
  resolveStep,
  saveAttribution,
  setPillarSubtopicRemoved,
  saveUseCase,
  startNotPostingYet,
  type OnboardingCtx,
} from "../personalization/onboarding/onboardingService";
import { lookupPublicProfile } from "../personalization/onboarding/profileLookup";
import { productionLookupDeps } from "../personalization/onboarding/profileLookupDeps";

const v2Procedure = protectedProcedure.use(async ({ ctx, next }) => {
  await assertOnboardingV2Access(ctx.user);
  return next();
});

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
  return db as Db;
}

function octx(ctx: { user: { id: number }; workspaceId: string }): OnboardingCtx {
  return { userId: ctx.user.id, workspaceId: ctx.workspaceId };
}

/**
 * The profile the user saw on "Is this you?", kept server side so "That's
 * me" saves exactly what the provider returned (the client cannot change
 * the public facts). Per instance; a miss simply looks the profile up again.
 */
const LOOKUP_TTL_MS = 30 * 60 * 1000;
const lookupCache = new Map<string, { preview: PublicProfilePreview; at: number }>();
const cacheKey = (userId: number, platform: SocialPlatform, handle: string) =>
  `${userId}:${platform}:${handle}`;

function remember(userId: number, preview: PublicProfilePreview) {
  lookupCache.set(cacheKey(userId, preview.platform, preview.handle), { preview, at: Date.now() });
  if (lookupCache.size > 5000) {
    const oldest = lookupCache.keys().next().value;
    if (oldest) lookupCache.delete(oldest);
  }
}

function recall(userId: number, platform: SocialPlatform, handle: string) {
  const hit = lookupCache.get(cacheKey(userId, platform, handle));
  return hit && Date.now() - hit.at < LOOKUP_TTL_MS ? hit.preview : null;
}

const text = (max: number) => z.string().trim().min(1).max(max);
const itemPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("goal"), payload: z.object({ text: text(300) }) }),
  z.object({
    kind: z.literal("audience"),
    // outcome is optional: the single-field editor saves who only. An existing
    // outcome is kept by the client, never discarded.
    payload: z.object({ who: text(120), outcome: z.string().trim().max(160) }),
  }),
  z.object({
    kind: z.literal("pillar"),
    payload: z.object({ title: text(80), description: z.string().trim().max(200) }),
  }),
  z.object({
    kind: z.literal("niche"),
    payload: z.object({ slug: z.string().regex(/^[a-z0-9_]{1,40}$/), label: text(60) }),
  }),
  z.object({
    kind: z.literal("language"),
    payload: z.object({ code: z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/), label: text(40) }),
  }),
]);

/** Users can never type a "measured" number: pillars always save without a view share. */
function normalizePayload(input: z.infer<typeof itemPayload>) {
  return input.kind === "pillar"
    ? { ...input.payload, viewSharePercent: null }
    : input.payload;
}

async function startInitialAnalysis(db: Db, ctx: { user: { id: number }; workspaceId: string; workspaceRole: string }, profileId: string) {
  return requestProfileAnalysis(
    {
      store: createAnalysisStore(db),
      enqueue: enqueueProfileAnalysis,
      newId: randomUUID,
      now: () => new Date(),
    },
    {
      ctx: { user: ctx.user, workspaceId: ctx.workspaceId, workspaceRole: ctx.workspaceRole },
      socialProfileId: profileId,
      requestKind: "initial",
    }
  );
}

export const onboardingV2Router = router({
  /** Which onboarding and Home this user gets. Safe for every signed-in user. */
  experience: protectedProcedure.query(({ ctx }) => getExperienceAccess(ctx.user)),

  getState: v2Procedure.query(async ({ ctx }) => loadOnboardingState(await requireDb(), octx(ctx))),

  /** Step 1 -> 2. Public facts only; never charged to research credits. */
  lookupProfile: v2Procedure
    .input(z.object({ platform: z.enum(SOCIAL_PLATFORMS), input: z.string().max(300) }))
    .mutation(async ({ ctx, input }) => {
      const parsed = parseSocialHandle(input.platform, input.input);
      if (!parsed.ok) {
        const reason =
          parsed.reason === "platform_mismatch" || parsed.reason === "unsupported_link"
            ? parsed.reason
            : "invalid";
        return { ok: false as const, reason };
      }
      const result = await lookupPublicProfile({
        userId: ctx.user.id,
        platform: parsed.platform,
        handle: parsed.handle,
        deps: productionLookupDeps(),
      });
      if (!result.ok) return { ok: false as const, reason: result.reason };
      remember(ctx.user.id, result.profile);
      return { ok: true as const, profile: result.profile, typedHandle: parsed.handle };
    }),

  /** "That's me": save the profile and start the first analysis (included, no credits). */
  confirmProfile: v2Procedure
    .input(z.object({ platform: z.enum(SOCIAL_PLATFORMS), handle: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      let preview = recall(ctx.user.id, input.platform, input.handle);
      if (!preview) {
        const again = await lookupPublicProfile({
          userId: ctx.user.id,
          platform: input.platform,
          handle: input.handle,
          deps: productionLookupDeps(),
        });
        if (!again.ok) return { ok: false as const, reason: again.reason };
        preview = again.profile;
      }
      const { profileId } = await confirmProfile(db, octx(ctx), preview);
      const analysis = await startInitialAnalysis(db, ctx, profileId);
      return { ok: true as const, profileId, analysis: analysis.status };
    }),

  /** "Try again" after a failed analysis: same run, same budget (no new charge). */
  retryAnalysis: v2Procedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const state = await loadOnboardingState(db, octx(ctx));
    if (!state.profile || !state.profile.platform) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No account to analyze." });
    }
    const result = await startInitialAnalysis(db, ctx, state.profile.id);
    return { status: result.status };
  }),

  startNotPostingYet: v2Procedure
    .input(z.object({ nicheSlug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const niche = GROWTH_NICHE_OPTIONS.find(n => n.slug === input.nicheSlug);
      if (!niche) throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown niche" });
      return startNotPostingYet(await requireDb(), octx(ctx), { slug: niche.slug, label: niche.label });
    }),

  saveUseCase: v2Procedure
    .input(z.object({ value: z.enum(PRIMARY_USE_CASES) }))
    .mutation(async ({ ctx, input }) => {
      await saveUseCase(await requireDb(), octx(ctx), input.value);
      return { ok: true as const };
    }),

  /** value null = Skip (stored as unanswered, never as "Other"). */
  saveAttribution: v2Procedure
    .input(z.object({ value: z.enum(ATTRIBUTION_SOURCES).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await saveAttribution(await requireDb(), octx(ctx), input.value);
      return { ok: true as const };
    }),

  /** Ask the engine for this step's suggestions (cached for the same answers). */
  requestRecommendations: v2Procedure
    .input(z.object({ step: z.enum(PERSONALIZATION_STEPS) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const state = await loadOnboardingState(db, octx(ctx));
      if (!state.profile) throw new TRPCError({ code: "BAD_REQUEST", message: "No profile yet." });
      const mode = await enqueueRecommendations(
        {
          workspaceId: ctx.workspaceId,
          userId: ctx.user.id,
          socialProfileId: state.profile.id,
          step: input.step,
        },
        state.version
      );
      return { mode };
    }),

  recommendationStatus: v2Procedure
    .input(z.object({ step: z.enum(PERSONALIZATION_STEPS) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDb();
      const state = await loadOnboardingState(db, octx(ctx));
      if (!state.profile) return null;
      return getRecommendationState(state.profile.id, input.step, state.version);
    }),

  addItem: v2Procedure.input(itemPayload).mutation(async ({ ctx, input }) =>
    addItem(await requireDb(), octx(ctx), input.kind, normalizePayload(input) as never)
  ),

  editItem: v2Procedure
    .input(z.object({ itemId: z.string().uuid(), value: itemPayload }))
    .mutation(async ({ ctx, input }) =>
      editItem(await requireDb(), octx(ctx), input.itemId, normalizePayload(input.value) as never)
    ),

  /** Remove (removed: true) or restore (false) one AI subtopic of a pillar. */
  setSubtopicRemoved: v2Procedure
    .input(z.object({ itemId: z.string().uuid(), subtopicId: z.string().min(1).max(64), removed: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      setPillarSubtopicRemoved(await requireDb(), octx(ctx), input.itemId, input.subtopicId, input.removed)
    ),

  removeItem: v2Procedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await removeItem(await requireDb(), octx(ctx), input.itemId);
      return { ok: true as const };
    }),

  resolveStep: v2Procedure
    .input(z.object({ step: z.enum(PERSONALIZATION_STEPS), action: z.enum(["confirm", "skip"]) }))
    .mutation(async ({ ctx, input }) =>
      resolveStep(await requireDb(), octx(ctx), input.step, input.action)
    ),

  complete: v2Procedure.mutation(async ({ ctx }) => completeOnboarding(await requireDb(), octx(ctx))),
});
