import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { featuredAccounts, users } from "../../drizzle/schema";
import type { User } from "../../drizzle/schema";
import { inferOnboardingSlugsFromDescription, shouldAskCreatorContextQuestion } from "../../shared/onboardingDescription";
import { routeNiche as routeNichePrompt } from "../ai/prompts/niche-routing";
import { getOnboardingState, updateOnboardingState, getDb, seedDemoScrape, markOnboardingComplete, markOnboardingEntered, updateUserPersonalization, getScrapeJob, markOnboardingSkipped } from "../db";
import { getOnboardingGenerationProgress } from "../onboardingGenerationProgress";
import { runOnboardingStartCreating } from "../onboardingStartCreating";
import { and, not, or, eq } from "drizzle-orm";
import { ONBOARDING_NICHES } from "@/data/onboardingNiches";

function onboardingSlugForNicheName(name: string): string | null {
  const trimmed = name.trim();
  const hit = ONBOARDING_NICHES.find(
    (n) => n.name === trimmed || n.name.toLowerCase() === trimmed.toLowerCase()
  );
  return hit?.slug ?? null;
}

function selectedSlugsFromNicheRouting(result: {
  primary_niche: string;
  secondary_niches: string[];
}): string[] {
  const slugs: string[] = [];
  const primary = onboardingSlugForNicheName(result.primary_niche);
  if (primary) slugs.push(primary);
  for (const secondary of result.secondary_niches) {
    if (slugs.length >= 3) break;
    const slug = onboardingSlugForNicheName(secondary);
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  if (slugs.length === 0) {
    slugs.push("business-entrepreneurship");
  }
  return slugs.slice(0, 3);
}

/**
 * Detects whether a business description clearly signals a B2C hospitality/venue creator
 * (posting content for guests, diners, travellers) vs a B2B seller targeting operators.
 *
 * Returns a clarification string to inject into the niche routing prompt,
 * or null if no strong signal is found.
 */
function detectHospitalityB2CContext(description: string): string | null {
  const d = description.toLowerCase();

  const b2cPatterns = [
    /\bmy (hotel|motel|resort|boutique hotel|bed and breakfast|b&b|airbnb|bnb)\b/,
    /\bmy (restaurant|cafe|coffee shop|bistro|brasserie|diner|eatery|bar|pub|tavern|lounge|rooftop bar|speakeasy)\b/,
    /\bmy (venue|event space|wedding venue|banquet hall)\b/,
    /\b(we (are|run|own|operate)|i (run|own|operate)) a (hotel|resort|restaurant|cafe|bar|venue|spa)\b/,
    /content (for|about) (our |my )?(guests|visitors|diners|customers|travellers|tourists)/,
    /show(ing)? (guests|visitors|diners|people) (around|what|how|why)/,
    /attract (guests|visitors|diners|tourists|customers) (to|for)/,
    /\b(guest experience|guest journey|dining experience|hotel experience)\b/,
  ];

  const b2bPatterns = [
    /sell(ing)? to (hotels|restaurants|operators|hospitality businesses)/,
    /\b(hospitality software|hotel management system|pos system|restaurant tech|property management)\b/,
    /\b(wholesale|distributor|supplier)\b.*\b(hotel|restaurant)\b/,
    /\b(hotel|restaurant) owner(s)?\b.*\b(buy|purchase|invest|subscribe)\b/,
  ];

  const hasB2CSignal = b2cPatterns.some((p) => p.test(d));
  const hasB2BSignal = b2bPatterns.some((p) => p.test(d));

  if (hasB2CSignal && !hasB2BSignal) {
    return "This creator owns or runs a hospitality or food and beverage venue. They are making content FOR their guests, diners, or visitors to attract and inspire them. They are a B2C creator. Route to Restaurants & Cafes, Travel, Food & Cooking, or similar consumer-facing niches. Do NOT route to Business & Entrepreneurship.";
  }

  return null;
}


export const onboardingRouter = router({
    /**
     * Returns all 8 onboarding fields in one call. The dashboard demo
     * banner (spec §7.4) keys off `demoSeededAt`, the OnboardingGate
     * keys off the `onboarding{Completed,Skipped}At` timestamps, and
     * the Step 1 niche grid pre-hydrates off `selectedNicheSlugs` —
     * all bundled here so the client only pays one round-trip.
     */
    getState: protectedProcedure.query(async ({ ctx }) => {
      const state = await getOnboardingState(ctx.user.id);
      if (!state) {
        // ctx.user is set by `requireUser`, so the row must exist. If
        // it doesn't, something upstream is very wrong.
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }
      return {
        hasSeenWelcome: state.hasSeenWelcome,
        hasDismissedHintCard: state.hasDismissedHintCard,
        hasCompletedFirstSpy: state.hasCompletedFirstSpy,
        hasDismissedDemoBanner: state.hasDismissedDemoBanner,
        demoSeededAt: state.demoSeededAt,
        selectedNicheSlugs: state.selectedNicheSlugs ?? [],
        selectedCreatorHandles: state.selectedCreatorHandles ?? null,
        businessDescription: state.businessDescription ?? null,
        targetAudience: state.targetAudience ?? null,
        onboardingCompletedAt: state.onboardingCompletedAt,
        onboardingSkippedAt: state.onboardingSkippedAt,
        onboardingEnteredAt: state.onboardingEnteredAt,
      };
    }),

    /**
     * First time the account actually opens onboarding. This is the
     * interrupted state: later visits to Home or research are not forced
     * back. Repeat calls keep the original timestamp.
     */
    markEntered: protectedProcedure.mutation(async ({ ctx }) => {
      await markOnboardingEntered(ctx.user.id);
      return { success: true as const };
    }),

    /** Fires on any welcome-modal action (close, tour, demo, overlay). */
    dismissWelcome: protectedProcedure.mutation(async ({ ctx }) => {
      await updateOnboardingState(ctx.user.id, { hasSeenWelcome: true });
      return { success: true };
    }),

    /** 3-step hint card on /research dismissed via its X button. */
    dismissHintCard: protectedProcedure.mutation(async ({ ctx }) => {
      await updateOnboardingState(ctx.user.id, { hasDismissedHintCard: true });
      return { success: true };
    }),

    /** Dashboard demo banner X button (spec §7.4). */
    dismissDemoBanner: protectedProcedure.mutation(async ({ ctx }) => {
      await updateOnboardingState(ctx.user.id, { hasDismissedDemoBanner: true });
      return { success: true };
    }),

    /**
     * Maps free-text business description to onboarding niche slugs via AI.
     * Called before `complete` when the user submits the fill-in-the-blank step.
     */
    routeNiche: protectedProcedure
      .input(
        z.object({
          businessDescription: z.string().min(3).max(500),
        })
      )
      .mutation(async ({ input }) => {
        const clarificationContext = detectHospitalityB2CContext(input.businessDescription);

        const finalizeRouteNicheResponse = (
          routed: Awaited<ReturnType<typeof routeNichePrompt>>,
          businessDescription: string
        ) => {
          const slugs = selectedSlugsFromNicheRouting(routed);
          const keywordSlugs = inferOnboardingSlugsFromDescription(businessDescription);
          const useKeywords =
            slugs.length === 0 ||
            (slugs.length === 1 &&
              slugs[0] === "business-entrepreneurship" &&
              keywordSlugs[0] !== "business-entrepreneurship");
          const askFollowUp = shouldAskCreatorContextQuestion(businessDescription);
          const aiQuestion = routed.clarifying_question?.trim() || null;
          return {
            selectedSlugs: useKeywords ? keywordSlugs : slugs,
            confidence: askFollowUp ? routed.confidence : 0.9,
            clarifyingQuestion: askFollowUp && aiQuestion ? aiQuestion : null,
          };
        };

        try {
          const result = await routeNichePrompt({
            businessDescription: input.businessDescription,
            clarificationContext,
          });

          if (
            clarificationContext &&
            result.business_type === "B2B" &&
            result.confidence > 0.5
          ) {
            const correctedResult = await routeNichePrompt({
              businessDescription: input.businessDescription,
              clarificationContext:
                clarificationContext +
                " IMPORTANT: The user is definitively a B2C creator. business_type must be B2C. Do not route to Business & Entrepreneurship.",
            });
            if (correctedResult.business_type !== "B2B") {
              return finalizeRouteNicheResponse(correctedResult, input.businessDescription);
            }
          }

          return finalizeRouteNicheResponse(result, input.businessDescription);
        } catch (err) {
          console.error("[Onboarding] routeNiche failed, using keyword fallback:", err);
          return {
            selectedSlugs: inferOnboardingSlugsFromDescription(input.businessDescription),
            confidence: 0.75,
            clarifyingQuestion: null as string | null,
          };
        }
      }),

    /**
     * 2-step onboarding finish: save niche + audience, generate first script, then mark complete.
     */
    startCreating: protectedProcedure
      .input(
        z.object({
          businessDescription: z.string().min(3).max(500),
          targetAudience: z.string().min(3).max(500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return runOnboardingStartCreating({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          openId: ctx.user.openId,
          businessDescription: input.businessDescription,
          targetAudience: input.targetAudience,
        });
      }),

    getGenerationProgress: protectedProcedure.query(({ ctx }) => {
      return getOnboardingGenerationProgress(ctx.user.id);
    }),

    /**
     * Finalizes /onboarding: records the user's niche picks, optionally
     * seeds a demo scrape for the creator they chose, and stamps the
     * completion timestamp. Robust to every failure mode — per the
     * "demo seed failure must not block onboarding" rule, a seed
     * failure still returns `success: true` with `demoJobId: null`.
     *
     * Response variants:
     *   - Happy path:        { success, demoJobId: <id>, alreadyComplete: false }
     *   - Handle not found:  { success, demoJobId: <id>, alreadyComplete: false,
     *                          warning: "selected_creator_not_found" }
     *   - Seed failed:       { success, demoJobId: null, alreadyComplete: false }
     *   - Already complete:  { success, demoJobId: null, alreadyComplete: true }
     */
    complete: protectedProcedure
      .input(
        z.object({
          selectedNicheSlugs: z.array(z.string().trim().min(1)).min(1).max(5),
          featuredAccountHandles: z
            .array(z.string().trim().min(1))
            .min(1)
            .max(5)
            .optional(),
          businessDescription: z.string().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const state = await getOnboardingState(ctx.user.id);
        if (state?.onboardingCompletedAt || state?.onboardingSkippedAt) {
          return {
            success: true as const,
            demoJobId: null,
            alreadyComplete: true as const,
            demoCreatorHandle: null as string | null,
          };
        }

        // Dedupe slugs defensively — the client shouldn't send dupes,
        // but if a race or bug slips one through, we don't want to
        // store a malformed JSON array on the user row.
        const dedupedSlugs = Array.from(new Set(input.selectedNicheSlugs));

        const normalizeOnboardingHandle = (h: string) => h.replace(/^@/, "").trim().toLowerCase();
        const dedupedCreatorHandles: string[] = (() => {
          const list = input.featuredAccountHandles ?? [];
          const seen = new Set<string>();
          const out: string[] = [];
          for (const raw of list) {
            const n = normalizeOnboardingHandle(raw);
            if (seen.has(n)) continue;
            seen.add(n);
            out.push(n);
          }
          return out;
        })();

        // Detect the fallback case: first preferred handle (demo seed) doesn't
        // resolve to an active featured account; seed still falls back.
        let warning: "selected_creator_not_found" | undefined;
        const firstPreferred = dedupedCreatorHandles[0];
        if (firstPreferred) {
          const exists = await (await getDb())!
            .select({ id: featuredAccounts.id })
            .from(featuredAccounts)
            .where(
              and(
                eq(featuredAccounts.handle, firstPreferred),
                eq(featuredAccounts.isActive, true)
              )
            )
            .limit(1);
          if (exists.length === 0) {
            warning = "selected_creator_not_found";
          }
        }

        const demoJobId = await seedDemoScrape(
          ctx.user.id,
          firstPreferred ?? undefined
        );
        await markOnboardingComplete(
          ctx.user.id,
          dedupedSlugs,
          dedupedCreatorHandles,
          demoJobId !== null ? new Date() : null
        );
        const businessText = input.businessDescription?.trim();
        if (businessText) {
          await updateUserPersonalization(ctx.user.id, {
            businessDescription: businessText,
          });
        }
        let demoCreatorHandle: string | null = null;
        if (demoJobId) {
          const seededJob = await getScrapeJob(demoJobId);
          demoCreatorHandle = seededJob?.handle ?? null;
        }
        return {
          success: true as const,
          demoJobId,
          alreadyComplete: false as const,
          demoCreatorHandle,
          ...(warning ? { warning } : {}),
        };
      }),

    /**
     * User hit "Skip setup". No niche prefs captured, but we still seed
     * a demo (using the richness winner) so their dashboard isn't
     * empty on arrival. Idempotent — re-calling after completion or
     * a prior skip is a no-op.
     */
    /**
     * Settings → "Your Interests" save (Commit 8). Lets a user change
     * their onboarding-era picks after the fact. Intentionally does NOT
     * re-seed a demo scrape or flip any onboarding timestamps — that's
     * the one-time first-run ceremony owned by `complete` / `skip`.
     *
     * Creators are optional because users who went through "Pick for
     * me" in onboarding don't own a curated list; passing an empty
     * array clears the field.
     */
    updatePreferences: protectedProcedure
      .input(
        z.object({
          selectedNicheSlugs: z.array(z.string().trim().min(1)).max(5),
          selectedCreatorHandles: z
            .array(z.string().trim().min(1))
            .max(5)
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database unavailable",
          });
        }
        // `null` vs `[]`: we store empty arrays as null so the sidebar
        // "Your Interests" panel's `data != null` check cleanly
        // distinguishes "user opted out" from "user picked zero".
        const niches = input.selectedNicheSlugs.length > 0
          ? input.selectedNicheSlugs
          : null;
        const creators =
          input.selectedCreatorHandles == null ||
          input.selectedCreatorHandles.length === 0
            ? null
            : input.selectedCreatorHandles;
        await db
          .update(users)
          .set({
            selectedNicheSlugs: niches,
            selectedCreatorHandles: creators,
          })
          .where(eq(users.id, ctx.user.id));
        return { success: true as const };
      }),

    skip: protectedProcedure.mutation(async ({ ctx }) => {
      const state = await getOnboardingState(ctx.user.id);
      if (state?.onboardingCompletedAt || state?.onboardingSkippedAt) {
        return {
          success: true as const,
          alreadyDone: true as const,
          demoJobId: null as null,
          demoCreatorHandle: null as string | null,
        };
      }
      const demoJobId = await seedDemoScrape(ctx.user.id);
      await markOnboardingSkipped(
        ctx.user.id,
        demoJobId !== null ? new Date() : null
      );
      let demoCreatorHandle: string | null = null;
      if (demoJobId) {
        const seededJob = await getScrapeJob(demoJobId);
        demoCreatorHandle = seededJob?.handle ?? null;
      }
      return {
        success: true as const,
        alreadyDone: false as const,
        demoJobId,
        demoCreatorHandle,
      };
    }),
});
