import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { discoveryJobs, discoverySearches, niches, users } from "../../drizzle/schema";
import { routeNiche as routeNichePrompt } from "../ai/prompts/niche-routing";
import { getDb } from "../db";
import { countSucceededSearchesThisMonth } from "../discovery/db";
import { discoveryProcedure } from "../discovery/trpc";
import { firstDayOfNextMonthUtc } from "./_shared";
import { getPlanLimits } from "../stripe/products";
import type { PlanId } from "../stripe/products";
import { getUserSubscription } from "../stripe/stripe-service";
import { or, not, and, eq, desc, inArray } from "drizzle-orm";

async function runDiscoveryJob(
  jobId: number,
  userId: number,
  businessDescription: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  try {
    await db
      .update(discoveryJobs)
      .set({ status: "running" })
      .where(eq(discoveryJobs.id, jobId));

    const { runDiscoveryPipeline } = await import("../discovery/pipeline");
    const result = await runDiscoveryPipeline(
      businessDescription,
      async (update) => {
        const row: {
          routedNiche?: string | null;
          creatorsTotal?: number;
          creatorsDrilled?: number;
          reelsFound?: number;
          partialJson?: typeof update.partial;
        } = {};

        if (update.partial?.routedNiche) {
          row.routedNiche = update.partial.routedNiche;
        }
        if (update.creatorsTotal !== undefined) {
          row.creatorsTotal = update.creatorsTotal;
        }
        if (update.creatorsDrilled !== undefined) {
          row.creatorsDrilled = update.creatorsDrilled;
        }
        if (update.reelsFound !== undefined) {
          row.reelsFound = update.reelsFound;
        }
        if (update.partial) {
          row.partialJson = update.partial;
        }

        if (Object.keys(row).length === 0) return;

        try {
          await db
            .update(discoveryJobs)
            .set(row)
            .where(eq(discoveryJobs.id, jobId));
        } catch (err) {
          console.warn(`[runDiscoveryJob ${jobId}] progress update failed:`, err);
        }
      }
    );

    await db
      .update(discoveryJobs)
      .set({
        status: "completed",
        routedNiche: result.routedNiche || null,
        reelsFound: result.viralReels.length,
        partialJson: result,
      })
      .where(eq(discoveryJobs.id, jobId));

    try {
      const routedName = result.routedNiche?.trim();
      if (routedName) {
        const nicheRows = await db
          .select({ slug: niches.slug })
          .from(niches)
          .where(eq(niches.name, routedName))
          .limit(1);
        const slug = nicheRows[0]?.slug;
        if (slug) {
          const userRows = await db
            .select({ selectedNicheSlugs: users.selectedNicheSlugs })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          const existing = Array.isArray(userRows[0]?.selectedNicheSlugs)
            ? (userRows[0].selectedNicheSlugs as string[])
            : [];
          if (!existing.includes(slug) && existing.length < 5) {
            await db
              .update(users)
              .set({ selectedNicheSlugs: [...existing, slug] })
              .where(eq(users.id, userId));
          }
        }
      }
    } catch (err) {
      console.warn(`[runDiscoveryJob ${jobId}] niche save failed:`, err);
    }

    try {
      await db.insert(discoverySearches).values({
        userId,
        businessDescription,
        routedNiche: result.routedNiche || null,
        reelCount: result.viralReels.length,
        resultJson: result,
      });

      const kept = await db
        .select({ id: discoverySearches.id })
        .from(discoverySearches)
        .where(eq(discoverySearches.userId, userId))
        .orderBy(desc(discoverySearches.createdAt))
        .limit(10);

      const keepIds = kept.map((row) => row.id);
      if (keepIds.length > 0) {
        await db.delete(discoverySearches).where(
          and(
            eq(discoverySearches.userId, userId),
            not(inArray(discoverySearches.id, keepIds))
          )
        );
      }
    } catch (err) {
      console.warn(`[runDiscoveryJob ${jobId}] history save failed:`, err);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(discoveryJobs)
        .set({
          status: "failed",
          errorMessage: message.slice(0, 2000),
        })
        .where(eq(discoveryJobs.id, jobId));
    } catch (updateErr) {
      console.error(
        `[runDiscoveryJob ${jobId}] failed to mark job failed:`,
        updateErr
      );
    }
  }
}


export const discoveryRouter = router({
    routeNiche: discoveryProcedure
      .input(z.object({ description: z.string().min(10).max(500) }))
      .mutation(async ({ input }) => {
        const result = await routeNichePrompt({
          businessDescription: input.description,
        });
        return {
          routedNiche: result.primary_niche,
          confidence: result.confidence,
          clarifyingQuestion: result.clarifying_question ?? null,
        };
      }),

    clarifyRouting: discoveryProcedure
      .input(
        z.object({
          description: z.string().min(10).max(500),
          clarification: z.enum(["peers", "audience"]),
        })
      )
      .mutation(async ({ input }) => {
        const clarificationContext =
          input.clarification === "audience"
            ? "The creator confirmed they are making content FOR their end customers or audience (B2C). They are not selling to other businesses."
            : "The creator confirmed they sell to or target other businesses or peers in their industry (B2B). Route to the niche where their business buyers pay attention.";

        const result = await routeNichePrompt({
          businessDescription: input.description,
          clarificationContext,
        });
        return {
          routedNiche: result.primary_niche,
          confidence: result.confidence,
          clarifyingQuestion: result.clarifying_question ?? null,
        };
      }),

    search: discoveryProcedure
      .input(
        z.object({
          businessDescription: z.string().min(20).max(1000),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const insertResult = await db.insert(discoveryJobs).values({
          userId: ctx.user.id,
          businessDescription: input.businessDescription,
          status: "pending",
        });
        const jobId = insertResult[0].insertId;
        if (!jobId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create discovery job",
          });
        }

        runDiscoveryJob(jobId, ctx.user.id, input.businessDescription).catch(
          (err) => {
            console.error(`Discovery job ${jobId} failed:`, err);
          }
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
            status: discoveryJobs.status,
            routedNiche: discoveryJobs.routedNiche,
            creatorsTotal: discoveryJobs.creatorsTotal,
            creatorsDrilled: discoveryJobs.creatorsDrilled,
            reelsFound: discoveryJobs.reelsFound,
            partialJson: discoveryJobs.partialJson,
            errorMessage: discoveryJobs.errorMessage,
          })
          .from(discoveryJobs)
          .where(
            and(
              eq(discoveryJobs.id, input.jobId),
              eq(discoveryJobs.userId, ctx.user.id)
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
          id: discoverySearches.id,
          businessDescription: discoverySearches.businessDescription,
          routedNiche: discoverySearches.routedNiche,
          reelCount: discoverySearches.reelCount,
          createdAt: discoverySearches.createdAt,
        })
        .from(discoverySearches)
        .where(eq(discoverySearches.userId, ctx.user.id))
        .orderBy(desc(discoverySearches.createdAt))
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
          .select({ resultJson: discoverySearches.resultJson })
          .from(discoverySearches)
          .where(
            and(
              eq(discoverySearches.id, input.id),
              eq(discoverySearches.userId, ctx.user.id)
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
          .select({ id: discoverySearches.id })
          .from(discoverySearches)
          .where(
            and(
              eq(discoverySearches.id, input.id),
              eq(discoverySearches.userId, ctx.user.id)
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
          .delete(discoverySearches)
          .where(eq(discoverySearches.id, input.id));

        return { ok: true as const };
      }),

    getQuota: discoveryProcedure.query(async ({ ctx }) => {
      const sub = await getUserSubscription(ctx.user.id);
      const limits = getPlanLimits(sub.plan as PlanId);
      const used = await countSucceededSearchesThisMonth(ctx.user.id);
      const resetsAt = firstDayOfNextMonthUtc();
      return {
        used,
        limit: limits.discoverySearches,
        resetsAt,
      };
    }),
});
