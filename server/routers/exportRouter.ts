import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getScrapeJob, countReelsForJob, getActiveExportJobForScrapeJob, getLatestCompletedExportForScrapeJob, createExportJob } from "../db";
import { getExportJobIfAccessible, runExportJob } from "../exportJobRunner";
import { prepareReelsForExport, buildExportRows } from "../exportPipeline";
import { isGoogleSheetsConfigured, exportToGoogleSheets } from "../googleSheets";
import { storageReadBuffer } from "../storage";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { EXPORT_SCOPES, resolveExportScope } from "@shared/exportScope";
import { not, or } from "drizzle-orm";

export const exportRouter = router({
    sheetsAvailable: protectedProcedure.query(() => {
      return { available: isGoogleSheetsConfigured() };
    }),

    /** Latest cached Excel export for a scrape job (free re-download if valid). */
    latestForScrapeJob: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          scope: z.enum(EXPORT_SCOPES).optional().default("top_viral_30"),
        })
      )
      .query(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });

        const currentReelCount = await countReelsForJob(input.jobId);
        const effectiveScope = resolveExportScope(currentReelCount, input.scope);

        const active = await getActiveExportJobForScrapeJob(input.jobId, ctx.workspaceId);
        if (active) {
          return {
            exportJobId: active.id,
            status: active.status,
            exportScope: active.exportScope,
            currentStep: active.currentStep,
            progressPercent: active.progressPercent,
            stepDone: active.stepDone,
            stepTotal: active.stepTotal,
            progressLabel: active.progressLabel,
            filename: active.filename,
            isStale: false,
            isExpired: false,
            cached: false,
          };
        }

        const cached = await getLatestCompletedExportForScrapeJob(
          input.jobId,
          ctx.workspaceId,
          effectiveScope
        );
        if (!cached) {
          return null;
        }

        const isExpired =
          cached.expiresAt != null && new Date(cached.expiresAt) < new Date();
        const isStale =
          cached.reelCountAtExport != null &&
          cached.reelCountAtExport < currentReelCount;

        return {
          exportJobId: cached.id,
          status: cached.status,
          exportScope: cached.exportScope,
          currentStep: cached.currentStep,
          progressPercent: cached.progressPercent,
          stepDone: cached.stepDone,
          stepTotal: cached.stepTotal,
          progressLabel: cached.progressLabel,
          filename: cached.filename,
          completedAt: cached.completedAt,
          reelCountAtExport: cached.reelCountAtExport,
          currentReelCount,
          isStale,
          isExpired,
          cached: !isExpired && !isStale,
        };
      }),

    /** Poll export job progress. */
    status: protectedProcedure
      .input(z.object({ exportJobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const row = await getExportJobIfAccessible(input.exportJobId, ctx.workspaceId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });

        const currentReelCount = await countReelsForJob(row.scrapeJobId);
        const isExpired =
          row.expiresAt != null && new Date(row.expiresAt) < new Date();
        const isStale =
          row.reelCountAtExport != null &&
          row.reelCountAtExport < currentReelCount;

        return {
          exportJobId: row.id,
          scrapeJobId: row.scrapeJobId,
          status: row.status,
          exportScope: row.exportScope,
          currentStep: row.currentStep,
          progressPercent: row.progressPercent,
          stepDone: row.stepDone,
          stepTotal: row.stepTotal,
          progressLabel: row.progressLabel,
          filename: row.filename,
          errorMessage: row.errorMessage,
          completedAt: row.completedAt,
          isStale,
          isExpired,
          cached: row.status === "completed" && !isExpired && !isStale,
        };
      }),

    /** Start background export (or return existing in-flight job). */
    start: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          regenerate: z.boolean().optional().default(false),
          scope: z.enum(EXPORT_SCOPES).optional().default("top_viral_30"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });

        const currentReelCount = await countReelsForJob(input.jobId);
        const effectiveScope = resolveExportScope(currentReelCount, input.scope);

        if (!input.regenerate) {
          const active = await getActiveExportJobForScrapeJob(
            input.jobId,
            ctx.workspaceId
          );
          if (active) {
            return {
              exportJobId: active.id,
              status: active.status as "pending" | "processing",
              exportScope: active.exportScope,
              started: false,
              cached: false,
            };
          }

          const cached = await getLatestCompletedExportForScrapeJob(
            input.jobId,
            ctx.workspaceId,
            effectiveScope
          );
          if (cached) {
            const isExpired =
              cached.expiresAt != null && new Date(cached.expiresAt) < new Date();
            const isStale =
              cached.reelCountAtExport != null &&
              cached.reelCountAtExport < currentReelCount;
            if (!isExpired && !isStale) {
              return {
                exportJobId: cached.id,
                status: "completed" as const,
                exportScope: cached.exportScope,
                started: false,
                cached: true,
              };
            }
          }
        }

        const usageCheck = await checkUsageLimit(
          ctx.user.id,
          "exportCount",
          ctx.user.openId
        );
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your export limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "exportCount");

        const exportJobId = await createExportJob({
          userId: ctx.user.id,
          scrapeJobId: input.jobId,
          exportScope: effectiveScope,
          status: "pending",
          currentStep: "pending",
          progressPercent: 0,
          progressLabel: "Queued…",
        });

        runExportJob(
          exportJobId,
          ctx.user.id,
          ctx.user.openId,
          input.jobId,
          ctx.workspaceId
        ).catch((err) => {
          console.error(`[export.start] background job ${exportJobId} failed:`, err);
        });

        return {
          exportJobId,
          status: "pending" as const,
          exportScope: effectiveScope,
          started: true,
          cached: false,
        };
      }),

    /** Download a completed export (no credits). */
    download: protectedProcedure
      .input(z.object({ exportJobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const row = await getExportJobIfAccessible(input.exportJobId, ctx.workspaceId);
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Export not found" });
        if (row.status !== "completed" || !row.fileR2Key || !row.filename) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Export is not ready yet.",
          });
        }
        if (row.expiresAt && new Date(row.expiresAt) < new Date()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "This export expired. Regenerate to create a new file.",
          });
        }

        const buffer = await storageReadBuffer(row.fileR2Key);
        return {
          fileBase64: buffer.toString("base64"),
          filename: row.filename,
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        };
      }),

    /** @deprecated Use export.start + export.download */
    csv: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });

        const cached = await getLatestCompletedExportForScrapeJob(
          input.jobId,
          ctx.workspaceId
        );
        const currentReelCount = await countReelsForJob(input.jobId);
        if (
          cached?.fileR2Key &&
          cached.filename &&
          cached.reelCountAtExport === currentReelCount &&
          (!cached.expiresAt || new Date(cached.expiresAt) >= new Date())
        ) {
          const buffer = await storageReadBuffer(cached.fileR2Key);
          return {
            fileBase64: buffer.toString("base64"),
            filename: cached.filename,
            mimeType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          };
        }

        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Use export.start for background exports.",
        });
      }),

    /** Export to Google Sheets */
    googleSheets: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          email: z.string().email().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (!isGoogleSheetsConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Google Sheets is not configured. Please add your Google service account credentials in Settings.",
          });
        }

        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "exportCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your export limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "exportCount");

        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });

        await prepareReelsForExport(input.jobId, ctx.user.id, ctx.user.openId);
        const { rows } = await buildExportRows(input.jobId);

        const title = `Reels - @${job.handle || "export"} - ${new Date().toLocaleDateString()}`;

        const result = await exportToGoogleSheets(title, rows, input.email);

        return {
          spreadsheetUrl: result.spreadsheetUrl,
          spreadsheetId: result.spreadsheetId,
        };
      }),
});
