import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router } from "../_core/trpc";
import { viralityDiagnosticJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { discoveryProcedure } from "../discovery/trpc";
import { getPlanLimits } from "../stripe/products";
import type { PlanId } from "../stripe/products";
import { getUserSubscription } from "../stripe/stripe-service";
import { hasUnlimitedUsage } from "../usageBypass";
import { countViralityDiagnosticJobsThisMonth } from "../virality/db";
import { runViralityDiagnosticJob } from "../virality/runJob";
import { not, and, eq } from "drizzle-orm";
import { firstDayOfNextMonthUtc } from "./_shared";

export const viralityDiagnosticRouter = router({
    start: discoveryProcedure
      .input(
        z.object({
          handle: z.string().min(1).max(128),
        })
      )
      .mutation(async ({ input, ctx }) => {
        if (
          !hasUnlimitedUsage({
            openId: ctx.user.openId,
            email: ctx.user.email,
            role: ctx.user.role,
          })
        ) {
          const sub = await getUserSubscription(ctx.user.id);
          const limits = getPlanLimits(sub.plan as PlanId);
          const used = await countViralityDiagnosticJobsThisMonth(ctx.user.id);
          if (used >= limits.viralityDiagnostics) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `Monthly virality diagnostic limit reached (${used}/${limits.viralityDiagnostics}). Resets ${firstDayOfNextMonthUtc()}.`,
            });
          }
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const insertResult = await db.insert(viralityDiagnosticJobs).values({
          userId: ctx.user.id,
          handle: input.handle,
          status: "pending",
        });
        const jobId = insertResult[0].insertId;
        if (!jobId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create virality diagnostic job",
          });
        }

        runViralityDiagnosticJob(jobId, ctx.user.id, input.handle).catch(
          (err) => {
            console.error(`Virality diagnostic job ${jobId} failed:`, err);
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
            status: viralityDiagnosticJobs.status,
            reelsFound: viralityDiagnosticJobs.reelsFound,
            reelsAnalyzed: viralityDiagnosticJobs.reelsAnalyzed,
            resultJson: viralityDiagnosticJobs.resultJson,
            errorMessage: viralityDiagnosticJobs.errorMessage,
          })
          .from(viralityDiagnosticJobs)
          .where(
            and(
              eq(viralityDiagnosticJobs.id, input.jobId),
              eq(viralityDiagnosticJobs.userId, ctx.user.id)
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
});
