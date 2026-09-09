import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { savedReels } from "../../drizzle/schema";
import { isFeaturedReelSaved, unsaveFeaturedReel, saveFeaturedReel, isTiktokVideoSaved, unsaveTiktokVideo, saveTiktokVideo, isYoutubeVideoSaved, unsaveYoutubeVideo, saveYoutubeVideo, isReelSaved, unsaveReel, saveReel, getDb, getSavedReelsWithDetails, getSavedFeaturedReelsWithDetails, getSavedDiscoverReelsWithDetails, getSavedTiktokVideosWithDetails, getSavedYoutubeVideosWithDetails } from "../db";
import { toSavedListTranscriptionSummary } from "@shared/savedListTranscription";
import type { SavedListTranscriptionSummary } from "@shared/savedListTranscription";
import { or, not, and, eq, inArray } from "drizzle-orm";

const SAVED_CHECK_BATCH = 200;

export const savedRouter = router({
    /**
     * Toggle save/unsave a reel. Accepts exactly one of:
     * (`reelId` + `jobId`), `featuredReelId`, `tiktokVideoId`, or `youtubeVideoId`.
     * The db helpers keep the keyspaces separate so the
     * "exactly-one-column-populated" invariant holds.
     */
    toggle: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            jobId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
          })
          .refine(
            (d) => {
              const userPair = d.reelId != null && d.jobId != null;
              const userPartial =
                (d.reelId != null) !== (d.jobId != null); // one but not both
              if (userPartial) return false;
              const modes = [
                userPair,
                d.featuredReelId != null,
                d.tiktokVideoId != null,
                d.youtubeVideoId != null,
              ].filter(Boolean);
              return modes.length === 1;
            },
            {
              message:
                "Provide exactly one of (reelId + jobId), featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        if (input.featuredReelId != null) {
          const alreadySaved = await isFeaturedReelSaved(
            ctx.workspaceId,
            ctx.user.id,
            input.featuredReelId
          );
          if (alreadySaved) {
            await unsaveFeaturedReel(ctx.workspaceId, ctx.user.id, input.featuredReelId);
            return { saved: false } as const;
          }
          await saveFeaturedReel(ctx.user.id, input.featuredReelId, ctx.workspaceId);
          return { saved: true } as const;
        }
        if (input.tiktokVideoId != null) {
          const alreadySaved = await isTiktokVideoSaved(
            ctx.workspaceId,
            ctx.user.id,
            input.tiktokVideoId
          );
          if (alreadySaved) {
            await unsaveTiktokVideo(ctx.workspaceId, ctx.user.id, input.tiktokVideoId);
            return { saved: false } as const;
          }
          await saveTiktokVideo(ctx.user.id, input.tiktokVideoId, ctx.workspaceId);
          return { saved: true } as const;
        }
        if (input.youtubeVideoId != null) {
          const alreadySaved = await isYoutubeVideoSaved(
            ctx.workspaceId,
            ctx.user.id,
            input.youtubeVideoId
          );
          if (alreadySaved) {
            await unsaveYoutubeVideo(ctx.workspaceId, ctx.user.id, input.youtubeVideoId);
            return { saved: false } as const;
          }
          await saveYoutubeVideo(ctx.user.id, input.youtubeVideoId, ctx.workspaceId);
          return { saved: true } as const;
        }
        const alreadySaved = await isReelSaved(ctx.workspaceId, ctx.user.id, input.reelId!);
        if (alreadySaved) {
          await unsaveReel(ctx.workspaceId, ctx.user.id, input.reelId!);
          return { saved: false } as const;
        }
        await saveReel({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          reelId: input.reelId!,
          jobId: input.jobId!,
        });
        return { saved: true } as const;
      }),

    /** Check if a reel is saved (any source). */
    check: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .query(async ({ ctx, input }) => {
        if (input.featuredReelId != null) {
          return {
            saved: await isFeaturedReelSaved(
              ctx.workspaceId,
              ctx.user.id,
              input.featuredReelId
            ),
          };
        }
        if (input.tiktokVideoId != null) {
          return {
            saved: await isTiktokVideoSaved(
              ctx.workspaceId,
              ctx.user.id,
              input.tiktokVideoId
            ),
          };
        }
        if (input.youtubeVideoId != null) {
          return {
            saved: await isYoutubeVideoSaved(
              ctx.workspaceId,
              ctx.user.id,
              input.youtubeVideoId
            ),
          };
        }
        return { saved: await isReelSaved(ctx.workspaceId, ctx.user.id, input.reelId!) };
      }),

    /**
     * Check which reels from a list are saved. Callers pass exactly one of
     * `reelIds`, `featuredReelIds`, `tiktokVideoIds`, or `youtubeVideoIds`.
     * Returned map is keyed by whichever id type was supplied.
     */
    checkBatch: protectedProcedure
      .input(
        z
          .object({
            reelIds: z.array(z.number()).optional(),
            featuredReelIds: z.array(z.number()).optional(),
            tiktokVideoIds: z.array(z.number()).optional(),
            youtubeVideoIds: z.array(z.number()).optional(),
          })
          .refine(
            (d) =>
              [
                d.reelIds,
                d.featuredReelIds,
                d.tiktokVideoIds,
                d.youtubeVideoIds,
              ].filter((ids) => ids != null).length === 1,
            {
              message:
                "Provide exactly one of reelIds, featuredReelIds, tiktokVideoIds, or youtubeVideoIds",
            }
          )
      )
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");
        const { workspaceId } = ctx;
        const userId = ctx.user.id;
        const savedMap: Record<number, boolean> = {};

        if (input.featuredReelIds) {
          const ids = input.featuredReelIds;
          for (const id of ids) savedMap[id] = false;
          if (ids.length === 0) return savedMap;
          const savedSet = new Set<number>();
          for (let i = 0; i < ids.length; i += SAVED_CHECK_BATCH) {
            const chunk = ids.slice(i, i + SAVED_CHECK_BATCH);
            const rows = await db
              .select({ featuredReelId: savedReels.featuredReelId })
              .from(savedReels)
              .where(
                and(
                  eq(savedReels.workspaceId, workspaceId),
                  eq(savedReels.userId, userId),
                  inArray(savedReels.featuredReelId, chunk)
                )
              );
            for (const r of rows) {
              if (r.featuredReelId != null) savedSet.add(r.featuredReelId);
            }
          }
          for (const id of ids) savedMap[id] = savedSet.has(id);
          return savedMap;
        }

        if (input.tiktokVideoIds) {
          const ids = input.tiktokVideoIds;
          for (const id of ids) savedMap[id] = false;
          if (ids.length === 0) return savedMap;
          const savedSet = new Set<number>();
          for (let i = 0; i < ids.length; i += SAVED_CHECK_BATCH) {
            const chunk = ids.slice(i, i + SAVED_CHECK_BATCH);
            const rows = await db
              .select({ tiktokVideoId: savedReels.tiktokVideoId })
              .from(savedReels)
              .where(
                and(
                  eq(savedReels.workspaceId, workspaceId),
                  eq(savedReels.userId, userId),
                  inArray(savedReels.tiktokVideoId, chunk)
                )
              );
            for (const r of rows) {
              if (r.tiktokVideoId != null) savedSet.add(r.tiktokVideoId);
            }
          }
          for (const id of ids) savedMap[id] = savedSet.has(id);
          return savedMap;
        }

        if (input.youtubeVideoIds) {
          const ids = input.youtubeVideoIds;
          for (const id of ids) savedMap[id] = false;
          if (ids.length === 0) return savedMap;
          const savedSet = new Set<number>();
          for (let i = 0; i < ids.length; i += SAVED_CHECK_BATCH) {
            const chunk = ids.slice(i, i + SAVED_CHECK_BATCH);
            const rows = await db
              .select({ youtubeVideoId: savedReels.youtubeVideoId })
              .from(savedReels)
              .where(
                and(
                  eq(savedReels.workspaceId, workspaceId),
                  eq(savedReels.userId, userId),
                  inArray(savedReels.youtubeVideoId, chunk)
                )
              );
            for (const r of rows) {
              if (r.youtubeVideoId != null) savedSet.add(r.youtubeVideoId);
            }
          }
          for (const id of ids) savedMap[id] = savedSet.has(id);
          return savedMap;
        }

        const ids = input.reelIds!;
        for (const id of ids) savedMap[id] = false;
        if (ids.length === 0) return savedMap;
        const savedSet = new Set<number>();
        for (let i = 0; i < ids.length; i += SAVED_CHECK_BATCH) {
          const chunk = ids.slice(i, i + SAVED_CHECK_BATCH);
          const rows = await db
            .select({ reelId: savedReels.reelId })
            .from(savedReels)
            .where(
              and(
                eq(savedReels.workspaceId, workspaceId),
                eq(savedReels.userId, userId),
                inArray(savedReels.reelId, chunk)
              )
            );
          for (const r of rows) {
            if (r.reelId != null) savedSet.add(r.reelId);
          }
        }
        for (const id of ids) savedMap[id] = savedSet.has(id);
        return savedMap;
      }),

    /**
     * List all saved reels with full details. Merges the sources
     * behind a single normalized shape — each item exposes `source`
     * ("scraped" | "featured" | "discover" | "tiktok" | "youtube") so the
     * frontend can route clicks to the correct URL. Shape keeps the
     * `reel` + `job` fields the existing UI already consumes for scraped
     * rows; other sources synth the same keys.
     */
    list: protectedProcedure.query(async ({ ctx }) => {
      const scraped = await getSavedReelsWithDetails(ctx.workspaceId);
      const featured = await getSavedFeaturedReelsWithDetails(ctx.workspaceId);
      const discover = await getSavedDiscoverReelsWithDetails(ctx.workspaceId);
      const tiktok = await getSavedTiktokVideosWithDetails(ctx.workspaceId);
      const youtube = await getSavedYoutubeVideosWithDetails(ctx.workspaceId);

      type ListedSaved = {
        id: number;
        userId: number;
        createdAt: Date;
        source: "scraped" | "featured" | "discover" | "tiktok" | "youtube";
        reelId: number | null;
        jobId: number | null;
        featuredReelId: number | null;
        tiktokVideoId: number | null;
        youtubeVideoId: number | null;
        reel: {
          id: number;
          shortcode: string;
          thumbnailUrl: string | null;
          videoUrl: string | null;
          caption: string | null;
          viewCount: number;
          likeCount: number;
          commentCount: number;
          duration: number | null;
          postedAt: Date;
          reelUrl: string;
          ownerUsername: string | null;
          contentType: string | null;
          remakeabilityScore: number | null;
          suggestedAction: string | null;
          classificationReason: string | null;
          classifiedAt: Date | null;
        };
        job: {
          id: number;
          handle: string;
          followerCount: number;
          featuredAccountId: number | null;
        };
        transcription?: SavedListTranscriptionSummary;
      };

      const scrapedItems: ListedSaved[] = scraped.map((s) => ({
        id: s.id,
        userId: s.userId,
        createdAt: s.createdAt,
        source: "scraped" as const,
        reelId: s.reelId,
        jobId: s.jobId,
        featuredReelId: null,
        tiktokVideoId: null,
        youtubeVideoId: null,
        reel: {
          id: s.reel.id,
          shortcode: s.reel.shortcode,
          thumbnailUrl: s.reel.thumbnailUrl,
          videoUrl: s.reel.videoUrl,
          caption: s.reel.caption,
          viewCount: s.reel.viewCount ?? 0,
          likeCount: s.reel.likeCount ?? 0,
          commentCount: s.reel.commentCount ?? 0,
          duration: s.reel.duration,
          postedAt: s.reel.postedAt,
          reelUrl: s.reel.reelUrl,
          ownerUsername: s.reel.ownerUsername,
          contentType: s.reel.contentType ?? null,
          remakeabilityScore: s.reel.remakeabilityScore ?? null,
          suggestedAction: s.reel.suggestedAction ?? null,
          classificationReason: s.reel.classificationReason ?? null,
          classifiedAt: s.reel.classifiedAt ?? null,
        },
        job: {
          id: s.job.id,
          handle: s.job.handle,
          followerCount: s.job.followerCount ?? 0,
          featuredAccountId: null,
        },
        transcription: toSavedListTranscriptionSummary(s.transcription),
      }));

      const featuredItems: ListedSaved[] = featured.map((f) => ({
        id: f.id,
        userId: f.userId,
        createdAt: f.createdAt,
        source: "featured" as const,
        reelId: null,
        jobId: null,
        featuredReelId: f.featuredReelId,
        tiktokVideoId: null,
        youtubeVideoId: null,
        reel: {
          id: f.featuredReel.id,
          shortcode: f.featuredReel.reelShortcode,
          thumbnailUrl: f.featuredReel.thumbnailUrl,
          videoUrl: f.featuredReel.videoUrl,
          caption: f.featuredReel.caption,
          viewCount: f.featuredReel.viewCount ?? 0,
          likeCount: f.featuredReel.likeCount ?? 0,
          commentCount: f.featuredReel.commentCount ?? 0,
          duration: f.featuredReel.duration,
          postedAt: f.featuredReel.postedAt,
          reelUrl: `https://www.instagram.com/reel/${f.featuredReel.reelShortcode}/`,
          ownerUsername: f.featuredAccount.handle,
          contentType: f.featuredReel.contentType ?? null,
          remakeabilityScore: f.featuredReel.remakeabilityScore ?? null,
          suggestedAction: f.featuredReel.suggestedAction ?? null,
          classificationReason: f.featuredReel.classificationReason ?? null,
          classifiedAt: f.featuredReel.classifiedAt ?? null,
        },
        job: {
          id: f.featuredAccount.id,
          handle: f.featuredAccount.handle,
          followerCount: f.featuredAccount.followerCount ?? 0,
          featuredAccountId: f.featuredAccount.id,
        },
        transcription: toSavedListTranscriptionSummary(f.transcription),
      }));

      const discoverItems: ListedSaved[] = discover.map((d) => ({
        id: d.id,
        userId: d.userId,
        createdAt: d.createdAt,
        source: "discover" as const,
        reelId: d.reelId,
        jobId: d.jobId,
        featuredReelId: null,
        tiktokVideoId: null,
        youtubeVideoId: null,
        reel: {
          id: d.reel.id,
          shortcode: d.reel.shortcode,
          thumbnailUrl: d.reel.thumbnailUrl,
          videoUrl: d.reel.videoUrl,
          caption: d.reel.caption,
          viewCount: d.reel.viewCount ?? 0,
          likeCount: d.reel.likeCount ?? 0,
          commentCount: d.reel.commentCount ?? 0,
          duration: d.reel.duration,
          postedAt: d.reel.postedAt,
          reelUrl: d.reel.reelUrl,
          ownerUsername: d.reel.ownerUsername,
          contentType: d.reel.contentType ?? null,
          remakeabilityScore: d.reel.remakeabilityScore ?? null,
          suggestedAction: d.reel.suggestedAction ?? null,
          classificationReason: d.reel.classificationReason ?? null,
          classifiedAt: d.reel.classifiedAt ?? null,
        },
        job: {
          id: d.job.id,
          handle: d.job.handle,
          followerCount: d.job.followerCount,
          featuredAccountId: d.job.featuredAccountId,
        },
        transcription: toSavedListTranscriptionSummary(d.transcription),
      }));

      const tiktokItems: ListedSaved[] = tiktok.map((t) => ({
        id: t.id,
        userId: t.userId,
        createdAt: t.createdAt,
        source: "tiktok" as const,
        reelId: null,
        jobId: t.job.id,
        featuredReelId: null,
        tiktokVideoId: t.tiktokVideoId,
        youtubeVideoId: null,
        reel: {
          id: t.video.id,
          shortcode: t.video.awemeId,
          thumbnailUrl: t.video.thumbnailUrl,
          videoUrl: t.video.videoUrl,
          caption: t.video.caption,
          viewCount: t.video.viewCount ?? 0,
          likeCount: t.video.likeCount ?? 0,
          commentCount: t.video.commentCount ?? 0,
          duration: t.video.durationSec,
          postedAt: t.video.postedAt,
          reelUrl: t.video.videoPageUrl,
          ownerUsername: t.video.ownerUsername ?? t.job.handle,
          contentType: null,
          remakeabilityScore: null,
          suggestedAction: null,
          classificationReason: null,
          classifiedAt: null,
        },
        job: {
          id: t.job.id,
          handle: t.job.handle,
          followerCount: t.job.followerCount ?? 0,
          featuredAccountId: null,
        },
        transcription: toSavedListTranscriptionSummary(t.transcription),
      }));

      const youtubeItems: ListedSaved[] = youtube.map((y) => ({
        id: y.id,
        userId: y.userId,
        createdAt: y.createdAt,
        source: "youtube" as const,
        reelId: null,
        jobId: y.job.id,
        featuredReelId: null,
        tiktokVideoId: null,
        youtubeVideoId: y.youtubeVideoId,
        reel: {
          id: y.video.id,
          shortcode: y.video.videoId,
          thumbnailUrl: y.video.thumbnailUrl,
          videoUrl: null,
          caption: y.video.title ?? y.video.description,
          viewCount: y.video.viewCount ?? 0,
          likeCount: y.video.likeCount ?? 0,
          commentCount: y.video.commentCount ?? 0,
          duration: y.video.durationSec,
          postedAt: y.video.postedAt,
          reelUrl: y.video.videoPageUrl,
          ownerUsername: y.video.ownerHandle ?? y.job.handle,
          contentType: null,
          remakeabilityScore: null,
          suggestedAction: null,
          classificationReason: null,
          classifiedAt: null,
        },
        job: {
          id: y.job.id,
          handle: y.job.handle,
          followerCount: y.job.subscriberCount ?? 0,
          featuredAccountId: null,
        },
        transcription: toSavedListTranscriptionSummary(y.transcription),
      }));

      const combined = [
        ...scrapedItems,
        ...featuredItems,
        ...discoverItems,
        ...tiktokItems,
        ...youtubeItems,
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return combined;
    }),
});
