import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import { carouselRemakes, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getCreatorCoachProfile } from "../planCoachProfile";
import { getUserSubscription } from "../stripe/stripe-service";
import { getPlanLimits, type PlanId } from "../stripe/products";
import { hasUnlimitedUsage } from "../usageBypass";
import { countCarouselRemakesThisMonth } from "../carousel/db";
import { generateCarouselRemake } from "../carousel/generateCarouselRemake";
import { storagePut } from "../storage";

/** First slide image URL from imageUrlsJson (string or per-slot map). */
function firstThumbnailUrl(imageUrls: unknown): string | null {
  if (!imageUrls || typeof imageUrls !== "object") return null;
  const map = imageUrls as Record<string, string | Record<string, string>>;
  for (const value of Object.values(map)) {
    if (typeof value === "string" && value.length > 0) return value;
    if (value && typeof value === "object") {
      for (const slotUrl of Object.values(value)) {
        if (typeof slotUrl === "string" && slotUrl.length > 0) return slotUrl;
      }
    }
  }
  return null;
}

/** Parse ISO or YYYY-MM-DD without timezone day-shift on date-only strings. */
function parseDateSafe(dateStr: string): Date {
  if (dateStr.includes("T")) return new Date(dateStr);
  return new Date(dateStr + "T12:00:00");
}

/** Scheduled remakes first (soonest postDate), then newest created. */
function compareRemakesForList(
  a: { postDate: Date | null; createdAt: Date },
  b: { postDate: Date | null; createdAt: Date }
): number {
  if (a.postDate && b.postDate) {
    return a.postDate.getTime() - b.postDate.getTime();
  }
  if (a.postDate && !b.postDate) return -1;
  if (!a.postDate && b.postDate) return 1;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

const DESIGN_OVERRIDE_SCHEMA = z.object({
  background: z.string().max(16),
  foreground: z.string().max(16),
  accent: z.string().max(16),
  muted: z.string().max(16),
  fontDisplay: z.string().max(80).optional(),
  fontBody: z.string().max(80).optional(),
});

const ASPECT_RATIO_SCHEMA = z.enum(["4:5", "1:1", "9:16"]);

const SLIDE_COUNT_SCHEMA = z.union([
  z.literal("auto"),
  z.number().int().min(3).max(20),
]);

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
  start: protectedProcedure
    .input(
      z.object({
        templateId: z.string().min(1).max(128),
        niche: z.string().max(500).optional(),
        slideCount: SLIDE_COUNT_SCHEMA.optional(),
        designOverride: DESIGN_OVERRIDE_SCHEMA.optional(),
        aspectRatioOverride: ASPECT_RATIO_SCHEMA.optional(),
        uploadedImageUrls: z.record(z.string(), z.string()).optional(),
        uploadedImagePool: z.array(z.string().min(1).max(2048)).max(20).optional(),
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
        designOverrideJson: input.designOverride ?? null,
        aspectRatioOverride: input.aspectRatioOverride ?? null,
      });
      const remakeId = insertResult[0].insertId;
      if (!remakeId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create carousel remake",
        });
      }

      generateCarouselRemake(remakeId, input.templateId, niche, {
        slideCountOption: input.slideCount,
        uploadedImageUrls: input.uploadedImageUrls,
        uploadedImagePool: input.uploadedImagePool,
      }).catch((err: unknown) => {
        console.error(`Carousel remake ${remakeId} failed:`, err);
      });

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
        slideStructure: row.slideStructureJson ?? null,
        designOverride: row.designOverrideJson ?? null,
        aspectRatioOverride: row.aspectRatioOverride ?? null,
        imageUrls: row.imageUrlsJson ?? null,
        postDate: row.postDate,
        postTime: row.postTime,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

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

      const conditions = [
        eq(carouselRemakes.workspaceId, ctx.workspaceId),
        // History: completed + failed only (no stuck processing rows).
        inArray(carouselRemakes.status, ["completed", "failed"]),
      ];
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
          postDate: carouselRemakes.postDate,
          postTime: carouselRemakes.postTime,
          aspectRatioOverride: carouselRemakes.aspectRatioOverride,
          imageUrlsJson: carouselRemakes.imageUrlsJson,
        })
        .from(carouselRemakes)
        .where(and(...conditions))
        .orderBy(desc(carouselRemakes.createdAt))
        .limit(input?.limit ?? 20);

      return rows
        .map(({ imageUrlsJson, ...row }) => ({
          ...row,
          thumbnailUrl: firstThumbnailUrl(imageUrlsJson),
        }))
        .sort(compareRemakesForList);
    }),

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

  /** Saved Instagram handle for the carousel handle overlay, if set. */
  defaultHandle: protectedProcedure.query(async ({ ctx }) => {
    return { handle: ctx.user.instagramHandle ?? null };
  }),

  /** Persist the user's handle so it's remembered for future remakes. */
  saveHandle: protectedProcedure
    .input(z.object({ handle: z.string().max(64) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }
      const cleaned = input.handle.trim();
      await db
        .update(users)
        .set({ instagramHandle: cleaned.length > 0 ? cleaned : null })
        .where(eq(users.id, ctx.user.id));
      return { handle: cleaned.length > 0 ? cleaned : null };
    }),

  /** Upload a photo for a carousel image slot. Returns the stored R2 URL. */
  uploadSlideImage: protectedProcedure
    .input(
      z.object({
        base64: z.string().max(10_000_000),
        contentType: z.string().max(64).default("image/jpeg"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64, "base64");
      const key = `carousel-uploads/${ctx.user.id}/${Date.now()}.jpg`;
      const { url } = await storagePut(key, buffer, input.contentType);
      return { url };
    }),

  /**
   * Store intended post date/time for user planning only.
   * Does NOT auto-post to Instagram and does NOT count toward remake usage.
   */
  updateSchedule: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        postDate: z.string().nullable(),
        postTime: z.string().max(8).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const rows = await db
        .select({
          id: carouselRemakes.id,
          status: carouselRemakes.status,
        })
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
      if (row.status !== "completed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Remake must be completed before scheduling",
        });
      }

      const postDate = input.postDate ? parseDateSafe(input.postDate) : null;
      const postTime = input.postTime?.trim() ? input.postTime.trim() : null;

      await db
        .update(carouselRemakes)
        .set({ postDate, postTime })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { remakeId: input.remakeId, postDate, postTime };
    }),

  /**
   * Merge one text-slot edit into slotValuesJson for a completed remake.
   * Auth + workspace ownership; no LLM / image work.
   */
  updateSlotValues: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        slideId: z.string().min(1).max(128),
        slotId: z.string().min(1).max(128),
        value: z.string().max(4000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const rows = await db
        .select({
          id: carouselRemakes.id,
          status: carouselRemakes.status,
          slotValuesJson: carouselRemakes.slotValuesJson,
        })
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
      if (row.status !== "completed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Remake must be completed before editing slide text",
        });
      }

      const prev = (row.slotValuesJson ?? {}) as Record<
        string,
        Record<string, string>
      >;
      const next: Record<string, Record<string, string>> = {
        ...prev,
        [input.slideId]: {
          ...(prev[input.slideId] ?? {}),
          [input.slotId]: input.value,
        },
      };

      await db
        .update(carouselRemakes)
        .set({ slotValuesJson: next })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { slotValues: next };
    }),

  /**
   * Persist aspect ratio format switch for a completed remake.
   * Pure column update; does not touch slotValues / images / LLM.
   */
  updateAspectRatio: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        aspectRatio: ASPECT_RATIO_SCHEMA,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const rows = await db
        .select({
          id: carouselRemakes.id,
          status: carouselRemakes.status,
        })
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
      if (row.status !== "completed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Remake must be completed before changing format",
        });
      }

      await db
        .update(carouselRemakes)
        .set({ aspectRatioOverride: input.aspectRatio })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { remakeId: input.remakeId, aspectRatio: input.aspectRatio };
    }),
});
