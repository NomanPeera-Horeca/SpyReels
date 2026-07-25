import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import { carouselRemakes } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getCreatorCoachProfile } from "../planCoachProfile";
import { getUserSubscription } from "../stripe/stripe-service";
import { getPlanLimits, type PlanId } from "../stripe/products";
import { hasUnlimitedUsage } from "../usageBypass";
import { countCarouselRemakesThisMonth } from "../carousel/db";
import { generateCarouselRemake } from "../carousel/generateCarouselRemake";

function firstDayOfNextMonthUtc(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
}

async function resolveCarouselNiche(
  userId: number,
  provided: string | undefined,
  userFields: {
    businessDescription?: string | null;
    targetAudience?: string | null;
  }
): Promise<string> {
  const typed = provided?.trim() ?? "";
  if (typed.length > 0) return typed;

  try {
    const profile = await getCreatorCoachProfile(userId);
    const parts = [
      profile.niche,
      profile.targetAudience !== "General audience"
        ? profile.targetAudience
        : null,
      profile.brandDescription,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" · ");
  } catch {
    // Fall through to raw user fields when profile is incomplete.
  }

  const biz = userFields.businessDescription?.trim() ?? "";
  const aud = userFields.targetAudience?.trim() ?? "";
  if (biz || aud) return [biz, aud].filter(Boolean).join(" · ");

  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Add a niche or business description in Settings, or type a niche for this remake.",
  });
}

export const carouselRemakeRouter = router({
  /**
   * Start a carousel remake job. Returns immediately; poll `status` until
   * completed or failed.
   */
  start: protectedProcedure
    .input(
      z.object({
        templateId: z.string().min(1).max(128),
        niche: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!CAROUSEL_TEMPLATES_BY_ID.has(input.templateId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Carousel template not found",
        });
      }

      if (
        !hasUnlimitedUsage({
          openId: ctx.user.openId,
          email: ctx.user.email,
          role: ctx.user.role,
        })
      ) {
        const sub = await getUserSubscription(ctx.user.id);
        const limits = getPlanLimits(sub.plan as PlanId);
        const used = await countCarouselRemakesThisMonth(ctx.user.id);
        if (used >= limits.carouselRemakes) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Monthly carousel remake limit reached (${used}/${limits.carouselRemakes}). Resets ${firstDayOfNextMonthUtc()}.`,
          });
        }
      }

      const niche = await resolveCarouselNiche(ctx.user.id, input.niche, {
        businessDescription: ctx.user.businessDescription,
        targetAudience: ctx.user.targetAudience,
      });

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const insertResult = await db.insert(carouselRemakes).values({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        templateId: input.templateId,
        niche,
        status: "processing",
      });
      const remakeId = insertResult[0].insertId;
      if (!remakeId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create carousel remake",
        });
      }

      generateCarouselRemake(remakeId, input.templateId, niche).catch(
        (err: unknown) => {
          console.error(`Carousel remake ${remakeId} failed:`, err);
        }
      );

      return { remakeId, status: "processing" as const, niche };
    }),

  status: protectedProcedure
    .input(z.object({ remakeId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const rows = await db
        .select()
        .from(carouselRemakes)
        .where(
          and(
            eq(carouselRemakes.id, input.remakeId),
            eq(carouselRemakes.workspaceId, ctx.workspaceId)
          )
        )
        .limit(1);

      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Remake not found" });
      }

      return {
        id: row.id,
        templateId: row.templateId,
        niche: row.niche,
        status: row.status,
        slotValues: row.slotValuesJson ?? null,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  /** Recent remakes for this workspace (minimal list for later library history). */
  list: protectedProcedure
    .input(
      z
        .object({
          templateId: z.string().max(128).optional(),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const conditions = [eq(carouselRemakes.workspaceId, ctx.workspaceId)];
      if (input?.templateId) {
        conditions.push(eq(carouselRemakes.templateId, input.templateId));
      }

      const rows = await db
        .select({
          id: carouselRemakes.id,
          templateId: carouselRemakes.templateId,
          niche: carouselRemakes.niche,
          status: carouselRemakes.status,
          createdAt: carouselRemakes.createdAt,
        })
        .from(carouselRemakes)
        .where(and(...conditions))
        .orderBy(desc(carouselRemakes.createdAt))
        .limit(input?.limit ?? 20);

      return rows;
    }),

  /** Default niche string for the remake input placeholder. */
  defaultNiche: protectedProcedure.query(async ({ ctx }) => {
    try {
      const niche = await resolveCarouselNiche(ctx.user.id, undefined, {
        businessDescription: ctx.user.businessDescription,
        targetAudience: ctx.user.targetAudience,
      });
      return { niche };
    } catch {
      return { niche: null as string | null };
    }
  }),
});
