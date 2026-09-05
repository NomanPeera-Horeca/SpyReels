/**
 * Carousel Studio endpoints for authenticated users with a workspace:
 * generate 3 creative briefs, recommend by score, then fire the existing remake worker.
 * Optional plan-review path returns briefs first.
 * Remix/source-carousel analysis is intentionally not implemented in this phase.
 */
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import {
  CAROUSEL_STUDIO_ANGLE_COUNT,
  CAROUSEL_STUDIO_TEMPLATE_ID,
  buildCreativeBriefSelectionTelemetry,
  logCreativeBriefSelectionTelemetry,
  looksLikeCarouselSourceUrl,
  normalizeCarouselSourceUrl,
  normalizeStoredCarouselBriefEntries,
  resolveStudioCarouselNiche,
  type NormalizedCarouselBrief,
} from "@shared/carouselStudio";
import {
  buildStudioRemakeHandoff,
  planGenerateAngles,
  planGenerateCarousel,
  planGenerateFromInput,
  plannedSlideCountFromBrief,
} from "../carousel/studioOrchestration";
import { carouselRemakes } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { proposeStudioAngles } from "../carousel/proposeStudioAngles";
import {
  logGenerateFromInputCaughtError,
  resolveAngleGenerationCorrelationId,
} from "../carousel/angleGenerationObservability";
import { generateCarouselRemake } from "../carousel/generateCarouselRemake";
import {
  CarouselSourceUrlError,
  resolveCarouselSourceFromUrl,
} from "../carousel/fetchSocialVideoSourceText";
import { assertCarouselRemakeQuota } from "./carouselRemakeRouter";
import {
  createGenerationTelemetryContext,
  isGenerationMetrics,
  persistInProgressMetrics,
  runWithGenerationTelemetry,
  withGenerationStage,
  type GenerationTelemetryContext,
} from "../carousel/generationTelemetry";

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

function middleCountFromEstimatedSlides(estimated: number): number {
  return Math.min(Math.max(estimated - 2, 3), 18);
}

type StudioResolvedSource = {
  sourceContent: string;
  sourceUrl: string | null;
  sourceImage: string | null;
  sourceReelId: string | null;
};

type StudioGenerateInput = z.infer<typeof STUDIO_GENERATE_ANGLES_INPUT>;

function prefetchOrResolveSource(
  input: StudioGenerateInput,
  user: { id: number; openId: string }
): Promise<StudioResolvedSource> | StudioResolvedSource {
  const prefetched = input.sourceContent?.trim() || "";
  if (prefetched) {
    return {
      sourceContent: prefetched,
      sourceUrl: input.sourceUrl?.trim().slice(0, 1024) || null,
      sourceImage: input.sourceImage?.trim() || null,
      sourceReelId: input.sourceReelId?.trim() || null,
    };
  }
  return resolveStudioSourceText({
    content: input.content,
    userId: user.id,
    openId: user.openId,
  });
}

function fireStudioRemake(args: {
  remakeId: number;
  niche: string;
  selected: NormalizedCarouselBrief;
  sourceContent: string;
  sourceImage: string | null;
  sourceReelId: string | null;
  telemetry?: GenerationTelemetryContext;
}): void {
  const remakeHandoff = buildStudioRemakeHandoff(args.selected);
  generateCarouselRemake(args.remakeId, CAROUSEL_STUDIO_TEMPLATE_ID, args.niche, {
    slideCountOption: middleCountFromEstimatedSlides(
      args.selected.estimatedSlideCount
    ),
    sourceContent: args.sourceContent || undefined,
    creativeBrief: remakeHandoff.creativeBrief,
    angleDirection: remakeHandoff.angleDirection,
    sourceImage: args.sourceImage,
    sourceReelId: args.sourceReelId,
    telemetry: args.telemetry,
  }).catch((err: unknown) => {
    console.error(`Carousel Studio remake ${args.remakeId} failed:`, err);
  });
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
  resolveSource: protectedProcedure
    .input(z.object({ content: z.string().min(1).max(2048) }))
    .mutation(async ({ ctx, input }) => {
      return resolveStudioSourceText({
        content: input.content,
        userId: ctx.user.id,
        openId: ctx.user.openId,
      });
    }),

  generateAngles: protectedProcedure
    .input(STUDIO_GENERATE_ANGLES_INPUT)
    .mutation(async ({ ctx, input }) => {
      const telemetry = createGenerationTelemetryContext({
        entryPoint: "carouselStudio.generateAngles",
      });

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

      const resolved = await runWithGenerationTelemetry(telemetry, () =>
        withGenerationStage(telemetry, "source_resolution", () =>
          prefetchOrResolveSource(input, ctx.user)
        )
      );
      const nicheOverride = input.niche?.trim() || undefined;
      const remakeNiche = resolveStudioCarouselNiche(
        nicheOverride,
        resolved.sourceContent
      );
      const proposal = await runWithGenerationTelemetry(telemetry, () =>
        withGenerationStage(telemetry, "angle_generation", () =>
          proposeStudioAngles({
            sourceContent: resolved.sourceContent,
            niche: nicheOverride,
            brandVoice: input.brandVoice,
            correlationId: telemetry?.runId,
            entryPoint: "carouselStudio.generateAngles",
            requiredValidBriefs: 3,
          })
        )
      );
      const plan = planGenerateAngles(
        proposal.briefs,
        proposal.formatRecommendation,
        resolved.sourceContent
      );
      if (plan.recommendedBriefIndex == null || !plan.selected) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not generate carousel angles.",
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
        niche: remakeNiche.slice(0, 500),
        sourceUrl: resolved.sourceUrl,
        status: "pending",
        angleOptionsJson: plan.angles,
        selectedAngleIndex: plan.selectedAngleIndex,
        aspectRatioOverride: input.aspectRatioOverride ?? "4:5",
      });
      const remakeId = insertResult[0].insertId;
      if (!remakeId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save carousel angles",
        });
      }
      if (telemetry) telemetry.remakeId = remakeId;
      await persistInProgressMetrics(remakeId, telemetry);
      logCreativeBriefSelectionTelemetry({
        remakeId,
        ...buildCreativeBriefSelectionTelemetry({
          briefs: plan.angles,
          recommendedBriefIndex: plan.recommendedBriefIndex,
          selectedAngleIndex: plan.selectedAngleIndex,
        }),
      });

      return {
        remakeId,
        status: "pending" as const,
        angles: plan.angles,
        sourceContent: resolved.sourceContent,
        sourceUrl: resolved.sourceUrl,
        sourceImage: resolved.sourceImage,
        sourceReelId: resolved.sourceReelId,
        estimatedSlideCount: plannedSlideCountFromBrief(plan.selected),
        selectedAngleIndex: plan.selectedAngleIndex,
        recommendedBriefIndex: plan.recommendedBriefIndex,
      };
    }),

  generateFromInput: protectedProcedure
    .input(STUDIO_GENERATE_ANGLES_INPUT)
    .mutation(async ({ ctx, input }) => {
      const telemetry = createGenerationTelemetryContext({
        entryPoint: "carouselStudio.generateFromInput",
      });
      const correlationId = resolveAngleGenerationCorrelationId(telemetry?.runId);
      const requestStartedAt = performance.now();

      try {
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

      const resolved = await runWithGenerationTelemetry(telemetry, () =>
        withGenerationStage(telemetry, "source_resolution", () =>
          prefetchOrResolveSource(input, ctx.user)
        )
      );
      const nicheOverride = input.niche?.trim() || undefined;
      const remakeNiche = resolveStudioCarouselNiche(
        nicheOverride,
        resolved.sourceContent
      );
      const proposal = await runWithGenerationTelemetry(telemetry, () =>
        withGenerationStage(telemetry, "angle_generation", () =>
          proposeStudioAngles({
            sourceContent: resolved.sourceContent,
            niche: nicheOverride,
            brandVoice: input.brandVoice,
            correlationId,
            entryPoint: "carouselStudio.generateFromInput",
            requiredValidBriefs: 1,
          })
        )
      );
      const plan = planGenerateFromInput(
        proposal.briefs,
        proposal.formatRecommendation,
        resolved.sourceContent
      );
      if (
        plan.recommendedBriefIndex == null ||
        plan.selectedAngleIndex == null ||
        !plan.selected
      ) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not generate carousel angles.",
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
        niche: remakeNiche.slice(0, 500),
        sourceUrl: resolved.sourceUrl,
        status: "processing",
        angleOptionsJson: plan.angles,
        selectedAngleIndex: plan.selectedAngleIndex,
        aspectRatioOverride: input.aspectRatioOverride ?? "4:5",
      });
      const remakeId = insertResult[0].insertId;
      if (!remakeId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to start carousel generation",
        });
      }
      if (telemetry) telemetry.remakeId = remakeId;
      await persistInProgressMetrics(remakeId, telemetry);
      logCreativeBriefSelectionTelemetry({
        remakeId,
        ...buildCreativeBriefSelectionTelemetry({
          briefs: plan.angles,
          recommendedBriefIndex: plan.recommendedBriefIndex,
          selectedAngleIndex: plan.selectedAngleIndex,
        }),
      });

      fireStudioRemake({
        remakeId,
        niche: remakeNiche,
        selected: plan.selected,
        sourceContent: resolved.sourceContent,
        sourceImage: resolved.sourceImage,
        sourceReelId: resolved.sourceReelId,
        telemetry,
      });

      return {
        remakeId,
        status: "processing" as const,
        angles: plan.angles,
        sourceContent: resolved.sourceContent,
        sourceUrl: resolved.sourceUrl,
        sourceImage: resolved.sourceImage,
        sourceReelId: resolved.sourceReelId,
        estimatedSlideCount: plannedSlideCountFromBrief(plan.selected),
        selectedAngleIndex: plan.selectedAngleIndex,
        recommendedBriefIndex: plan.recommendedBriefIndex,
      };
      } catch (err) {
        logGenerateFromInputCaughtError({
          correlationId,
          durationMs: Math.max(0, Math.round(performance.now() - requestStartedAt)),
          error: err,
        });
        throw err;
      }
    }),

  generateCarousel: protectedProcedure
    .input(
      z.object({
        remakeId: z.number().int().positive(),
        selectedAngleIndex: z
          .number()
          .int()
          .min(0)
          .max(CAROUSEL_STUDIO_ANGLE_COUNT - 1)
          .describe(
            "Display index inside the normalized valid-brief array. Server converts to the persisted stored index."
          ),
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

      const entries = normalizeStoredCarouselBriefEntries(row.angleOptionsJson);
      const {
        selected,
        recommendedBriefIndex,
        selectedAngleIndex: storedSelectedIndex,
      } = planGenerateCarousel(entries, input.selectedAngleIndex);
      if (!selected || storedSelectedIndex == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected angle is missing. Generate angles again.",
        });
      }

      const telemetry = createGenerationTelemetryContext({
        entryPoint: "carouselStudio.generateCarousel",
        remakeId: row.id,
        existing: isGenerationMetrics(row.generationMetricsJson)
          ? row.generationMetricsJson
          : null,
      });

      let sourceContent = input.sourceContent?.trim() || "";
      let sourceImage = input.sourceImage?.trim() || null;
      let sourceReelId = input.sourceReelId?.trim() || null;

      if (!sourceContent && row.sourceUrl) {
        try {
          const resolved = await runWithGenerationTelemetry(telemetry, () =>
            withGenerationStage(telemetry, "source_resolution", () =>
              resolveCarouselSourceFromUrl(row.sourceUrl!, {
                userId: ctx.user.id,
                openId: ctx.user.openId,
              })
            )
          );
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
          selectedAngleIndex: storedSelectedIndex,
          status: "processing",
          errorMessage: null,
        })
        .where(eq(carouselRemakes.id, row.id));

      if (recommendedBriefIndex != null) {
        logCreativeBriefSelectionTelemetry({
          remakeId: row.id,
          ...buildCreativeBriefSelectionTelemetry({
            briefs: entries.map((entry) => entry.brief),
            recommendedBriefIndex,
            selectedAngleIndex: input.selectedAngleIndex,
          }),
        });
      }

      fireStudioRemake({
        remakeId: row.id,
        niche: row.niche,
        selected,
        sourceContent,
        sourceImage,
        sourceReelId,
        telemetry,
      });

      return { remakeId: row.id, status: "processing" as const };
    }),
});
