/**
 * Request / poll watermarked clip downloads for free and unpaid users.
 * Requires authentication. Paid users receive a direct pass-through URL.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSubscription } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { isPaidPlan } from "../userActivity";
import {
  createWatermarkJob,
  findActiveWatermarkJob,
  findCompletedWatermarkJob,
  getWatermarkJobById,
} from "../watermark/db";

const clipUrlSchema = z.string().url().max(2048);

function canAccessJob(
  job: {
    userId: number | null;
  },
  ctx: {
    user: { id: number } | null;
  }
): boolean {
  if (ctx.user && job.userId != null && job.userId === ctx.user.id) {
    return true;
  }
  return false;
}

export const watermarkJobsRouter = router({
  /**
   * Requires signup. Paid → `{ kind: "direct", downloadUrl }` (no job row).
   * Free/unpaid → reuse completed/active job or enqueue pending, return job id.
   */
  requestDownload: protectedProcedure
    .input(
      z.object({
        sourceClipUrl: clipUrlSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sub = await getSubscription(ctx.user.id);
      const paid = isPaidPlan(
        sub?.plan ?? "free",
        sub?.stripeSubscriptionId
      );
      if (paid) {
        return {
          kind: "direct" as const,
          downloadUrl: input.sourceClipUrl,
        };
      }

      const completed = await findCompletedWatermarkJob(input.sourceClipUrl);
      if (completed?.outputUrl) {
        return {
          kind: "ready" as const,
          jobId: completed.id,
          status: "completed" as const,
          outputUrl: completed.outputUrl,
        };
      }

      const active = await findActiveWatermarkJob(input.sourceClipUrl);
      if (active) {
        return {
          kind: "job" as const,
          jobId: active.id,
          status: active.status as "pending" | "processing",
          outputUrl: null,
        };
      }

      const created = await createWatermarkJob({
        sourceClipUrl: input.sourceClipUrl,
        userId: ctx.user.id,
        sessionId: null,
      });

      return {
        kind: "job" as const,
        jobId: created.id,
        status: "pending" as const,
        outputUrl: null,
      };
    }),

  getStatus: protectedProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
      })
    )
    .query(async ({ ctx, input }) => {
      const job = await getWatermarkJobById(input.jobId);
      if (!job) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Watermark job not found.",
        });
      }

      const owned =
        canAccessJob(job, ctx) || job.status === "completed";
      if (!owned) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You do not have access to this watermark job.",
        });
      }

      return {
        jobId: job.id,
        status: job.status,
        outputUrl: job.outputUrl,
        errorMessage:
          job.status === "failed" ? job.errorMessage : null,
      };
    }),
});
