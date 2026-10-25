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
} from "@shared/personalization/model";
import { GROWTH_NICHE_OPTIONS } from "@shared/personalization/growthNiches";
import { parseSocialHandle } from "@shared/personalization/state";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { assertOnboardingV2Access, getExperienceAccess } from "../experienceAccess";
import { createAnalysisStore, type Db } from "../personalization/db/analysisStore";
import { requestProfileAnalysis } from "../personalization/analysis/requestProfileAnalysis";
import { profileEvidenceFromPreview, publicWebsiteUrl } from "../personalization/onboarding/profileEvidence";
import { scheduleWebsiteIntelligence, startWebsiteIntelligence } from "../personalization/onboarding/websiteIntelligence";
import {
  enqueuePreliminarySuggestions,
  enqueueProfileAnalysis,
  enqueueRecommendations,
  getRecommendationState,
} from "../personalization/jobs";
import { requestPillarSubtopics } from "../personalization/subtopicJobs";
import { createPillarTopicGenerator } from "../personalization/pillarTopicGenerator";
import { SubtopicStoreError } from "../personalization/subtopics";
import {
  addPillarSubtopic,
  dismissPillarSubtopic,
  restorePillarSubtopic,
} from "../personalization/subtopics";
import {
  addItem,
  completeOnboarding,
  confirmProfile,
  editItem,
  loadOnboardingState,
  recordFirstVisibleSuggestion,
  removeItem,
  restorePersonalizationItem,
  resolveStep,
  saveAttribution,
  saveUseCase,
  startNotPostingYet,
  type OnboardingCtx,
} from "../personalization/onboarding/onboardingService";
import { lookupPublicProfile, recallCachedPublicProfile } from "../personalization/onboarding/profileLookup";
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

/** A topic write against a database missing 0104/0105 fails with a named error, never silently. */
async function withTopicStore<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof SubtopicStoreError) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Topic storage is not ready. Run the pending migration." });
    }
    throw err;
  }
}

const text = (max: number) => z.string().trim().min(1).max(max);
const itemPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("goal"), payload: z.object({ text: text(300) }) }),
  z.object({
    kind: z.literal("audience"),
    // outcome is optional: the single-field editor saves who only. An existing
    // outcome is kept by the client, never discarded.
    payload: z.object({
      who: text(120),
      outcome: z.string().trim().max(160),
      problem: z.string().trim().max(160).optional(),
    }),
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
        warmMedia: true,
      });
      if (!result.ok) return { ok: false as const, reason: result.reason };
      return { ok: true as const, profile: result.profile, typedHandle: parsed.handle };
    }),

  /** "That's me": save the profile and start the first analysis (included, no credits). */
  confirmProfile: v2Procedure
    .input(z.object({ platform: z.enum(SOCIAL_PLATFORMS), handle: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      let preview = recallCachedPublicProfile(input.platform, input.handle);
      if (!preview) {
        const again = await lookupPublicProfile({
          userId: ctx.user.id,
          platform: input.platform,
          handle: input.handle,
          deps: productionLookupDeps(),
          warmMedia: true,
        });
        if (!again.ok) return { ok: false as const, reason: again.reason };
        preview = again.profile;
      }
      const { profileId } = await confirmProfile(db, octx(ctx), preview);
      const analysis = await startInitialAnalysis(db, ctx, profileId);
      if (analysis.status !== "rejected") {
        try {
          const store = createAnalysisStore(db);
          await store.saveProfileEvidence(
            analysis.runId,
            profileEvidenceFromPreview(preview),
            {
              platform: preview.platform,
              handle: preview.handle,
              followerCount: preview.followerCount,
            }
          );
          const version = await store.loadPersonalizationVersion(profileId);
          await scheduleWebsiteIntelligence({
            enqueueSuggestions: () =>
              enqueuePreliminarySuggestions({
                workspaceId: ctx.workspaceId,
                userId: ctx.user.id,
                socialProfileId: profileId,
                version,
              }),
            websiteUrl: publicWebsiteUrl(preview.externalUrl),
            start: url =>
              startWebsiteIntelligence({
                runId: analysis.runId,
                url,
                store,
                onStored: () => {
                  void store
                    .loadPersonalizationVersion(profileId)
                    .then(version =>
                      enqueuePreliminarySuggestions({
                        workspaceId: ctx.workspaceId,
                        userId: ctx.user.id,
                        socialProfileId: profileId,
                        version,
                      })
                    )
                    .catch(err => {
                      console.warn("[personalization] website_suggestions_not_started", {
                        profileId,
                        reason: err instanceof Error ? err.name : "error",
                      });
                    });
                },
              }),
          });
        } catch (err) {
          console.warn("[personalization] preliminary_suggestions_not_started", {
            profileId,
            reason: err instanceof Error ? err.name : "error",
          });
        }
      }
      return { ok: true as const, profileId, analysis: analysis.status };
    }),

  /** Client can see a saved suggestion. Internal QA accounts are included. No profile text. */
  noteSuggestionVisible: v2Procedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    await recordFirstVisibleSuggestion(db, octx(ctx));
    return { ok: true as const };
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
      return getRecommendationState(
        state.profile.id,
        ctx.workspaceId,
        input.step,
        state.version
      );
    }),

  addItem: v2Procedure.input(itemPayload).mutation(async ({ ctx, input }) =>
    addItem(await requireDb(), octx(ctx), input.kind, normalizePayload(input) as never)
  ),

  editItem: v2Procedure
    .input(z.object({ itemId: z.string().uuid(), value: itemPayload }))
    .mutation(async ({ ctx, input }) =>
      editItem(await requireDb(), octx(ctx), input.itemId, normalizePayload(input.value) as never)
    ),

  removeItem: v2Procedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await removeItem(await requireDb(), octx(ctx), input.itemId);
      return { ok: true as const };
    }),

  /** Undo a user delete of a goal, audience, pillar, niche or language. */
  restorePersonalizationItem: v2Procedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) =>
      restorePersonalizationItem(await requireDb(), octx(ctx), input.itemId)
    ),

  resolveStep: v2Procedure
    .input(z.object({ step: z.enum(PERSONALIZATION_STEPS), action: z.enum(["confirm", "skip"]) }))
    .mutation(async ({ ctx, input }) =>
      resolveStep(await requireDb(), octx(ctx), input.step, input.action)
    ),

  complete: v2Procedure.mutation(async ({ ctx }) => completeOnboarding(await requireDb(), octx(ctx))),

  /**
   * Claude's editing UI: add a subtopic the user typed.
   * A label they previously dismissed is not recreated.
   */
  addPillarSubtopic: v2Procedure
    .input(z.object({
      pillarItemId: z.string().uuid(),
      label: z.string().trim().min(1).max(80),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const state = await loadOnboardingState(db, octx(ctx));
      if (!state.profile) throw new TRPCError({ code: "BAD_REQUEST", message: "No profile yet." });
      const result = await withTopicStore(() => addPillarSubtopic(db, {
        workspaceId: ctx.workspaceId,
        socialProfileId: state.profile!.id,
        pillarItemId: input.pillarItemId,
        label: input.label,
      }));
      if (!result.ok && result.reason === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pillar not found." });
      }
      return result;
    }),

  /** Claude's editing UI: remove a subtopic. The row stays, with its previous status saved. */
  dismissPillarSubtopic: v2Procedure
    .input(z.object({ subtopicId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const state = await loadOnboardingState(db, octx(ctx));
      if (!state.profile) throw new TRPCError({ code: "BAD_REQUEST", message: "No profile yet." });
      const result = await withTopicStore(() => dismissPillarSubtopic(db, {
        workspaceId: ctx.workspaceId,
        socialProfileId: state.profile!.id,
        subtopicId: input.subtopicId,
      }));
      if (!result.ok && result.reason === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Subtopic not found." });
      }
      return result;
    }),

  /** Undo one subtopic dismissal. Does not restore any other topic. */
  restorePillarSubtopic: v2Procedure
    .input(z.object({ subtopicId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const state = await loadOnboardingState(db, octx(ctx));
      if (!state.profile) throw new TRPCError({ code: "BAD_REQUEST", message: "No profile yet." });
      const result = await withTopicStore(() => restorePillarSubtopic(db, {
        workspaceId: ctx.workspaceId,
        socialProfileId: state.profile!.id,
        subtopicId: input.subtopicId,
      }));
      if (!result.ok && result.reason === "not_found") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Subtopic not found." });
      }
      if (!result.ok) {
        // Refused, never guessed: the topic keeps its state and Undo says why.
        throw new TRPCError({ code: "CONFLICT", message: "This topic cannot be restored." });
      }
      return result;
    }),

  /**
   * The only way topic ideas are generated: the user asks for one pillar.
   * Bounded by attempts, cooldown and a per-profile hourly limit (see subtopicJobs.ts).
   */
  requestPillarSubtopics: v2Procedure
    .input(z.object({ pillarItemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const state = await loadOnboardingState(db, octx(ctx));
      if (!state.profile) throw new TRPCError({ code: "BAD_REQUEST", message: "No profile yet." });
      return withTopicStore(() =>
        requestPillarSubtopics(
          db,
          { generate: createPillarTopicGenerator(db) },
          {
            workspaceId: ctx.workspaceId,
            socialProfileId: state.profile!.id,
            pillarItemId: input.pillarItemId,
          }
        )
      );
    }),
});
