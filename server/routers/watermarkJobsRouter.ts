/**
 * Request / poll watermarked clip downloads for free and unpaid users.
 * Paid users receive a direct pass-through to the source clip URL.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSubscription } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { isPaidPlan } from "../userActivity";
import {
  createWatermarkJob,
  findActiveWatermarkJob,
  findCompletedWatermarkJob,
  getWatermarkJobById,
} from "../watermark/db";

const clipUrlSchema = z.string().url().max(2048);
const sessionIdSchema = z.string().min(8).max(64).optional();

function canAccessJob(
  job: {
    userId: number | null;
    sessionId: string | null;
  },
  ctx: {
    user: { id: number } | null;
  },
  sessionId?: string
): boolean {
  if (ctx.user && job.userId != null && job.userId === ctx.user.id) {
    return true;
  }
  if (sessionId && job.sessionId && job.sessionId === sessionId) {
    return true;
  }
  // Completed outputs are cacheable by source URL; allow status read when
  // the caller supplied no conflicting owner (anonymous reuse of cache).
  if (job.userId == null && job.sessionId == null) {
    return true;
  }
  // Shared completed cache: any requester may read completed jobs keyed by URL.
  return false;
}

export const watermarkJobsRouter = router({
  /**
   * Paid → `{ kind: "direct", downloadUrl }`.
   * Free/unpaid → reuse completed/active job or enqueue pending, return job id.
   */
  requestDownload: publicProcedure
    .input(
      z.object({
        sourceClipUrl: clipUrlSchema,
        sessionId: sessionIdSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user) {
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
        userId: ctx.user?.id ?? null,
        sessionId: input.sessionId ?? null,
      });

      return {
        kind: "job" as const,
        jobId: created.id,
        status: "pending" as const,
        outputUrl: null,
      };
    }),

  getStatus: publicProcedure
    .input(
      z.object({
        jobId: z.number().int().positive(),
        sessionId: sessionIdSchema,
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
        canAccessJob(job, ctx, input.sessionId) ||
        job.status === "completed";
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
