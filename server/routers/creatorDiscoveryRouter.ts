import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { discoverySearches, creatorDiscoveryJobs, creatorDiscoverySearches } from "../../drizzle/schema";
import { getDb } from "../db";
import { countCombinedDiscoverySearchesThisMonth } from "../discovery/db";
import { mirrorReelThumbnailsBounded } from "../discovery/mediaMirror";
import { discoveryProcedure } from "../discovery/trpc";
import { firstDayOfNextMonthUtc } from "./_shared";
import { getPlanLimits } from "../stripe/products";
import type { PlanId } from "../stripe/products";
import { getUserSubscription } from "../stripe/stripe-service";
import { dispatchPilotJob } from "../durableJobs/dispatch";
import { not, and, eq, desc, inArray } from "drizzle-orm";

export async function runCreatorDiscoveryJob(
  jobId: number,
  userId: number,
  businessDescription: string
): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const existing = await db
    .select({ status: creatorDiscoveryJobs.status })
    .from(creatorDiscoveryJobs)
    .where(eq(creatorDiscoveryJobs.id, jobId))
    .limit(1);
  if (existing[0]?.status === "completed") {
    return;
  }

  try {
    await db
      .update(creatorDiscoveryJobs)
      .set({
        status: "running",
        routedNiche: null,
        topicsTotal: 0,
        topicsSearched: 0,
        creatorsFound: 0,
        partialJson: null,
        errorMessage: null,
      })
      .where(eq(creatorDiscoveryJobs.id, jobId));

    const { runCreatorDiscoveryPipeline } = await import(
      "../discovery/creatorPipeline"
    );
    const result = await runCreatorDiscoveryPipeline(
      businessDescription,
      async (update) => {
        const row: {
          routedNiche?: string | null;
          topicsTotal?: number;
          topicsSearched?: number;
          creatorsFound?: number;
          partialJson?: typeof update.partial;
        } = {};

        if (update.partial?.routedNiche) {
          row.routedNiche = update.partial.routedNiche;
        }
        if (update.topicsTotal !== undefined) {
          row.topicsTotal = update.topicsTotal;
        }
        if (update.topicsSearched !== undefined) {
          row.topicsSearched = update.topicsSearched;
        }
        if (update.creatorsFound !== undefined) {
          row.creatorsFound = update.creatorsFound;
        }
        if (update.partial) {
          row.partialJson = update.partial;
        }

        if (Object.keys(row).length === 0) return;

        try {
          await db
            .update(creatorDiscoveryJobs)
            .set(row)
            .where(eq(creatorDiscoveryJobs.id, jobId));
        } catch (err) {
          console.warn(
            `[runCreatorDiscoveryJob ${jobId}] progress update failed:`,
            err
          );
        }
      }
    );

    const {
      mirrorProfilePicsBounded,
      mirrorReelThumbnailsBounded,
    } = await import("../discovery/mediaMirror");

    const ranked = result.rankedCreators;
    const stableThumbs = await mirrorReelThumbnailsBounded(
      ranked.map((creator) => ({
        shortcode: creator.bestReel.shortcode,
        thumbnailUrl: creator.bestReel.thumbnailUrl,
      }))
    );
    const stableProfilePics = await mirrorProfilePicsBounded(
      ranked.map((creator) => ({
        username: creator.owner.username,
        profilePicUrl: creator.owner.profilePicUrl,
      }))
    );

    const mirroredResult = {
      ...result,
      rankedCreators: ranked.map((creator) => ({
        ...creator,
        owner: {
          ...creator.owner,
          profilePicUrl:
            stableProfilePics.get(creator.owner.username.toLowerCase()) ??
            creator.owner.profilePicUrl,
        },
        bestReel: {
          ...creator.bestReel,
          thumbnailUrl:
            stableThumbs.get(creator.bestReel.shortcode) ??
            creator.bestReel.thumbnailUrl,
        },
      })),
    };

    if (mirroredResult.rankedCreators.length === 0) {
      throw new Error("Creator discovery completed with zero ranked creators");
    }

    await db.transaction(async (tx) => {
      await tx.insert(creatorDiscoverySearches).values({
        userId,
        businessDescription,
        routedNiche: mirroredResult.routedNiche || null,
        creatorCount: mirroredResult.rankedCreators.length,
        resultJson: mirroredResult,
      });

      await tx
        .update(creatorDiscoveryJobs)
        .set({
          status: "completed",
          routedNiche: mirroredResult.routedNiche || null,
          creatorsFound: mirroredResult.rankedCreators.length,
          partialJson: mirroredResult,
          errorMessage: null,
        })
        .where(eq(creatorDiscoveryJobs.id, jobId));
    });

    try {
      const kept = await db
        .select({ id: creatorDiscoverySearches.id })
        .from(creatorDiscoverySearches)
        .where(eq(creatorDiscoverySearches.userId, userId))
        .orderBy(desc(creatorDiscoverySearches.createdAt))
        .limit(10);

      const keepIds = kept.map((row) => row.id);
      if (keepIds.length > 0) {
        await db.delete(creatorDiscoverySearches).where(
          and(
            eq(creatorDiscoverySearches.userId, userId),
            not(inArray(creatorDiscoverySearches.id, keepIds))
          )
        );
      }
    } catch (err) {
      console.warn(
        `[runCreatorDiscoveryJob ${jobId}] history cleanup failed:`,
        err
      );
    }
  } catch (err) {
    console.error(`[runCreatorDiscoveryJob ${jobId}] failed:`, err);
    const userMessage = userFacingCreatorDiscoveryJobError(err);
    try {
      await db
        .update(creatorDiscoveryJobs)
        .set({
          status: "failed",
          errorMessage: userMessage.slice(0, 2000),
        })
        .where(eq(creatorDiscoveryJobs.id, jobId));
    } catch (updateErr) {
      console.error(
        `[runCreatorDiscoveryJob ${jobId}] failed to mark job failed:`,
        updateErr
      );
    }
    throw err;
  }
}

function userFacingCreatorDiscoveryJobError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("credit balance") ||
    lower.includes("billing") ||
    lower.includes("insufficient credit") ||
    lower.includes("purchase credits") ||
    lower.includes("payment required")
  ) {
    return "Search temporarily unavailable. Please try again shortly.";
  }

  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("too many requests")
  ) {
    return "Search is busy right now. Please try again in a few minutes.";
  }

  return "Search failed. Please try again.";
}


export const creatorDiscoveryRouter = router({
    search: discoveryProcedure
      .input(
        z.object({
          businessDescription: z.string().min(20).max(1000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const sub = await getUserSubscription(ctx.user.id);
        const limits = getPlanLimits(sub.plan as PlanId);
        const used = await countCombinedDiscoverySearchesThisMonth(ctx.user.id);
        if (used >= limits.discoverySearches) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Monthly discovery search limit reached (${used}/${limits.discoverySearches}). Resets ${firstDayOfNextMonthUtc()}.`,
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const insertResult = await db.insert(creatorDiscoveryJobs).values({
          userId: ctx.user.id,
          businessDescription: input.businessDescription,
          status: "pending",
        });
        const jobId = insertResult[0].insertId;
        if (!jobId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create creator discovery job",
          });
        }

        const dispatchRoute = await dispatchPilotJob({
          jobType: "creator_discovery",
          idempotencyKey: `creator_discovery:${jobId}`,
          rolloutKey: String(ctx.user.id),
          payload: {
            jobId,
            userId: ctx.user.id,
            businessDescription: input.businessDescription,
          },
          runInline: () =>
            runCreatorDiscoveryJob(
              jobId,
              ctx.user.id,
              input.businessDescription
            ),
          onInlineError: (error) =>
            console.error(`Creator discovery job ${jobId} failed:`, error),
        });

        console.info(
          `Creator discovery job ${jobId} routed ${dispatchRoute}`
        );

        return { jobId };
      }),

    jobStatus: discoveryProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select({
            status: creatorDiscoveryJobs.status,
            routedNiche: creatorDiscoveryJobs.routedNiche,
            topicsTotal: creatorDiscoveryJobs.topicsTotal,
            topicsSearched: creatorDiscoveryJobs.topicsSearched,
            creatorsFound: creatorDiscoveryJobs.creatorsFound,
            partialJson: creatorDiscoveryJobs.partialJson,
            errorMessage: creatorDiscoveryJobs.errorMessage,
          })
          .from(creatorDiscoveryJobs)
          .where(
            and(
              eq(creatorDiscoveryJobs.id, input.jobId),
              eq(creatorDiscoveryJobs.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!rows[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Job not found",
          });
        }

        return rows[0];
      }),

    recentSearches: discoveryProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          id: creatorDiscoverySearches.id,
          businessDescription: creatorDiscoverySearches.businessDescription,
          routedNiche: creatorDiscoverySearches.routedNiche,
          creatorCount: creatorDiscoverySearches.creatorCount,
          createdAt: creatorDiscoverySearches.createdAt,
        })
        .from(creatorDiscoverySearches)
        .where(eq(creatorDiscoverySearches.userId, ctx.user.id))
        .orderBy(desc(creatorDiscoverySearches.createdAt))
        .limit(10);
    }),

    getSearch: discoveryProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select({ resultJson: creatorDiscoverySearches.resultJson })
          .from(creatorDiscoverySearches)
          .where(
            and(
              eq(creatorDiscoverySearches.id, input.id),
              eq(creatorDiscoverySearches.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!rows[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Search not found",
          });
        }

        return rows[0].resultJson;
      }),

    deleteSearch: discoveryProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const existing = await db
          .select({ id: creatorDiscoverySearches.id })
          .from(creatorDiscoverySearches)
          .where(
            and(
              eq(creatorDiscoverySearches.id, input.id),
              eq(creatorDiscoverySearches.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!existing[0]) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Search not found",
          });
        }

        await db
          .delete(creatorDiscoverySearches)
          .where(eq(creatorDiscoverySearches.id, input.id));

        return { ok: true as const };
      }),

    getQuota: discoveryProcedure.query(async ({ ctx }) => {
      const sub = await getUserSubscription(ctx.user.id);
      const limits = getPlanLimits(sub.plan as PlanId);
      const used = await countCombinedDiscoverySearchesThisMonth(ctx.user.id);
      const resetsAt = firstDayOfNextMonthUtc();
      return {
        used,
        limit: limits.discoverySearches,
        resetsAt,
      };
    }),
});
