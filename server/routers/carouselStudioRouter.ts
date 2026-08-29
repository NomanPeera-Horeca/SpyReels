/**
 * Carousel Studio admin endpoints: generate 3 angles, then fire the existing remake worker.
 * Remix/source-carousel analysis is intentionally not implemented in this phase.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import {
  CAROUSEL_STUDIO_ANGLE_COUNT,
  CAROUSEL_STUDIO_TEMPLATE_ID,
  looksLikeCarouselSourceUrl,
  normalizeCarouselSourceUrl,
  type CarouselAngleOption,
} from "@shared/carouselStudio";
import { carouselRemakes } from "../../drizzle/schema";
import { adminPanelProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { generateCarouselAngles } from "../carousel/generateCarouselAngles";
import { generateCarouselRemake } from "../carousel/generateCarouselRemake";
import {
  CarouselSourceUrlError,
  resolveCarouselSourceFromUrl,
} from "../carousel/fetchSocialVideoSourceText";
import {
  assertCarouselRemakeQuota,
  resolveCarouselNiche,
} from "./carouselRemakeRouter";

function requireWorkspaceId(workspaceId: string | null): string {
  if (!workspaceId) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Workspace context is missing for this user.",
    });
  }
  return workspaceId;
}

const STUDIO_ASPECT_RATIO = z.enum(["4:5", "1:1", "9:16"]);

const STUDIO_RESOLVED_SOURCE_FIELDS = {
  sourceContent: z.string().max(12000).optional(),
  sourceUrl: z.string().max(1024).optional(),
  sourceImage: z.string().max(2048).optional(),
  sourceReelId: z.string().max(128).optional(),
};

const STUDIO_GENERATE_ANGLES_INPUT = z.object({
  content: z.string().min(1).max(12000),
  niche: z.string().max(500).optional(),
  brandVoice: z.string().max(500).optional(),
  aspectRatioOverride: STUDIO_ASPECT_RATIO.optional(),
  ...STUDIO_RESOLVED_SOURCE_FIELDS,
});

function angleDirectionFromOption(angle: CarouselAngleOption): string {
  return `${angle.title.trim()}\n\n${angle.description.trim()}`;
}

function middleCountFromEstimatedSlides(estimated: number): number {
  return Math.min(Math.max(estimated - 2, 3), 18);
}

async function resolveStudioSourceText(args: {
  content: string;
  userId: number;
  openId: string;
}): Promise<{
  sourceContent: string;
  sourceUrl: string | null;
  sourceImage: string | null;
  sourceReelId: string | null;
}> {
  const trimmed = args.content.trim();
  if (!looksLikeCarouselSourceUrl(trimmed)) {
    if (trimmed.length < 8) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Add a clearer idea (at least a short sentence).",
      });
    }
    return {
      sourceContent: trimmed,
      sourceUrl: null,
      sourceImage: null,
      sourceReelId: null,
    };
  }

  const url = normalizeCarouselSourceUrl(trimmed);
  try {
    const resolved = await resolveCarouselSourceFromUrl(url, {
      userId: args.userId,
      openId: args.openId,
    });
    return {
      sourceContent: resolved.text,
      sourceUrl: url.slice(0, 1024),
      sourceImage: resolved.thumbnailUrl?.trim() || null,
      sourceReelId: resolved.reelId?.trim() || null,
    };
  } catch (err) {
    if (err instanceof CarouselSourceUrlError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err.message,
      });
    }
    throw err;
  }
}

export const carouselStudioRouter = router({
  resolveSource: adminPanelProcedure
    .input(z.object({ content: z.string().min(1).max(2048) }))
    .mutation(async ({ ctx, input }) => {
      return resolveStudioSourceText({
        content: input.content,
        userId: ctx.user.id,
        openId: ctx.user.openId,
      });
    }),

  generateAngles: adminPanelProcedure
    .input(STUDIO_GENERATE_ANGLES_INPUT)
    .mutation(async ({ ctx, input }) => {
      if (!CAROUSEL_TEMPLATES_BY_ID.has(CAROUSEL_STUDIO_TEMPLATE_ID)) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Carousel Studio template is not available",
        });
      }

      await assertCarouselRemakeQuota({
        id: ctx.user.id,
        openId: ctx.user.openId,
        email: ctx.user.email,
        role: ctx.user.role,
      });

      const prefetched = input.sourceContent?.trim() || "";
      const resolved = prefetched
        ? {
            sourceContent: prefetched,
            sourceUrl: input.sourceUrl?.trim().slice(0, 1024) || null,
            sourceImage: input.sourceImage?.trim() || null,
            sourceReelId: input.sourceReelId?.trim() || null,
          }
        : await resolveStudioSourceText({
            content: input.content,
            userId: ctx.user.id,
            openId: ctx.user.openId,
          });

      const niche = await resolveCarouselNiche(ctx.user.id, input.niche, {
        businessDescription: ctx.user.businessDescription,
        targetAudience: ctx.user.targetAudience,
      });

      let angles: CarouselAngleOption[];
      try {
        angles = await generateCarouselAngles({
          sourceContent: resolved.sourceContent,
          niche,
          brandVoice: input.brandVoice,
        });
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            err instanceof Error
              ? err.message
              : "Could not generate carousel angles.",
        });
      }

      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const workspaceId = requireWorkspaceId(ctx.workspaceId);
      const insertResult = await db.insert(carouselRemakes).values({
        userId: ctx.user.id,
        workspaceId,
        templateId: CAROUSEL_STUDIO_TEMPLATE_ID,
        niche: niche.slice(0, 500),
        sourceUrl: resolved.sourceUrl,
        status: "pending",
        angleOptionsJson: angles,
        selectedAngleIndex: null,
        aspectRatioOverride: input.aspectRatioOverride ?? "4:5",
      });
      const remakeId = insertResult[0].insertId;
      if (!remakeId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save carousel angles",
        });
      }

      return {
        remakeId,
        status: "pending" as const,
        angles,
        sourceContent: resolved.sourceContent,
        sourceUrl: resolved.sourceUrl,
        sourceImage: resolved.sourceImage,
        sourceReelId: resolved.sourceReelId,
      };
    }),

  generateCarousel: adminPanelProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        selectedAngleIndex: z
          .number()
          .int()
          .min(0)
          .max(CAROUSEL_STUDIO_ANGLE_COUNT - 1),
        sourceContent: z.string().max(12000).optional(),
        sourceImage: z.string().max(2048).optional(),
        sourceReelId: z.string().max(128).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const workspaceId = requireWorkspaceId(ctx.workspaceId);
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
            eq(carouselRemakes.workspaceId, workspaceId),
            isNull(carouselRemakes.deletedAt)
          )
        )
        .limit(1);

      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Remake not found" });
      }

      if (row.status === "processing") {
        return { remakeId: row.id, status: "processing" as const };
      }
      if (row.status === "completed") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This carousel is already generated.",
        });
      }

      const angles = Array.isArray(row.angleOptionsJson)
        ? row.angleOptionsJson
        : [];
      const selected = angles[input.selectedAngleIndex];
      if (!selected) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected angle is missing. Generate angles again.",
        });
      }

      let sourceContent = input.sourceContent?.trim() || "";
      let sourceImage = input.sourceImage?.trim() || null;
      let sourceReelId = input.sourceReelId?.trim() || null;

      if (!sourceContent && row.sourceUrl) {
        try {
          const resolved = await resolveCarouselSourceFromUrl(row.sourceUrl, {
            userId: ctx.user.id,
            openId: ctx.user.openId,
          });
          sourceContent = resolved.text;
          sourceImage = sourceImage || resolved.thumbnailUrl?.trim() || null;
          sourceReelId = sourceReelId || resolved.reelId?.trim() || null;
        } catch (err) {
          if (err instanceof CarouselSourceUrlError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: err.message,
            });
          }
          throw err;
        }
      }

      await db
        .update(carouselRemakes)
        .set({
          selectedAngleIndex: input.selectedAngleIndex,
          status: "processing",
          errorMessage: null,
        })
        .where(eq(carouselRemakes.id, row.id));

      generateCarouselRemake(row.id, row.templateId, row.niche, {
        slideCountOption: middleCountFromEstimatedSlides(
          selected.estimatedSlideCount
        ),
        sourceContent: sourceContent || undefined,
        angleDirection: angleDirectionFromOption(selected),
        sourceImage,
        sourceReelId,
      }).catch((err: unknown) => {
        console.error(`Carousel Studio remake ${row.id} failed:`, err);
      });

      return { remakeId: row.id, status: "processing" as const };
    }),
});
