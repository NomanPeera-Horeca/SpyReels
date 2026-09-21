import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  deriveCarouselLibraryMeta,
  normalizeStoredCarouselBriefEntries,
  normalizedIndexFromOriginalIndex,
  selectRecommendedCreativeBrief,
} from "@shared/carouselStudio";
import {
  buildCarouselSlotRewriteContext,
  isCarouselSlotRewriteAction,
} from "@shared/carouselSlotRewrite";
import {
  CarouselSlotRewriteError,
  rewriteCarouselSlotCopy,
} from "../carousel/rewriteCarouselSlotCopy";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import type { CarouselImageUrlMap, CarouselSlideSpec } from "@shared/carouselTemplates";
import {
  isComparisonFamilySlide,
  textContextForComparisonImageSlot,
} from "@shared/carouselComparisonFamily";
import {
  normalizeCarouselSlotStyleMap,
  upsertCarouselSlotStyleMap,
} from "@shared/carouselSlotStyle";
import {
  normalizeCarouselImageFrameMap,
  upsertCarouselImageFrameMap,
} from "@shared/carouselImageFrame";
import {
  fanOutCarouselCoverUrl,
  upsertCarouselImageUrlMap,
} from "@shared/carouselImageUrls";
import {
  CAROUSEL_EDITOR_MAX_SLIDES,
  CAROUSEL_EDITOR_MIN_SLIDES,
  CarouselSlideManagementError,
  deleteCarouselSlide,
  duplicateCarouselSlide,
  finalizeEditorSlideState,
  reorderCarouselSlides,
  type CarouselEditorSlideState,
} from "@shared/carouselSlideManagement";
import {
  normalizeCarouselDesignOverride,
  type StoredCarouselDesignOverride,
} from "@shared/carouselDesignOverride";
import { resolveSlideImage } from "../carousel/resolveSlideImage";
import {
  assertOwnedEditorImageSlot,
  assertOwnedEditorTextSlot,
  resolveOwnedEditorSlides,
  slidesForRemake,
} from "../carousel/ownedEditorSlots";
import { carouselRemakes, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { getCreatorCoachProfile } from "../planCoachProfile";
import { getUserSubscription } from "../stripe/stripe-service";
import { getPlanLimits, type PlanId } from "../stripe/products";
import { hasUnlimitedUsage } from "../usageBypass";
import { countCarouselRemakesThisMonth } from "../carousel/db";
import {
  carouselRemakeListSqlOrderBy,
  compareRemakesForList,
  planCarouselRemakeListQuery,
} from "../carousel/carouselRemakeListQuery";
import { generateCarouselRemake } from "../carousel/generateCarouselRemake";
import { dispatchPilotJob } from "../durableJobs/dispatch";
import { searchStockPhotos as searchStockPhotosLib } from "../carousel/searchStockPhotos";
import {
  CarouselSourceUrlError,
  resolveCarouselSourceFromUrl,
} from "../carousel/fetchSocialVideoSourceText";
import { fetchCarouselSlideImages } from "../instagram";
import { storagePut } from "../storage";
import {
  createGenerationTelemetryContext,
  persistInProgressMetrics,
  runWithGenerationTelemetry,
  withGenerationStage,
  type GenerationTelemetryContext,
} from "../carousel/generationTelemetry";

async function dispatchCarouselGeneration(
  remakeId: number,
  templateId: string,
  niche: string,
  options: NonNullable<Parameters<typeof generateCarouselRemake>[3]>,
  telemetryEntryPoint: string
): Promise<void> {
  const { telemetry: _telemetry, ...durableOptions } = options;
  await dispatchPilotJob({
    jobType: "carousel_generation",
    idempotencyKey: `carousel_generation:${remakeId}`,
    payload: {
      remakeId,
      templateId,
      niche,
      options: durableOptions,
      telemetryEntryPoint,
    },
    runInline: () => generateCarouselRemake(remakeId, templateId, niche, options),
    onInlineError: (error) =>
      console.error(`Carousel generation ${remakeId} failed:`, error),
  });
}


/** Maps content-to-carousel style picker → curated template ids. */
const CONTENT_STYLE_TO_TEMPLATE: Record<string, string> = {
  photo: "photo_story_test",
  bold: "five_mistakes_listicle",
  notebook: "notebook_tips_grid",
  stat: "average_vs_not",
};

export async function assertCarouselRemakeQuota(user: {
  id: number;
  openId: string;
  email: string | null;
  role: string | null;
}): Promise<void> {
  if (
    hasUnlimitedUsage({
      openId: user.openId,
      email: user.email,
      role: user.role,
    })
  ) {
    return;
  }
  const sub = await getUserSubscription(user.id);
  const limits = getPlanLimits(sub.plan as PlanId);
  const used = await countCarouselRemakesThisMonth(user.id);
  if (used >= limits.carouselRemakes) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Monthly carousel remake limit reached (${used}/${limits.carouselRemakes}). Resets ${firstDayOfNextMonthUtc()}.`,
    });
  }
}

/** First URL from a slide entry (string or per-slot map). */
function firstUrlFromSlideEntry(
  value: string | Record<string, string> | undefined | null
): string | null {
  if (!value) return null;
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "object") {
    for (const slotUrl of Object.values(value)) {
      if (typeof slotUrl === "string" && slotUrl.length > 0) return slotUrl;
    }
  }
  return null;
}

/** First slide image URL from imageUrlsJson (string or per-slot map). */
function firstThumbnailUrl(imageUrls: unknown): string | null {
  if (!imageUrls || typeof imageUrls !== "object") return null;
  const map = imageUrls as Record<string, string | Record<string, string>>;
  for (const value of Object.values(map)) {
    const url = firstUrlFromSlideEntry(value);
    if (url) return url;
  }
  return null;
}

/**
 * Ordered per-slide preview URLs from imageUrlsJson.
 * Prefers slideStructureJson order when present; otherwise map insertion order.
 */
function orderedSlideImageUrls(
  imageUrls: unknown,
  slideStructure: unknown
): string[] {
  if (!imageUrls || typeof imageUrls !== "object") return [];
  const map = imageUrls as Record<string, string | Record<string, string>>;

  if (Array.isArray(slideStructure)) {
    const ordered: string[] = [];
    for (const slide of slideStructure) {
      if (!slide || typeof slide !== "object") continue;
      const id = (slide as { id?: unknown }).id;
      if (typeof id !== "string" || !id) continue;
      const url = firstUrlFromSlideEntry(map[id]);
      if (url) ordered.push(url);
    }
    if (ordered.length > 0) return ordered;
  }

  const fallback: string[] = [];
  for (const value of Object.values(map)) {
    const url = firstUrlFromSlideEntry(value);
    if (url) fallback.push(url);
  }
  return fallback;
}

/** Parse ISO or YYYY-MM-DD without timezone day-shift on date-only strings. */
function parseDateSafe(dateStr: string): Date {
  if (dateStr.includes("T")) return new Date(dateStr);
  return new Date(dateStr + "T12:00:00");
}

const DESIGN_OVERRIDE_SCHEMA = z.object({
  background: z.string().max(16),
  foreground: z.string().max(16),
  accent: z.string().max(16),
  muted: z.string().max(16),
  fontDisplay: z.string().max(80).optional(),
  fontBody: z.string().max(80).optional(),
});

const STORED_DESIGN_UPDATE_SCHEMA = z
  .object({
    background: z.string().max(16),
    foreground: z.string().max(16),
    accent: z.string().max(16),
    muted: z.string().max(16),
    fontDisplay: z.string().max(128).optional(),
    fontBody: z.string().max(128).optional(),
  })
  .transform((value, ctx): StoredCarouselDesignOverride => {
    const parsed = normalizeCarouselDesignOverride(value);
    if (!parsed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid design override",
      });
      return z.NEVER;
    }
    return parsed;
  });

const ASPECT_RATIO_SCHEMA = z.enum(["4:5", "1:1", "9:16"]);

const SLIDE_COUNT_SCHEMA = z.union([
  z.literal("auto"),
  z.number().int().min(3).max(20),
]);

const editorSlideSpecSchema = z
  .object({
    id: z.string().min(1).max(128),
    role: z.string().min(1).max(64),
    viralWhy: z.string().max(4000).optional().default(""),
    layoutId: z.string().min(1).max(128),
    slots: z.array(z.record(z.string(), z.unknown())).max(32),
    imageSlots: z.array(z.record(z.string(), z.unknown())).max(8).optional(),
    composition: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const CONTENT_STYLE_SCHEMA = z.enum(["photo", "bold", "notebook", "stat"]);

type ContentToCarouselInput = {
  mode: "paste" | "topic" | "url";
  content: string;
  slideCount: number;
  style: z.infer<typeof CONTENT_STYLE_SCHEMA>;
  aspectRatioOverride?: z.infer<typeof ASPECT_RATIO_SCHEMA>;
};

type RemakeProcedureCtx = {
  user: {
    id: number;
    openId: string;
    email: string | null;
    role: string | null;
    businessDescription?: string | null;
    targetAudience?: string | null;
  };
  workspaceId: string;
};

function firstDayOfNextMonthUtc(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString().slice(0, 10);
}

export async function resolveCarouselNiche(
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

async function createContentToCarouselRemake(
  ctx: RemakeProcedureCtx,
  input: ContentToCarouselInput,
  extras?: { sourceUrl?: string | null; telemetry?: GenerationTelemetryContext }
): Promise<{ remakeId: number; status: "processing"; templateId: string }> {
  const telemetry =
    extras?.telemetry ??
    createGenerationTelemetryContext({
      entryPoint: "carouselRemake.generateFromContent",
    });
  const templateId = CONTENT_STYLE_TO_TEMPLATE[input.style];
  if (!templateId || !CAROUSEL_TEMPLATES_BY_ID.has(templateId)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unknown carousel style",
    });
  }

  await assertCarouselRemakeQuota({
    id: ctx.user.id,
    openId: ctx.user.openId,
    email: ctx.user.email,
    role: ctx.user.role,
  });

  let sourceContent = input.content.trim();
  let sourceImage: string | null = null;
  let sourceReelId: string | null = null;
  if (input.mode === "url") {
    try {
      const resolved = await runWithGenerationTelemetry(telemetry, () =>
        withGenerationStage(telemetry, "source_resolution", () =>
          resolveCarouselSourceFromUrl(sourceContent, {
            userId: ctx.user.id,
            openId: ctx.user.openId,
          })
        )
      );
      sourceContent = resolved.text;
      sourceImage = resolved.thumbnailUrl?.trim() || null;
      sourceReelId = resolved.reelId?.trim() || null;
    } catch (err) {
      if (err instanceof CarouselSourceUrlError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err.message,
        });
      }
      throw err;
    }
  } else if (input.mode === "topic") {
    if (sourceContent.length < 8) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Topic is too short. Add a clearer topic or paste content.",
      });
    }
    sourceContent = `Create an Instagram carousel about: ${sourceContent}`;
  } else if (sourceContent.length < 40) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Paste more content (aim for at least a short paragraph).",
    });
  }

  let nicheLabel = sourceContent.slice(0, 120).replace(/\s+/g, " ").trim();
  try {
    nicheLabel = await resolveCarouselNiche(ctx.user.id, nicheLabel, {
      businessDescription: ctx.user.businessDescription,
      targetAudience: ctx.user.targetAudience,
    });
  } catch {
    // Content-to-carousel can run without a saved niche profile.
  }

  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database not available",
    });
  }

  // slideCount in UI is total slides; generator uses middle-list count.
  const middleCount = Math.min(Math.max(input.slideCount - 2, 3), 18);
  const sourceUrl = extras?.sourceUrl?.trim().slice(0, 1024) || null;

  const insertResult = await db.insert(carouselRemakes).values({
    userId: ctx.user.id,
    workspaceId: ctx.workspaceId,
    templateId,
    niche: nicheLabel.slice(0, 500),
    sourceUrl,
    status: "processing",
    aspectRatioOverride: input.aspectRatioOverride ?? "4:5",
  });
  const remakeId = insertResult[0].insertId;
  if (!remakeId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to create carousel remake",
    });
  }

  if (telemetry) telemetry.remakeId = remakeId;
  await persistInProgressMetrics(remakeId, telemetry);

  await dispatchCarouselGeneration(
    remakeId,
    templateId,
    nicheLabel,
    {
      slideCountOption: middleCount,
      sourceContent,
      sourceImage,
      sourceReelId,
      telemetry,
    },
    "carouselRemake.generateFromContent"
  );

  return { remakeId, status: "processing" as const, templateId };
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
      const telemetry = createGenerationTelemetryContext({
        entryPoint: "carouselRemake.start",
      });

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
      if (telemetry) telemetry.remakeId = remakeId;
      await persistInProgressMetrics(remakeId, telemetry);

      await dispatchCarouselGeneration(
        remakeId,
        input.templateId,
        niche,
        {
          slideCountOption: input.slideCount,
          uploadedImageUrls: input.uploadedImageUrls,
          uploadedImagePool: input.uploadedImagePool,
          telemetry,
        },
        "carouselRemake.start"
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
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
          )
        )
        .limit(1);

      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Remake not found" });
      }

      const entries = normalizeStoredCarouselBriefEntries(row.angleOptionsJson);
      const briefs = entries.map((entry) => entry.brief);
      const recommendedBriefIndex =
        selectRecommendedCreativeBrief(briefs).index;
      const storedSelectedIndex = row.selectedAngleIndex ?? null;
      const selectedAngleIndex =
        storedSelectedIndex == null
          ? null
          : normalizedIndexFromOriginalIndex(entries, storedSelectedIndex);

      return {
        id: row.id,
        templateId: row.templateId,
        niche: row.niche,
        status: row.status,
        progressStage: row.progressStage ?? null,
        slotValues: row.slotValuesJson ?? null,
        slideStructure: row.slideStructureJson ?? null,
        designOverride: row.designOverrideJson ?? null,
        slotStyleOverrides: row.slotStyleOverridesJson ?? null,
        imageFrameOverrides: row.imageFrameOverridesJson ?? null,
        aspectRatioOverride: row.aspectRatioOverride ?? null,
        imageUrls: row.imageUrlsJson ?? null,
        angleOptions: row.angleOptionsJson == null ? null : briefs,
        selectedAngleIndex,
        recommendedBriefIndex,
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
          sort: z.enum(["scheduled", "newest"]).optional(),
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
        isNull(carouselRemakes.deletedAt),
        // History: completed + failed only (no stuck processing rows).
        inArray(carouselRemakes.status, ["completed", "failed"]),
      ];
      if (input?.templateId) {
        conditions.push(eq(carouselRemakes.templateId, input.templateId));
      }

      const plan = planCarouselRemakeListQuery({
        sort: input?.sort,
        limit: input?.limit,
      });

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
          slideStructureJson: carouselRemakes.slideStructureJson,
          slotValuesJson: carouselRemakes.slotValuesJson,
          errorMessage: carouselRemakes.errorMessage,
        })
        .from(carouselRemakes)
        .where(and(...conditions))
        .orderBy(carouselRemakeListSqlOrderBy(plan.sort))
        .limit(plan.limit);

      const mapped = rows.map(
        ({ imageUrlsJson, slideStructureJson, slotValuesJson, ...row }) => {
          const slideImageUrls = orderedSlideImageUrls(
            imageUrlsJson,
            slideStructureJson
          );
          const { title, slideCount } = deriveCarouselLibraryMeta({
            slotValues: slotValuesJson,
            slideStructure: slideStructureJson,
            niche: row.niche,
          });
          return {
            ...row,
            title,
            slideCount,
            thumbnailUrl: firstThumbnailUrl(imageUrlsJson) ?? slideImageUrls[0] ?? null,
            slideImageUrls,
            imageUrls: (imageUrlsJson ?? null) as Record<
              string,
              string | Record<string, string>
            > | null,
            slotValues: (slotValuesJson ?? null) as Record<
              string,
              Record<string, string>
            > | null,
            slideStructure: Array.isArray(slideStructureJson)
              ? slideStructureJson
              : null,
          };
        }
      );

      if (plan.applyScheduledFirstSort) {
        return mapped.sort(compareRemakesForList);
      }
      return mapped;
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
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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
          templateId: carouselRemakes.templateId,
          slideStructureJson: carouselRemakes.slideStructureJson,
          slotValuesJson: carouselRemakes.slotValuesJson,
        })
        .from(carouselRemakes)
        .where(
          and(
            eq(carouselRemakes.id, input.remakeId),
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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

      assertOwnedEditorTextSlot(
        resolveOwnedEditorSlides(row.templateId, row.slideStructureJson),
        input.slideId,
        input.slotId
      );

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
   * True when a local/dev Anthropic key is configured for slot rewrite.
   * Does not persist anything.
   */
  aiTextEditingAvailable: protectedProcedure.query(() => ({
    enabled: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
  })),

  /**
   * Rewrite one selected text slot. Loads remake context from MySQL.
   * Does not persist. Client applies via updateSlotValues.
   */
  rewriteSlot: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        slideId: z.string().min(1).max(128),
        slotId: z.string().min(1).max(128),
        action: z.string().min(1).max(32),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!isCarouselSlotRewriteAction(input.action)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid rewrite action",
        });
      }
      if (!process.env.ANTHROPIC_API_KEY?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "AI text editing is not configured",
        });
      }

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
          niche: carouselRemakes.niche,
          sourceUrl: carouselRemakes.sourceUrl,
          angleOptionsJson: carouselRemakes.angleOptionsJson,
          selectedAngleIndex: carouselRemakes.selectedAngleIndex,
          slideStructureJson: carouselRemakes.slideStructureJson,
          slotValuesJson: carouselRemakes.slotValuesJson,
        })
        .from(carouselRemakes)
        .where(
          and(
            eq(carouselRemakes.id, input.remakeId),
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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

      const built = buildCarouselSlotRewriteContext({
        niche: row.niche,
        sourceUrl: row.sourceUrl,
        angleOptionsJson: row.angleOptionsJson,
        selectedAngleIndex: row.selectedAngleIndex ?? null,
        slideStructure: row.slideStructureJson,
        slotValues: row.slotValuesJson,
        slideId: input.slideId,
        slotId: input.slotId,
      });
      if (!built.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            built.code === "INVALID_SLIDE"
              ? "Slide not found"
              : "Slot not found",
        });
      }

      try {
        const result = await rewriteCarouselSlotCopy(input.action, built.context);
        return result;
      } catch (error) {
        if (error instanceof CarouselSlotRewriteError) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: error.message,
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not rewrite that text. Try again.",
        });
      }
    }),

  /**
   * Replace the full slotValuesJson map after undo.
   * Auth + workspace ownership; no LLM / image work.
   */
  replaceSlotValues: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        slotValues: z.record(z.string(), z.record(z.string(), z.string().max(4000))),
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
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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

      await db
        .update(carouselRemakes)
        .set({
          slotValuesJson: input.slotValues as Record<
            string,
            Record<string, string>
          >,
        })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { slotValues: input.slotValues };
    }),

  /**
   * Merge one typography override into slotStyleOverridesJson.
   * Auth + workspace ownership; no LLM / image work.
   */
  updateSlotStyle: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        slideId: z.string().min(1).max(128),
        slotId: z.string().min(1).max(128),
        style: z.object({
          fontFamily: z.string().max(128).nullable().optional(),
          fontSizePx: z.number().int().min(12).max(56).nullable().optional(),
          fontWeight: z.number().int().nullable().optional(),
          textAlign: z.enum(["left", "center", "right"]).nullable().optional(),
          color: z.string().max(16).nullable().optional(),
        }),
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
          templateId: carouselRemakes.templateId,
          slideStructureJson: carouselRemakes.slideStructureJson,
          slotStyleOverridesJson: carouselRemakes.slotStyleOverridesJson,
        })
        .from(carouselRemakes)
        .where(
          and(
            eq(carouselRemakes.id, input.remakeId),
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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
          message: "Remake must be completed before editing slide style",
        });
      }

      assertOwnedEditorTextSlot(
        resolveOwnedEditorSlides(row.templateId, row.slideStructureJson),
        input.slideId,
        input.slotId
      );

      const current = normalizeCarouselSlotStyleMap(row.slotStyleOverridesJson);
      const next = upsertCarouselSlotStyleMap(
        current,
        input.slideId,
        input.slotId,
        input.style
      );

      await db
        .update(carouselRemakes)
        .set({ slotStyleOverridesJson: next })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { slotStyleOverrides: next };
    }),

  /**
   * Replace the full typography map after undo.
   */
  replaceSlotStyles: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        slotStyleOverrides: z.record(z.string(), z.record(z.string(), z.unknown())),
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
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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
          message: "Remake must be completed before editing slide style",
        });
      }

      const next = normalizeCarouselSlotStyleMap(input.slotStyleOverrides);
      await db
        .update(carouselRemakes)
        .set({ slotStyleOverridesJson: next })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { slotStyleOverrides: next };
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
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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

  /**
   * Persist global carousel design. Null clears the override back to the template.
   * Auth + workspace ownership; does not mutate templates, slot styles, or generation.
   */
  updateDesignOverride: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        designOverride: STORED_DESIGN_UPDATE_SCHEMA.nullable(),
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
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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
          message: "Remake must be completed before editing design",
        });
      }

      await db
        .update(carouselRemakes)
        .set({ designOverrideJson: input.designOverride })
        .where(eq(carouselRemakes.id, input.remakeId));

      return {
        remakeId: input.remakeId,
        designOverride: input.designOverride,
      };
    }),

  /**
   * Content → carousel: paste / topic / URL → template remake with source-aware prompt.
   */
  generateFromContent: protectedProcedure
    .input(
      z.object({
        mode: z.enum(["paste", "topic", "url"]),
        content: z.string().min(1).max(12000),
        slideCount: z.number().int().min(5).max(10).default(6),
        style: CONTENT_STYLE_SCHEMA.default("photo"),
        aspectRatioOverride: ASPECT_RATIO_SCHEMA.optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return createContentToCarouselRemake(ctx, input);
    }),

  /**
   * Remake an Instagram carousel from its slide images (vision + structure).
   * If the URL is not a multi-image carousel (0-1 slide images), falls back
   * to generateFromContent so reel/video URLs keep working.
   */
  generateFromSourceCarousel: protectedProcedure
    .input(
      z.object({
        sourceUrl: z.string().min(1).max(1024),
        slideCount: z.number().int().min(5).max(10).default(6),
        style: CONTENT_STYLE_SCHEMA.default("photo"),
        aspectRatioOverride: ASPECT_RATIO_SCHEMA.optional(),
        niche: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const telemetry = createGenerationTelemetryContext({
        entryPoint: "carouselRemake.generateFromSourceCarousel",
      });

      const sourceUrl = input.sourceUrl.trim();
      if (!sourceUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Paste an Instagram carousel URL first.",
        });
      }

      let slideImages: string[] | null = null;
      try {
        slideImages = await withGenerationStage(
          telemetry,
          "source_slide_fetch",
          () => fetchCarouselSlideImages(sourceUrl)
        );
      } catch (err) {
        console.warn(
          "[generateFromSourceCarousel] slide fetch failed, falling back to content path",
          err instanceof Error ? err.message : err
        );
      }

      if (!slideImages || slideImages.length < 2) {
        return createContentToCarouselRemake(
          ctx,
          {
            mode: "url",
            content: sourceUrl,
            slideCount: input.slideCount,
            style: input.style,
            aspectRatioOverride: input.aspectRatioOverride,
          },
          { sourceUrl, telemetry }
        );
      }

      const templateId = CONTENT_STYLE_TO_TEMPLATE[input.style];
      if (!templateId || !CAROUSEL_TEMPLATES_BY_ID.has(templateId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown carousel style",
        });
      }

      await assertCarouselRemakeQuota({
        id: ctx.user.id,
        openId: ctx.user.openId,
        email: ctx.user.email,
        role: ctx.user.role,
      });

      let nicheLabel = input.niche?.trim() ?? "";
      try {
        nicheLabel = await resolveCarouselNiche(ctx.user.id, nicheLabel || undefined, {
          businessDescription: ctx.user.businessDescription,
          targetAudience: ctx.user.targetAudience,
        });
      } catch {
        // Source remakes can run without a saved niche profile.
      }
      if (!nicheLabel) nicheLabel = "General creators";

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
        templateId,
        niche: nicheLabel.slice(0, 500),
        sourceUrl: sourceUrl.slice(0, 1024),
        status: "processing",
        aspectRatioOverride: input.aspectRatioOverride ?? "4:5",
      });
      const remakeId = insertResult[0].insertId;
      if (!remakeId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create carousel remake",
        });
      }

      if (telemetry) telemetry.remakeId = remakeId;
      await persistInProgressMetrics(remakeId, telemetry);

      await dispatchCarouselGeneration(
        remakeId,
        templateId,
        nicheLabel,
        {
          analysisImageUrls: slideImages,
          telemetry,
        },
        "carouselRemake.generateFromSourceCarousel"
      );

      return { remakeId, status: "processing" as const, templateId };
    }),

  /** Browse Pexels / Pixabay photos for slide backgrounds. */
  searchStockPhotos: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        provider: z.enum(["pexels", "pixabay", "auto"]).default("auto"),
        page: z.number().int().min(1).max(20).default(1),
      })
    )
    .query(async ({ input }) => {
      const photos = await searchStockPhotosLib({
        query: input.query,
        provider: input.provider,
        page: input.page,
        perPage: 12,
      });
      return { photos };
    }),

  /** Replace one slide image URL on a completed remake. */
  updateImageUrls: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        slideId: z.string().min(1).max(128),
        url: z.string().url().max(2048),
        slotId: z.string().min(1).max(128).optional(),
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
          templateId: carouselRemakes.templateId,
          slideStructureJson: carouselRemakes.slideStructureJson,
          imageUrlsJson: carouselRemakes.imageUrlsJson,
        })
        .from(carouselRemakes)
        .where(
          and(
            eq(carouselRemakes.id, input.remakeId),
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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
          message: "Remake must be completed before changing images",
        });
      }

      assertOwnedEditorImageSlot(
        resolveOwnedEditorSlides(row.templateId, row.slideStructureJson),
        input.slideId,
        input.slotId
      );

      const current =
        row.imageUrlsJson && typeof row.imageUrlsJson === "object"
          ? ({ ...(row.imageUrlsJson as CarouselImageUrlMap) } as CarouselImageUrlMap)
          : {};
      const next = applyOwnedImageUrl(
        current,
        input.slideId,
        input.url,
        input.slotId,
        shareCoverSlideIdsForTemplate(row.templateId, row.slideStructureJson)
      );

      await db
        .update(carouselRemakes)
        .set({ imageUrlsJson: next })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { remakeId: input.remakeId, imageUrls: next };
    }),

  /**
   * Replace the full image URL map after undo.
   */
  replaceImageUrls: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        imageUrls: z.record(z.string(), z.union([
          z.string(),
          z.record(z.string(), z.string()),
        ])),
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
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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
          message: "Remake must be completed before changing images",
        });
      }

      await db
        .update(carouselRemakes)
        .set({ imageUrlsJson: input.imageUrls })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { remakeId: input.remakeId, imageUrls: input.imageUrls };
    }),

  /**
   * Merge one crop/position/zoom override into imageFrameOverridesJson.
   */
  updateImageFrame: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        slideId: z.string().min(1).max(128),
        slotId: z.string().min(1).max(128),
        frame: z.object({
          posX: z.number().min(0).max(100).optional(),
          posY: z.number().min(0).max(100).optional(),
          zoom: z.number().min(1).max(2).optional(),
        }),
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
          templateId: carouselRemakes.templateId,
          slideStructureJson: carouselRemakes.slideStructureJson,
          imageFrameOverridesJson: carouselRemakes.imageFrameOverridesJson,
        })
        .from(carouselRemakes)
        .where(
          and(
            eq(carouselRemakes.id, input.remakeId),
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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
          message: "Remake must be completed before editing images",
        });
      }

      assertOwnedEditorImageSlot(
        resolveOwnedEditorSlides(row.templateId, row.slideStructureJson),
        input.slideId,
        input.slotId
      );

      const current = normalizeCarouselImageFrameMap(row.imageFrameOverridesJson);
      const next = upsertCarouselImageFrameMap(
        current,
        input.slideId,
        input.slotId,
        input.frame
      );

      await db
        .update(carouselRemakes)
        .set({ imageFrameOverridesJson: next })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { imageFrameOverrides: next };
    }),

  /**
   * Replace the full image-frame map after undo.
   */
  replaceImageFrames: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        imageFrameOverrides: z.record(z.string(), z.record(z.string(), z.unknown())),
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
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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
          message: "Remake must be completed before editing images",
        });
      }

      const next = normalizeCarouselImageFrameMap(input.imageFrameOverrides);
      await db
        .update(carouselRemakes)
        .set({ imageFrameOverridesJson: next })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { imageFrameOverrides: next };
    }),

  /**
   * Regenerate only the selected image slot via the existing resolveSlideImage path.
   * Does not rewrite copy, strategy, or other image slots.
   */
  regenerateSlideImage: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        slideId: z.string().min(1).max(128),
        slotId: z.string().min(1).max(128),
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
          templateId: carouselRemakes.templateId,
          niche: carouselRemakes.niche,
          slotValuesJson: carouselRemakes.slotValuesJson,
          slideStructureJson: carouselRemakes.slideStructureJson,
          imageUrlsJson: carouselRemakes.imageUrlsJson,
        })
        .from(carouselRemakes)
        .where(
          and(
            eq(carouselRemakes.id, input.remakeId),
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
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
          message: "Remake must be completed before regenerating images",
        });
      }

      const template = CAROUSEL_TEMPLATES_BY_ID.get(row.templateId);
      const slides = slidesForRemake(template?.slides, row.slideStructureJson);
      const slide = slides.find((item) => item.id === input.slideId);
      const imageSlot = slide?.imageSlots?.find((slot) => slot.id === input.slotId);
      if (!slide || !imageSlot) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That slide has no matching image slot",
        });
      }

      const slideValues =
        row.slotValuesJson && typeof row.slotValuesJson === "object"
          ? ((row.slotValuesJson as Record<string, Record<string, string>>)[
              input.slideId
            ] ?? {})
          : {};
      const textContext = imageTextContextForOwnedSlot(
        slide,
        slideValues,
        input.slotId
      );
      const url = await resolveSlideImage(
        imageSlot.searchQueryHint ?? "",
        row.niche,
        undefined,
        textContext,
        {
          slideId: input.slideId,
          imageSlotId: input.slotId,
        }
      );
      if (!url) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Image generation did not return a URL",
        });
      }

      const current =
        row.imageUrlsJson && typeof row.imageUrlsJson === "object"
          ? ({ ...(row.imageUrlsJson as CarouselImageUrlMap) } as CarouselImageUrlMap)
          : {};
      const next = applyOwnedImageUrl(
        current,
        input.slideId,
        url,
        input.slotId,
        shareCoverSlideIdsForTemplate(row.templateId, row.slideStructureJson)
      );

      await db
        .update(carouselRemakes)
        .set({ imageUrlsJson: next })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { remakeId: input.remakeId, imageUrls: next, url };
    }),

  /**
   * Reorder, duplicate, or delete one slide on a completed remake.
   * One UPDATE writes structure + all per-slide maps together.
   * Does not mutate templates, generate images, or delete R2 objects.
   */
  manageSlides: protectedProcedure
    .input(
      z.discriminatedUnion("action", [
        z.object({
          remakeId: z.number().int().positive(),
          action: z.literal("reorder"),
          orderedSlideIds: z
            .array(z.string().min(1).max(128))
            .min(CAROUSEL_EDITOR_MIN_SLIDES)
            .max(CAROUSEL_EDITOR_MAX_SLIDES),
        }),
        z.object({
          remakeId: z.number().int().positive(),
          action: z.literal("duplicate"),
          slideId: z.string().min(1).max(128),
        }),
        z.object({
          remakeId: z.number().int().positive(),
          action: z.literal("delete"),
          slideId: z.string().min(1).max(128),
        }),
      ])
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const row = await loadOwnedCompletedRemakeEditorRow(db, ctx.workspaceId, input.remakeId);
      const current = editorStateFromRow(row);
      try {
        if (input.action === "reorder") {
          const next = reorderCarouselSlides(current, input.orderedSlideIds);
          return persistOwnedEditorState(db, input.remakeId, next);
        }
        if (input.action === "duplicate") {
          const { state, newSlideId } = duplicateCarouselSlide(current, input.slideId);
          const saved = await persistOwnedEditorState(db, input.remakeId, state);
          return { ...saved, newSlideId };
        }
        const next = deleteCarouselSlide(current, input.slideId);
        return persistOwnedEditorState(db, input.remakeId, next);
      } catch (err) {
        throw slideManagementTrpcError(err);
      }
    }),

  /**
   * Replace structure + all per-slide editor maps after undo.
   * Auth + workspace ownership; no LLM / image work / template writes.
   */
  replaceEditorState: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        slideStructure: z
          .array(editorSlideSpecSchema)
          .min(CAROUSEL_EDITOR_MIN_SLIDES)
          .max(CAROUSEL_EDITOR_MAX_SLIDES),
        slotValues: z.record(
          z.string(),
          z.record(z.string(), z.string().max(4000))
        ),
        slotStyleOverrides: z.record(z.string(), z.unknown()),
        imageUrls: z.record(z.string(), z.unknown()),
        imageFrameOverrides: z.record(z.string(), z.unknown()),
        designOverride: STORED_DESIGN_UPDATE_SCHEMA.nullable().optional(),
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

      await loadOwnedCompletedRemakeEditorRow(db, ctx.workspaceId, input.remakeId);
      try {
        const next = finalizeEditorSlideState({
          slideStructure: input.slideStructure as CarouselSlideSpec[],
          slotValues: input.slotValues,
          slotStyles: normalizeCarouselSlotStyleMap(input.slotStyleOverrides),
          imageUrls: normalizeOwnedImageUrlMap(input.imageUrls),
          imageFrames: normalizeCarouselImageFrameMap(input.imageFrameOverrides),
        });
        return persistOwnedEditorState(
          db,
          input.remakeId,
          next,
          input.designOverride
        );
      } catch (err) {
        throw slideManagementTrpcError(err);
      }
    }),

  /**
   * Soft-delete a remake from Your Carousels.
   * Auth + workspace ownership (same pattern as updateSlotValues).
   * Does not refund monthly usage.
   */
  delete: protectedProcedure
    .input(z.object({ remakeId: z.number().int().positive() }))
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
        })
        .from(carouselRemakes)
        .where(
          and(
            eq(carouselRemakes.id, input.remakeId),
            eq(carouselRemakes.workspaceId, ctx.workspaceId),
            isNull(carouselRemakes.deletedAt)
          )
        )
        .limit(1);

      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Remake not found" });
      }

      await db
        .update(carouselRemakes)
        .set({ deletedAt: new Date() })
        .where(eq(carouselRemakes.id, input.remakeId));

      return { remakeId: input.remakeId, deleted: true as const };
    }),
});

function shareCoverSlideIdsForTemplate(
  templateId: string,
  storedStructure: unknown
): string[] | undefined {
  const template = CAROUSEL_TEMPLATES_BY_ID.get(templateId);
  if (!template?.shareCoverImage) return undefined;
  return slidesForRemake(template.slides, storedStructure)
    .filter((slide) => (slide.imageSlots?.length ?? 0) > 0)
    .map((slide) => slide.id);
}

function applyOwnedImageUrl(
  current: CarouselImageUrlMap,
  slideId: string,
  url: string,
  slotId: string | undefined,
  sharedSlideIds: string[] | undefined
): CarouselImageUrlMap {
  if (sharedSlideIds && sharedSlideIds.length > 0) {
    return fanOutCarouselCoverUrl(current, url, sharedSlideIds);
  }
  return upsertCarouselImageUrlMap(current, slideId, url, slotId);
}

function imageTextContextForOwnedSlot(
  slide: CarouselSlideSpec,
  slideVals: Record<string, string>,
  imageSlotId: string
): string {
  if (isComparisonFamilySlide(slide) && (slide.imageSlots?.length ?? 0) > 1) {
    const sideCopy = textContextForComparisonImageSlot(slideVals, imageSlotId);
    if (sideCopy) return sideCopy;
  }
  const preferred = [
    slideVals.headline,
    slideVals.title,
    slideVals.body,
    slideVals.support,
    slideVals.subhead,
  ];
  return preferred.filter((value) => value?.trim()).join(" / ");
}

type OwnedEditorRemakeRow = {
  id: number;
  status: string;
  templateId: string;
  slideStructureJson: unknown;
  slotValuesJson: unknown;
  slotStyleOverridesJson: unknown;
  imageUrlsJson: unknown;
  imageFrameOverridesJson: unknown;
};

async function loadOwnedCompletedRemakeEditorRow(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  workspaceId: string,
  remakeId: number
): Promise<OwnedEditorRemakeRow> {
  const rows = await db
    .select({
      id: carouselRemakes.id,
      status: carouselRemakes.status,
      templateId: carouselRemakes.templateId,
      slideStructureJson: carouselRemakes.slideStructureJson,
      slotValuesJson: carouselRemakes.slotValuesJson,
      slotStyleOverridesJson: carouselRemakes.slotStyleOverridesJson,
      imageUrlsJson: carouselRemakes.imageUrlsJson,
      imageFrameOverridesJson: carouselRemakes.imageFrameOverridesJson,
    })
    .from(carouselRemakes)
    .where(
      and(
        eq(carouselRemakes.id, remakeId),
        eq(carouselRemakes.workspaceId, workspaceId),
        isNull(carouselRemakes.deletedAt)
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
      message: "Remake must be completed before changing slides",
    });
  }
  return row;
}

function editorStateFromRow(row: OwnedEditorRemakeRow): CarouselEditorSlideState {
  const template = CAROUSEL_TEMPLATES_BY_ID.get(row.templateId);
  return {
    slideStructure: slidesForRemake(template?.slides, row.slideStructureJson),
    slotValues: asSlotValueMap(row.slotValuesJson),
    slotStyles: normalizeCarouselSlotStyleMap(row.slotStyleOverridesJson),
    imageUrls: normalizeOwnedImageUrlMap(row.imageUrlsJson),
    imageFrames: normalizeCarouselImageFrameMap(row.imageFrameOverridesJson),
  };
}

async function persistOwnedEditorState(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  remakeId: number,
  state: CarouselEditorSlideState,
  designOverride?: StoredCarouselDesignOverride | null
): Promise<
  CarouselEditorSlideState & {
    remakeId: number;
    designOverride?: StoredCarouselDesignOverride | null;
  }
> {
  await db.transaction(async (tx) => {
    await tx
      .update(carouselRemakes)
      .set({
        slideStructureJson: state.slideStructure,
        slotValuesJson: state.slotValues,
        slotStyleOverridesJson: state.slotStyles,
        imageUrlsJson: state.imageUrls,
        imageFrameOverridesJson: state.imageFrames,
        ...(designOverride !== undefined
          ? { designOverrideJson: designOverride }
          : {}),
      })
      .where(eq(carouselRemakes.id, remakeId));
  });
  return {
    remakeId,
    ...state,
    ...(designOverride !== undefined ? { designOverride } : {}),
  };
}

function slideManagementTrpcError(err: unknown): TRPCError {
  if (err instanceof CarouselSlideManagementError) {
    return new TRPCError({ code: "BAD_REQUEST", message: err.message });
  }
  if (err instanceof TRPCError) return err;
  return new TRPCError({
    code: "BAD_REQUEST",
    message: "Could not update slides",
  });
}

function asSlotValueMap(raw: unknown): Record<string, Record<string, string>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [slideId, slots] of Object.entries(raw as Record<string, unknown>)) {
    if (!slideId || !slots || typeof slots !== "object" || Array.isArray(slots)) {
      continue;
    }
    const next: Record<string, string> = {};
    for (const [slotId, value] of Object.entries(slots as Record<string, unknown>)) {
      if (typeof value === "string") next[slotId] = value;
    }
    out[slideId] = next;
  }
  return out;
}

function normalizeOwnedImageUrlMap(raw: unknown): CarouselImageUrlMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: CarouselImageUrlMap = {};
  for (const [slideId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!slideId) continue;
    if (typeof value === "string" && value.length > 0) {
      out[slideId] = value;
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const slots: Record<string, string> = {};
    for (const [slotId, url] of Object.entries(value as Record<string, unknown>)) {
      if (typeof url === "string" && url.length > 0) slots[slotId] = url;
    }
    if (Object.keys(slots).length > 0) out[slideId] = slots;
  }
  return out;
}
