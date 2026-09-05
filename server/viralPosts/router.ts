import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  VIRAL_POSTS_NOT_ENABLED_MESSAGE,
} from "@shared/viralPosts";
import { users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  isAnyViralPostsPlatformEnabled,
  isViralPostsLive,
} from "./featureFlag";
import {
  saveViralCandidateCanonical,
  unsaveViralCandidateCanonical,
} from "./canonicalSaved";
import { browseViralPosts } from "./browseService";
import * as repo from "./repository";
import {
  getFeedHistory,
  getOrCreateDailyFeed,
  getSavedViralPosts,
  searchViralPosts,
} from "./service";

const viralPostsProcedure = protectedProcedure.use(({ next }) => {
  if (!isViralPostsLive) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: VIRAL_POSTS_NOT_ENABLED_MESSAGE,
    });
  }
  if (!isAnyViralPostsPlatformEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Viral Posts is not available right now",
    });
  }
  return next();
});

function parseCandidateId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid post id" });
  }
  return n;
}

export const viralPostsRouter = router({
  getDailyFeed: viralPostsProcedure
    .input(
      z.object({
        timezone: z.string().min(1).max(64).default("UTC"),
        localDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "localDate must be YYYY-MM-DD"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (db) {
        const stored = ctx.user.timezone ?? null;
        if (stored !== input.timezone) {
          await db
            .update(users)
            .set({ timezone: input.timezone })
            .where(eq(users.id, ctx.user.id));
        }
      }
      return getOrCreateDailyFeed({
        userId: ctx.user.id,
        localDate: input.localDate,
        timezone: input.timezone,
      });
    }),

  getFeedHistory: viralPostsProcedure
    .input(
      z.object({
        /** Today's localDate (YYYY-MM-DD); past feeds only. */
        excludeLocalDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "excludeLocalDate must be YYYY-MM-DD"),
        /** Exclusive upper bound; omit on first page (uses excludeLocalDate). */
        cursor: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "cursor must be YYYY-MM-DD")
          .optional(),
        limit: z.number().int().min(1).max(14).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      return getFeedHistory({
        userId: ctx.user.id,
        excludeLocalDate: input.excludeLocalDate,
        cursor: input.cursor,
        limit: input.limit,
      });
    }),

  browse: viralPostsProcedure.query(async ({ ctx }) => {
    return browseViralPosts(ctx.user.id);
  }),

  search: viralPostsProcedure
    .input(
      z.object({
        query: z.string().min(1).max(200),
        rising: z.boolean().optional(),
        proven: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const result = await searchViralPosts({
        userId: ctx.user.id,
        query: input.query,
      });
      let items = result.items;
      if (input.rising) {
        items = items.filter(
          (i) =>
            i.trendStatus === "rising-fast" || i.trendStatus === "breaking-out"
        );
      }
      if (input.proven) {
        items = items.filter((i) => i.trendStatus === "proven-format");
      }
      return { ...result, items };
    }),

  getSaved: viralPostsProcedure.query(async ({ ctx }) => {
    const items = await getSavedViralPosts(ctx.user.id);
    return { items };
  }),

  save: viralPostsProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const candidateId = parseCandidateId(input.postId);
      const candidate = await repo.getCandidateById(candidateId);
      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }
      await Promise.all([
        repo.saveCandidate(ctx.user.id, candidateId),
        saveViralCandidateCanonical(ctx.user.id, candidateId),
      ]);
      return { ok: true as const, postId: input.postId, saved: true };
    }),

  unsave: viralPostsProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const candidateId = parseCandidateId(input.postId);
      await Promise.all([
        repo.unsaveCandidate(ctx.user.id, candidateId),
        unsaveViralCandidateCanonical(ctx.user.id, candidateId),
      ]);
      return { ok: true as const, postId: input.postId, saved: false };
    }),

  feedback: viralPostsProcedure
    .input(
      z.object({
        postId: z.string().min(1),
        feedbackType: z.enum([
          "more_like_this",
          "not_relevant",
          "dismissed",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const candidateId = parseCandidateId(input.postId);
      const candidate = await repo.getCandidateById(candidateId);
      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }
      await repo.recordFeedback({
        userId: ctx.user.id,
        candidateId,
        feedbackType: input.feedbackType,
      });
      return { ok: true as const, postId: input.postId };
    }),

  hideCreator: viralPostsProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const candidateId = parseCandidateId(input.postId);
      const candidate = await repo.getCandidateById(candidateId);
      if (!candidate) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
      }
      const creatorKey = (
        candidate.creatorId ||
        candidate.creatorHandle ||
        ""
      )
        .toLowerCase()
        .replace(/^@/, "");
      if (!creatorKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Creator cannot be hidden",
        });
      }
      await repo.hideCreator({
        userId: ctx.user.id,
        platform: candidate.platform || "instagram",
        creatorKey,
      });
      await repo.recordFeedback({
        userId: ctx.user.id,
        candidateId,
        feedbackType: "dismissed",
      });
      return { ok: true as const, creatorKey };
    }),
});
