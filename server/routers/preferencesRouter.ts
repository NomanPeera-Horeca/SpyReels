import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import {
  getDb,
  getOnboardingState,
  getUserPreferences,
  updateUserPersonalization,
  upsertUserPreferences,
} from "../db";
import { discoverySearches, users, type User } from "../../drizzle/schema";
import { inferOnboardingSlugsFromDescription } from "../../shared/onboardingDescription";
import { mergeInferredNicheSlugs } from "../../shared/primaryNiche";
import { protectedProcedure, router } from "../_core/trpc";

export const preferencesRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await getUserPreferences(ctx.user.id);
    return prefs || { timezone: "America/Chicago" };
  }),
  latestDiscoveryBusinessDescription: protectedProcedure.query(
    async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const rows = await db
        .select({
          businessDescription: discoverySearches.businessDescription,
        })
        .from(discoverySearches)
        .where(eq(discoverySearches.userId, ctx.user.id))
        .orderBy(desc(discoverySearches.createdAt))
        .limit(1);

      const text = rows[0]?.businessDescription?.trim();
      return text && text.length > 0 ? text : null;
    }
  ),
  update: protectedProcedure
    .input(z.object({ timezone: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserPreferences(ctx.user.id, { timezone: input.timezone });
      return { success: true };
    }),
  updateProfile: protectedProcedure
    .input(
      z.object({
        businessDescription: z.string().max(1000).nullable().optional(),
        targetAudience: z.string().max(1000).nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const normalize = (
        value: string | null | undefined
      ): string | null | undefined => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
      };

      const patch: Partial<Pick<User, "businessDescription" | "targetAudience">> =
        {};
      const businessDescription = normalize(input.businessDescription);
      const targetAudience = normalize(input.targetAudience);
      if (businessDescription !== undefined) {
        patch.businessDescription = businessDescription;
      }
      if (targetAudience !== undefined) {
        patch.targetAudience = targetAudience;
      }
      if (Object.keys(patch).length === 0) {
        return { success: true as const };
      }

      await updateUserPersonalization(ctx.user.id, patch);

      const state = await getOnboardingState(ctx.user.id);
      const nextBusiness =
        businessDescription !== undefined
          ? businessDescription
          : state?.businessDescription?.trim() ?? null;
      const nextAudience =
        targetAudience !== undefined
          ? targetAudience
          : state?.targetAudience?.trim() ?? null;

      if (nextBusiness) {
        const combined = [nextBusiness, nextAudience].filter(Boolean).join(" ");
        const inferred = inferOnboardingSlugsFromDescription(combined);
        const existing = state?.selectedNicheSlugs ?? [];
        const merged = mergeInferredNicheSlugs(inferred, existing);
        const changed =
          merged.length !== existing.length ||
          merged.some((slug, index) => slug !== existing[index]);
        if (changed && merged.length > 0) {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database unavailable",
            });
          }
          await db
            .update(users)
            .set({ selectedNicheSlugs: merged })
            .where(eq(users.id, ctx.user.id));
        }
      }

      return { success: true as const };
    }),
});