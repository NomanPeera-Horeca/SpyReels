import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createCheckoutSession,
  createPortalSession,
  getUserSubscription,
  getMonthlyUsage,
  checkUsageLimit,
  incrementUsage,
} from "./stripe/stripe-service";
import { PLANS, getPlanLimits } from "./stripe/products";
import type { PlanId, BillingInterval } from "./stripe/products";
import {
  createScrapeJob,
  getScrapeJob,
  updateScrapeJob,
  getUserScrapeJobs,
  insertReels,
  getReelsByJobId,
  getReelById,
  createTranscription,
  getTranscriptionByReelId,
  updateTranscription,
  getTranscriptionsByJobId,
  createRecreatedScript,
  getRecreatedScript,
  updateRecreatedScript,
  getRecreatedScriptsByReelId,
  saveReel,
  unsaveReel,
  getSavedReelsByUser,
  isReelSaved,
  getSavedReelsWithDetails,
  createScriptTag,
  getScriptTagsByUser,
  updateScriptTag,
  deleteScriptTag,
  ensureDefaultTags,
  createSavedScript,
  getSavedScript,
  getSavedScriptsByUser,
  updateSavedScript,
  deleteSavedScript,
  assignTagToScript,
  removeTagFromScript,
  getTagsForScript,
  getScriptsByTag,
  createScriptVersion,
  getScriptVersions,
  getLatestVersionNumber,
  getUserPreferences,
  upsertUserPreferences,
  getPublishedBlogPosts,
  getBlogPostBySlug,
  getAllBlogPosts,
  getBlogPostById,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  createTelegramConnection,
  getTelegramConnectionByUserId,
  updateTelegramConnection,
  deleteTelegramConnection,
  getCollectedReelsByUser,
  getCollectedReelById,
  deleteCollectedReel,
  createCollectedReel,
  getCollectedReelByShortcode,
  updateCollectedReel,
  createScriptIdea,
  getScriptIdeasByUser,
  getScriptIdeaById,
  updateScriptIdea,
  deleteScriptIdea,
  getQueuedScriptIdeas,
  getLibraryTranscripts,
  getLibraryScripts,
  getExistingShortcodes,
  updateScrapeJobResync,
  deleteScrapeJob,
} from "./db";
import { scrapeReels, fetchReelByShortcode, fetchProfile, searchReelsByKeyword, searchReelsByHandle } from "./instagram";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut } from "./storage";
import { monthlyUsage, users, subscriptions, savedScripts, scrapeJobs, collectedReels, niches, featuredAccounts, featuredAccountNiches, featuredReels } from "../drizzle/schema";
import { eq, ne, desc, asc, sql, and } from "drizzle-orm";
import { getDb } from "./db";
import { isGoogleSheetsConfigured, exportToGoogleSheets } from "./googleSheets";
import { isGoogleDocsConfigured, exportToGoogleDocs } from "./googleDocs";
import { getTelegramBotInfo, setupTelegramWebhook } from "./telegramBot";
import crypto from "crypto";

// Transcription queue - cap concurrent transcriptions to prevent memory exhaustion
// and to avoid cascading Instagram CDN rate-limits on batch kickoffs (e.g.
// "Transcribe All" from a single Render IP). Used by search.transcribe AND
// runTranscription (which backs both transcribe.start and collectedReels.transcribe).
let activeTranscriptions = 0;
const MAX_CONCURRENT_TRANSCRIPTIONS = 2;

/**
 * Parse a date string safely to avoid timezone shift.
 * When given a date-only string like "2025-03-10", new Date() creates UTC midnight
 * which can shift back a day in local timezone. This helper appends T12:00:00 to
 * date-only strings to keep the date stable across timezones.
 */
function parseDateSafe(dateStr: string): Date {
  // If it's already a full ISO string (has T), parse as-is
  if (dateStr.includes("T")) return new Date(dateStr);
  // Date-only string: append noon to avoid timezone day-shift
  return new Date(dateStr + "T12:00:00");
}

export const appRouter = router({
  system: systemRouter,

  // ── Billing & Subscription ──
  billing: router({
    subscription: protectedProcedure.query(async ({ ctx }) => {
      const sub = await getUserSubscription(ctx.user.id);
      const limits = getPlanLimits(sub.plan as PlanId);
      const usage = await getMonthlyUsage(ctx.user.id);
      return { ...sub, limits, usage };
    }),

    usage: protectedProcedure.query(async ({ ctx }) => {
      const sub = await getUserSubscription(ctx.user.id);
      const limits = getPlanLimits(sub.plan as PlanId);
      const usage = await getMonthlyUsage(ctx.user.id);
      return { limits, usage, plan: sub.plan };
    }),

    plans: publicProcedure.query(() => {
      return Object.entries(PLANS).map(([id, plan]) => ({
        planId: id,
        ...plan,
      }));
    }),

    checkout: protectedProcedure
      .input(z.object({
        planId: z.enum(["starter", "pro", "business", "agency"]),
        interval: z.enum(["monthly", "yearly"]),
        origin: z.string(),
        referralId: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const url = await createCheckoutSession({
          userId: ctx.user.id,
          email: ctx.user.email || "",
          name: ctx.user.name || "",
          planId: input.planId as PlanId,
          interval: input.interval as BillingInterval,
          origin: input.origin,
          referralId: input.referralId,
        });
        return { url };
      }),

    portal: protectedProcedure
      .input(z.object({ origin: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const url = await createPortalSession(ctx.user.id, input.origin);
        return { url };
      }),

    checkLimit: protectedProcedure
      .input(z.object({
        action: z.enum([
          "scrapeCount", "searchCount", "transcribeCount",
          "recreateCount", "rewriteCount", "exportCount",
          "extensionSortCount", "extensionSaveCount",
          "extensionTranscribeCount", "extensionRecreateCount",
        ]),
      }))
      .query(async ({ ctx, input }) => {
        return checkUsageLimit(ctx.user.id, input.action as any, ctx.user.openId);
      }),

    trackUsage: protectedProcedure
      .input(z.object({
        action: z.enum([
          "scrapeCount", "searchCount", "transcribeCount",
          "recreateCount", "rewriteCount", "exportCount",
          "extensionSortCount", "extensionSaveCount",
          "extensionTranscribeCount", "extensionRecreateCount",
        ]),
      }))
      .mutation(async ({ ctx, input }) => {
        await incrementUsage(ctx.user.id, input.action as any);
        return { success: true };
      }),
  }),

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ── Scrape Jobs ──
  scrape: router({
    start: protectedProcedure
      .input(
        z.object({
          handle: z.string().min(1).max(128),
          timeframeDays: z.number().refine((v) => [30, 90, 180].includes(v)),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Check if handle already exists in monitoring
        const normalizedHandle = input.handle.replace(/^@/, "").trim().toLowerCase();
        const existingJobs = await getUserScrapeJobs(ctx.user.id);
        const existingJob = existingJobs.find(
          (j) => j.handle.toLowerCase() === normalizedHandle && (j.status === "completed" || j.status === "running")
        );
        if (existingJob) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `@${normalizedHandle} is already in your Account Monitoring. Use Re-sync to refresh the data instead.`,
          });
        }

        // Check usage limit before starting
        const usageCheck = await checkUsageLimit(ctx.user.id, "scrapeCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly scrape limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }

        const jobId = await createScrapeJob({
          userId: ctx.user.id,
          handle: input.handle.replace(/^@/, "").trim(),
          timeframeDays: input.timeframeDays,
          status: "running",
          currentStep: "connecting",
        });

        // Track usage
        await incrementUsage(ctx.user.id, "scrapeCount");

        // Run scraping in background
        runScrapeJob(jobId, input.handle, input.timeframeDays).catch((err) => {
          console.error(`Scrape job ${jobId} failed:`, err);
        });

        return { jobId };
      }),

    status: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        return job;
      }),

    /**
     * Lightweight progress poll used by the dedicated scraping UI. Returns
     * just the fields needed for the multi-step view so we can hit this on
     * a 1.5s interval without shipping the full job row every time.
     */
    progress: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        return {
          status: job.status,
          currentStep: job.currentStep,
          reelsFound: job.reelsFound,
          estimatedTotal: job.estimatedTotal,
          progressPercent: job.progressPercent,
          errorMessage: job.errorMessage,
          handle: job.handle,
          timeframeDays: job.timeframeDays,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return getUserScrapeJobs(ctx.user.id);
    }),

    /** Delete a scrape job and its associated reels */
    delete: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteScrapeJob(input.jobId);
        return { success: true };
      }),

    /** Re-sync a completed scrape job — fetches only new reels since last sync */
    resync: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN" });
        if (job.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Job is already running" });

        // Calculate days since last sync (updatedAt) — only fetch reels from that period
        const lastSyncDate = new Date(job.updatedAt);
        const now = new Date();
        const daysSinceSync = Math.max(1, Math.ceil((now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60 * 24)));

        // Mark as running
        await updateScrapeJob(input.jobId, { status: "running" });

        // Run resync in background
        runResyncJob(input.jobId, job.handle, daysSinceSync).catch((err) => {
          console.error(`Resync job ${input.jobId} failed:`, err);
        });

        return { jobId: input.jobId, daysSinceSync };
      }),

    /** Preview an Instagram profile before scraping */
    profilePreview: protectedProcedure
      .input(z.object({ handle: z.string().min(1).max(128) }))
      .query(async ({ input }) => {
        try {
          const profile = await fetchProfile(input.handle);
          // Proxy profile pic through S3 to avoid Instagram CORS/hotlink blocking
          let proxiedPicUrl = "";
          if (profile.profilePicUrl) {
            try {
              const { gotScraping } = await import("got-scraping");
              const picRes = await gotScraping({
                url: profile.profilePicUrl,
                responseType: "buffer",
                timeout: { request: 10000 },
                retry: { limit: 0 },
              });
              if (picRes.statusCode === 200 && picRes.rawBody) {
                const suffix = Math.random().toString(36).slice(2, 8);
                const key = `profile-pics/${profile.username}-${suffix}.jpg`;
                const { url } = await storagePut(key, picRes.rawBody, "image/jpeg");
                proxiedPicUrl = url;
              }
            } catch {
              // If proxy fails, leave empty - UI shows fallback icon
            }
          }
          return {
            found: true as const,
            username: profile.username,
            fullName: profile.fullName,
            biography: profile.biography,
            profilePicUrl: proxiedPicUrl,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
            postCount: profile.postCount,
            isVerified: profile.isVerified,
            isPrivate: profile.isPrivate,
            category: profile.category,
            externalUrl: profile.externalUrl,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Profile not found";
          return {
            found: false as const,
            error: message,
          };
        }
      }),
  }),

  // ── Reels ──
  reels: router({
    list: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input }) => {
        const job = await getScrapeJob(input.jobId);
        const reelsList = await getReelsByJobId(input.jobId);
        const transcriptionsList = await getTranscriptionsByJobId(input.jobId);
        const transcriptionMap = new Map(
          transcriptionsList.map((t) => [t.reelId, t])
        );
        const followerCount = job?.followerCount || 0;

        return {
          followerCount,
          reels: reelsList.map((r) => {
            const engagementRate = followerCount > 0
              ? ((r.likeCount + r.commentCount) / followerCount) * 100
              : 0;
            return {
              ...r,
              engagementRate: Math.round(engagementRate * 100) / 100, // 2 decimal places
              transcription: transcriptionMap.get(r.id) || null,
            };
          }),
        };
      }),
  }),

  // ── Featured Accounts (pre-scraped catalog browsed by niche) ──
  featured: router({
    /**
     * All niches grouped by `groupName`, with a per-niche count of active
     * accounts that have at least one reel stored. Used by the initial
     * "browse by niche" UI — the 5 group cards and their niche subcards.
     * Niches with zero usable accounts are filtered out (they look broken).
     */
    nicheGroups: protectedProcedure.query(async () => {
      const db = await getDb();
      const rows = await db!
        .select({
          id: niches.id,
          slug: niches.slug,
          name: niches.name,
          iconName: niches.iconName,
          description: niches.description,
          groupName: niches.groupName,
          sortOrder: niches.sortOrder,
          // Count distinct active accounts with at least one reel. The
          // LEFT JOIN chain keeps niches with zero matches visible in the
          // raw rows; we filter those out in JS below.
          accountCount: sql<number>`COUNT(DISTINCT ${featuredReels.featuredAccountId})`,
        })
        .from(niches)
        .leftJoin(featuredAccountNiches, eq(featuredAccountNiches.nicheId, niches.id))
        .leftJoin(
          featuredAccounts,
          and(
            eq(featuredAccounts.id, featuredAccountNiches.accountId),
            eq(featuredAccounts.isActive, true)
          )
        )
        .leftJoin(featuredReels, eq(featuredReels.featuredAccountId, featuredAccounts.id))
        .groupBy(
          niches.id,
          niches.slug,
          niches.name,
          niches.iconName,
          niches.description,
          niches.groupName,
          niches.sortOrder
        )
        .orderBy(asc(niches.groupName), asc(niches.sortOrder));

      // Drop empty niches and group by groupName in a single pass.
      const groupMap = new Map<
        string,
        {
          id: number;
          slug: string;
          name: string;
          iconName: string;
          description: string;
          accountCount: number;
        }[]
      >();
      for (const row of rows) {
        const accountCount = Number(row.accountCount);
        if (accountCount <= 0) continue;
        const bucket = groupMap.get(row.groupName) ?? [];
        bucket.push({
          id: row.id,
          slug: row.slug,
          name: row.name,
          iconName: row.iconName,
          description: row.description ?? "",
          accountCount,
        });
        groupMap.set(row.groupName, bucket);
      }

      return {
        groups: Array.from(groupMap, ([groupName, nichesInGroup]) => ({
          groupName,
          niches: nichesInGroup,
        })),
      };
    }),

    /**
     * All active featured accounts tagged with `nicheSlug`, sorted by
     * follower count desc. Accounts with zero stored reels are omitted —
     * clicking them would show an empty state, which isn't the goal.
     */
    accountsByNiche: protectedProcedure
      .input(z.object({ nicheSlug: z.string() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const nicheMatch = await db!
          .select({ id: niches.id })
          .from(niches)
          .where(eq(niches.slug, input.nicheSlug))
          .limit(1);
        if (nicheMatch.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Niche not found" });
        }
        const nicheId = nicheMatch[0].id;

        const rows = await db!
          .select({
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            profilePicUrl: featuredAccounts.profilePicUrl,
            totalReelsEver: featuredAccounts.totalReelsEver,
            reelsAvailable: sql<number>`COUNT(${featuredReels.id})`,
          })
          .from(featuredAccounts)
          .innerJoin(
            featuredAccountNiches,
            eq(featuredAccountNiches.accountId, featuredAccounts.id)
          )
          .leftJoin(
            featuredReels,
            eq(featuredReels.featuredAccountId, featuredAccounts.id)
          )
          .where(
            and(
              eq(featuredAccountNiches.nicheId, nicheId),
              eq(featuredAccounts.isActive, true)
            )
          )
          .groupBy(
            featuredAccounts.id,
            featuredAccounts.handle,
            featuredAccounts.displayName,
            featuredAccounts.followerCount,
            featuredAccounts.avgEngagementRate,
            featuredAccounts.profilePicUrl,
            featuredAccounts.totalReelsEver
          )
          .having(sql`COUNT(${featuredReels.id}) > 0`)
          .orderBy(desc(featuredAccounts.followerCount));

        return rows.map((r) => ({
          id: r.id,
          handle: r.handle,
          displayName: r.displayName ?? "",
          followerCount: r.followerCount,
          // decimal(5,2) comes back from mysql2 as a string — coerce at boundary.
          avgEngagementRate: Number(r.avgEngagementRate),
          profilePicUrl: r.profilePicUrl ?? "",
          totalReelsEver: r.totalReelsEver,
          reelsAvailable: Number(r.reelsAvailable),
        }));
      }),

    /**
     * Pre-ranked top 30 reels for a featured account. `rank` was computed
     * at scrape time (1 = highest engagement rate), so we just read it
     * back in order. This is the "magic moment" — zero-latency reels.
     */
    topReels: protectedProcedure
      .input(z.object({ accountId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await getDb();
        const rows = await db!
          .select()
          .from(featuredReels)
          .where(eq(featuredReels.featuredAccountId, input.accountId))
          // `rank` is a MySQL 8 reserved word, but drizzle auto-backticks
          // identifiers on the query-builder path so this is safe.
          .orderBy(asc(featuredReels.rank))
          .limit(30);

        return rows.map((r) => ({
          id: r.id,
          reelShortcode: r.reelShortcode,
          caption: r.caption,
          viewCount: r.viewCount,
          likeCount: r.likeCount,
          commentCount: r.commentCount,
          // decimal(5,2) → string; null possible on older rows.
          engagementRate: r.engagementRate == null ? 0 : Number(r.engagementRate),
          thumbnailUrl: r.thumbnailUrl ?? "",
          videoUrl: r.videoUrl ?? "",
          duration: r.duration ?? 0,
          postedAt: r.postedAt,
          rank: r.rank ?? 0,
        }));
      }),

    /**
     * Related creators for the dashboard right sidebar ("Top creators in
     * this niche"). Returns other active featured accounts tagged with
     * `nicheSlug`, ordered by follower count desc, optionally excluding
     * the account currently being viewed (so we don't show @garyvee as
     * "related" on @garyvee's own dashboard).
     *
     * Uses INNER JOINs — an account only shows up if it actually has the
     * niche tag. The `nicheName` field comes from `niches.name` for the
     * matched row, which is convenient for the sidebar eyebrow copy.
     *
     * Mirrors `accountsByNiche`'s LEFT JOIN + HAVING guard so we never
     * surface a creator with zero stored reels — clicking them would
     * land on an empty dashboard. `isActive=true` is not a strong enough
     * invariant on its own (a future row could be active without a
     * successful scrape yet).
     */
    relatedCreators: protectedProcedure
      .input(
        z.object({
          nicheSlug: z.string(),
          excludeAccountId: z.number().int().positive().optional(),
          // Cap at 50 so a misconfigured caller can't pull the whole catalog.
          limit: z.number().int().positive().max(50).default(5),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();

        const whereClauses = [
          eq(niches.slug, input.nicheSlug),
          eq(featuredAccounts.isActive, true),
        ];
        if (input.excludeAccountId !== undefined) {
          whereClauses.push(ne(featuredAccounts.id, input.excludeAccountId));
        }

        const rows = await db!
          .select({
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            profilePicUrl: featuredAccounts.profilePicUrl,
            nicheName: niches.name,
          })
          .from(niches)
          .innerJoin(
            featuredAccountNiches,
            eq(featuredAccountNiches.nicheId, niches.id)
          )
          .innerJoin(
            featuredAccounts,
            eq(featuredAccounts.id, featuredAccountNiches.accountId)
          )
          .leftJoin(
            featuredReels,
            eq(featuredReels.featuredAccountId, featuredAccounts.id)
          )
          .where(and(...whereClauses))
          .groupBy(
            featuredAccounts.id,
            featuredAccounts.handle,
            featuredAccounts.displayName,
            featuredAccounts.followerCount,
            featuredAccounts.avgEngagementRate,
            featuredAccounts.profilePicUrl,
            niches.name
          )
          .having(sql`COUNT(${featuredReels.id}) > 0`)
          .orderBy(desc(featuredAccounts.followerCount))
          .limit(input.limit);

        return rows.map((r) => ({
          id: r.id,
          handle: r.handle,
          displayName: r.displayName ?? "",
          followerCount: r.followerCount,
          avgEngagementRate: Number(r.avgEngagementRate),
          profilePicUrl: r.profilePicUrl ?? "",
          nicheName: r.nicheName,
        }));
      }),

    /**
     * Classify an arbitrary Instagram handle into one of the 30 niches
     * using Claude Sonnet. Only called for handles outside the featured
     * catalog — the "AI ✦" niche badge on the dashboard flags this
     * classified-on-the-fly path.
     *
     * Caching design:
     *   - When `scrapeJobId` is provided AND the job belongs to the
     *     caller, we read-through / write-through the cache columns on
     *     the `scrape_jobs` row so the dashboard can re-read without
     *     spending another LLM call on every page load.
     *   - Without a job id we just classify and return — useful for
     *     ad-hoc callers (admin tools, batch scripts).
     *
     * Note on input shape: the spec (§1.2) lists only `{handle, bio,
     * captions}`. Adding the optional `scrapeJobId` is the cleanest way
     * to satisfy the "cache on the job row" directive from the same
     * section without introducing a second mutation. Clients that don't
     * need caching can simply omit it.
     *
     * Mutation (not query) because (a) it writes cache state and (b)
     * the LLM call has real billing side effects — tRPC conventionally
     * treats queries as idempotent/cacheable, which this isn't.
     */
    classifyHandle: protectedProcedure
      .input(
        z.object({
          handle: z.string().trim().min(1),
          bio: z.string().optional(),
          // Cap at 5 captions per spec; the helper below also trims
          // each one so a pathological caller can't blow the prompt.
          captions: z.array(z.string()).max(5).optional(),
          scrapeJobId: z.number().int().positive().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();

        // 1) If caller provided a job id, authorize and check the cache.
        type ScrapeJobRow = typeof scrapeJobs.$inferSelect;
        let cacheableJob: ScrapeJobRow | undefined;
        if (input.scrapeJobId !== undefined) {
          const found = await db!
            .select()
            .from(scrapeJobs)
            .where(
              and(
                eq(scrapeJobs.id, input.scrapeJobId),
                eq(scrapeJobs.userId, ctx.user.id)
              )
            )
            .limit(1);
          if (found.length === 0) {
            // NOT_FOUND (not FORBIDDEN) to avoid leaking existence of
            // other users' jobs.
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Scrape job not found",
            });
          }
          cacheableJob = found[0];

          // Cache hit — skip the LLM call entirely.
          if (
            cacheableJob.classifiedNicheSlug &&
            cacheableJob.classifiedConfidence
          ) {
            const nicheRow = await db!
              .select({ name: niches.name })
              .from(niches)
              .where(eq(niches.slug, cacheableJob.classifiedNicheSlug))
              .limit(1);
            if (nicheRow.length > 0) {
              return {
                nicheSlug: cacheableJob.classifiedNicheSlug,
                nicheName: nicheRow[0].name,
                confidence: cacheableJob.classifiedConfidence,
              };
            }
            // Cache has a stale slug (niche renamed/deleted). Fall
            // through and re-classify rather than 500.
          }
        }

        // 2) Pull the full niche list for both prompt and validation.
        const allNiches = await db!
          .select({ slug: niches.slug, name: niches.name })
          .from(niches)
          .orderBy(asc(niches.sortOrder));
        if (allNiches.length === 0) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "No niches configured",
          });
        }

        // 3) Build the prompt. Caption text is flattened + length-capped
        //    to bound the prompt and keep the model on-task.
        const nicheList = allNiches
          .map((n) => `- ${n.slug}: ${n.name}`)
          .join("\n");
        const captionLines = (input.captions ?? [])
          .slice(0, 5)
          .map((c) => `- ${c.replace(/\s+/g, " ").slice(0, 400)}`)
          .join("\n");

        const prompt = `You are classifying an Instagram creator into one of 30 niches for a content analytics tool.

Creator handle: @${input.handle}
Bio: ${input.bio?.trim() ? input.bio.trim() : "(none)"}
Recent reel captions:
${captionLines || "(none)"}

Available niches (slug: name):
${nicheList}

Return JSON only:
{
  "nicheSlug": "<one slug from the list>",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<one sentence>"
}`;

        // 4) Call Claude Sonnet via the existing invokeLLM wrapper.
        //    json_object mode (not json_schema) keeps things simple;
        //    we validate the slug against the DB below anyway.
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content:
                "You classify Instagram creators into niches. Respond with valid JSON only — no prose, no markdown, no code fences.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        });

        const raw = String(
          response.choices[0]?.message?.content ?? ""
        ).trim();
        let parsed: { nicheSlug?: unknown; confidence?: unknown };
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Classifier returned non-JSON output",
          });
        }

        // 5) Validate slug — the model can hallucinate niches that
        //    aren't in our list. Also coerce confidence to the enum.
        const nicheMatch = allNiches.find(
          (n) => typeof parsed.nicheSlug === "string" && n.slug === parsed.nicheSlug
        );
        if (!nicheMatch) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `Classifier returned unknown niche slug: ${String(parsed.nicheSlug)}`,
          });
        }
        const confidence: "high" | "medium" | "low" =
          parsed.confidence === "high" ||
          parsed.confidence === "medium" ||
          parsed.confidence === "low"
            ? parsed.confidence
            : "low";

        // 6) Write-through the cache if we authorized a job row.
        if (cacheableJob) {
          await updateScrapeJob(cacheableJob.id, {
            classifiedNicheSlug: nicheMatch.slug,
            classifiedConfidence: confidence,
            classifiedAt: new Date(),
          });
        }

        return {
          nicheSlug: nicheMatch.slug,
          nicheName: nicheMatch.name,
          confidence,
        };
      }),
  }),

  // ── Transcription ──
  transcribe: router({
    start: protectedProcedure
      .input(z.object({ reelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const reel = await getReelById(input.reelId);
        if (!reel) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Reel not found" });
        }

        const existing = await getTranscriptionByReelId(input.reelId);
        if (existing && existing.status === "completed") {
          return { transcriptionId: existing.id, status: "completed" as const };
        }
        if (existing && existing.status === "processing") {
          return { transcriptionId: existing.id, status: "processing" as const };
        }

        // Check usage limit before starting new transcription
        const usageCheck = await checkUsageLimit(ctx.user.id, "transcribeCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        // If previously failed, delete and retry
        if (existing && existing.status === "failed") {
          const { getDb } = await import("./db");
          const db = await getDb();
          if (db) {
            const { transcriptions: transcriptionsTable } = await import("../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db.delete(transcriptionsTable).where(eq(transcriptionsTable.id, existing.id));
          }
        }

        const transcriptionId = await createTranscription({
          reelId: input.reelId,
          status: "processing",
        });

        // Track usage
        await incrementUsage(ctx.user.id, "transcribeCount");

        runTranscription(transcriptionId, reel).catch((err) => {
          console.error(`Transcription ${transcriptionId} failed:`, err);
        });

        return { transcriptionId, status: "processing" as const };
      }),

    status: protectedProcedure
      .input(z.object({ reelId: z.number() }))
      .query(async ({ input }) => {
        const transcription = await getTranscriptionByReelId(input.reelId);
        return transcription || null;
      }),
  }),

  // ── Export ──
  export: router({
    /** Check if Google Sheets is configured */
    sheetsAvailable: protectedProcedure.query(() => {
      return { available: isGoogleSheetsConfigured() };
    }),

    /** Generate CSV data for download */
    csv: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "exportCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your export limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "exportCount");
        const { csvContent, filename } = await buildExportData(input.jobId);
        return { csv: csvContent, filename };
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

        const reelsList = await getReelsByJobId(input.jobId);
        const transcriptionsList = await getTranscriptionsByJobId(input.jobId);
        const transcriptionMap = new Map(
          transcriptionsList.map((t) => [t.reelId, t])
        );
        const job = await getScrapeJob(input.jobId);

        const followerCount = job?.followerCount || 0;

        const rows = reelsList.map((r) => {
          const t = transcriptionMap.get(r.id);
          const engagementRate = followerCount > 0
            ? ((r.likeCount + r.commentCount) / followerCount) * 100
            : 0;
          return {
            reelUrl: r.reelUrl,
            shortcode: r.shortcode,
            caption: r.caption || "",
            viewCount: r.viewCount,
            likeCount: r.likeCount,
            commentCount: r.commentCount,
            engagementRate: Math.round(engagementRate * 100) / 100,
            duration: r.duration || 0,
            postedAt: r.postedAt ? new Date(r.postedAt).toISOString() : "",
            thumbnailUrl: r.thumbnailUrl || "",
            transcript: t?.transcript || "",
            hookAnalysis: t?.hookAnalysis || "",
          };
        });

        const title = `Reels - @${job?.handle || "export"} - ${new Date().toLocaleDateString()}`;

        const result = await exportToGoogleSheets(title, rows, input.email);

        return {
          spreadsheetUrl: result.spreadsheetUrl,
          spreadsheetId: result.spreadsheetId,
        };
      }),
  }),

  // ── Re-Create Script ──
  recreate: router({
    /** Start script re-creation: analyze viral structure + generate new script */
    generate: protectedProcedure
      .input(
        z.object({
          reelId: z.number(),
          topic: z.string().max(2000).optional().default(""),
          gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6", "7", "8"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const reel = await getReelById(input.reelId);
        if (!reel) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Reel not found" });
        }

        const transcription = await getTranscriptionByReelId(input.reelId);
        if (!transcription || transcription.status !== "completed" || !transcription.transcript) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Reel must be transcribed first before re-creating a script.",
          });
        }

        // Check usage limit before generating
        const usageCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly AI re-creation limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }

        // If no topic provided, use "same topic" mode
        const effectiveTopic = input.topic.trim() || "SAME_TOPIC";

        // Track usage
        await incrementUsage(ctx.user.id, "recreateCount");

        const scriptId = await createRecreatedScript({
          reelId: input.reelId,
          userId: ctx.user.id,
          topic: effectiveTopic,
          gradeLevel: input.gradeLevel,
          status: "processing",
        });

        // Run generation in background
        runScriptGeneration(scriptId, transcription.transcript, transcription.segments, reel.caption || "", effectiveTopic, input.gradeLevel).catch((err: unknown) => {
          console.error(`Script generation ${scriptId} failed:`, err);
        });

        return { scriptId, status: "processing" as const };
      }),

    /** Rewrite an existing script with new grade level, target duration, and delivery cues */
    rewrite: protectedProcedure
      .input(
        z.object({
          scriptId: z.number(),
          gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6", "7", "8"]),
          targetDuration: z.enum(["any", "15", "30", "45", "60", "90"]),
          addCues: z.boolean().default(true),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const existingScript = await getRecreatedScript(input.scriptId);
        if (!existingScript) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
        }
        if (!existingScript.generatedScript) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Script has no content to rewrite" });
        }

        // Check usage limit before rewriting
        const usageCheck = await checkUsageLimit(ctx.user.id, "rewriteCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your rewrite limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "rewriteCount");

        // Get the original reel for context
        const reel = existingScript.reelId ? await getReelById(existingScript.reelId) : null;
        const transcription = existingScript.reelId ? await getTranscriptionByReelId(existingScript.reelId) : null;

        // Create a new script entry for the rewrite
        const newScriptId = await createRecreatedScript({
          reelId: existingScript.reelId!,
          userId: ctx.user.id,
          topic: existingScript.topic || "SAME_TOPIC",
          gradeLevel: input.gradeLevel,
          status: "processing",
        });

        // Run rewrite in background
        runScriptRewrite(
          newScriptId,
          existingScript.generatedScript,
          existingScript.viralStructure as Record<string, unknown> | null,
          transcription?.transcript || "",
          reel?.caption || "",
          input.gradeLevel,
          input.targetDuration,
          input.addCues
        ).catch((err: unknown) => {
          console.error(`Script rewrite ${newScriptId} failed:`, err);
        });

        return { scriptId: newScriptId, status: "processing" as const };
      }),

    /** Get status of a specific recreated script */
    status: protectedProcedure
      .input(z.object({ scriptId: z.number() }))
      .query(async ({ input }) => {
        const script = await getRecreatedScript(input.scriptId);
        if (!script) throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
        return script;
      }),

    /** List all recreated scripts for a reel */
    list: protectedProcedure
      .input(z.object({ reelId: z.number() }))
      .query(async ({ input }) => {
        return getRecreatedScriptsByReelId(input.reelId);
      }),
  }),

  // ── Saved Reels ──
  saved: router({
    /** Toggle save/unsave a reel */
    toggle: protectedProcedure
      .input(z.object({ reelId: z.number(), jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const alreadySaved = await isReelSaved(ctx.user.id, input.reelId);
        if (alreadySaved) {
          await unsaveReel(ctx.user.id, input.reelId);
          return { saved: false } as const;
        } else {
          await saveReel({ userId: ctx.user.id, reelId: input.reelId, jobId: input.jobId });
          return { saved: true } as const;
        }
      }),

    /** Check if a reel is saved */
    check: protectedProcedure
      .input(z.object({ reelId: z.number() }))
      .query(async ({ ctx, input }) => {
        const saved = await isReelSaved(ctx.user.id, input.reelId);
        return { saved };
      }),

    /** Check which reels from a list are saved */
    checkBatch: protectedProcedure
      .input(z.object({ reelIds: z.array(z.number()) }))
      .query(async ({ ctx, input }) => {
        const savedMap: Record<number, boolean> = {};
        for (const reelId of input.reelIds) {
          savedMap[reelId] = await isReelSaved(ctx.user.id, reelId);
        }
        return savedMap;
      }),

    /** List all saved reels with full details */
    list: protectedProcedure.query(async ({ ctx }) => {
      return getSavedReelsWithDetails(ctx.user.id);
    }),
  }),

  // ── Script Library ──
  scripts: router({
    /** Save a script to the library */
    save: protectedProcedure
      .input(z.object({
        reelId: z.number().optional(),
        recreatedScriptId: z.number().optional(),
        title: z.string().min(1),
        content: z.string().min(1),
        sourceHandle: z.string().optional(),
        gradeLevel: z.string().optional(),
        postDate: z.string().optional(), // ISO date string
        postTime: z.string().optional(), // HH:MM format
        notes: z.string().optional(),
        tagIds: z.array(z.number()).optional(),
        status: z.enum(["draft", "approved"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await ensureDefaultTags(ctx.user.id);
        const wordCount = input.content.trim().split(/\s+/).length;
        const scriptId = await createSavedScript({
          userId: ctx.user.id,
          reelId: input.reelId ?? null,
          recreatedScriptId: input.recreatedScriptId ?? null,
          title: input.title,
          content: input.content,
          originalContent: input.content,
          sourceHandle: input.sourceHandle ?? null,
          gradeLevel: input.gradeLevel ?? null,
          wordCount,
          postDate: input.postDate ? parseDateSafe(input.postDate) : null,
          postTime: input.postTime ?? null,
          notes: input.notes ?? null,
          status: input.status ?? "draft",
        });
        // Create initial version
        await createScriptVersion({
          scriptId,
          content: input.content,
          versionNumber: 1,
          changeType: "initial",
          changeDescription: "Initial script saved",
        });
        // Assign tags
        if (input.tagIds && input.tagIds.length > 0) {
          for (const tagId of input.tagIds) {
            await assignTagToScript(scriptId, tagId);
          }
        }
        return { id: scriptId };
      }),

    /** Get a single script with tags and versions */
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const script = await getSavedScript(input.id);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
        }
        const tags = await getTagsForScript(input.id);
        const versions = await getScriptVersions(input.id);
        return { ...script, tags, versions };
      }),

    /** List all scripts for the user */
    list: protectedProcedure
      .input(z.object({
        tagId: z.number().optional(),
        status: z.enum(["draft", "approved"]).optional(),
      }).optional())
      .query(async ({ ctx, input }) => {
        await ensureDefaultTags(ctx.user.id);
        let scripts: Awaited<ReturnType<typeof getSavedScriptsByUser>>;
        if (input?.tagId) {
          scripts = await getScriptsByTag(ctx.user.id, input.tagId);
        } else {
          scripts = await getSavedScriptsByUser(ctx.user.id);
        }
        if (input?.status) {
          scripts = scripts.filter(s => s.status === input.status);
        }
        // Attach tags to each script
        const result = await Promise.all(scripts.map(async (s) => {
          const tags = await getTagsForScript(s.id);
          return { ...s, tags };
        }));
        return result;
      }),

    /** Update a script (content, title, postDate, notes, status) */
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        postDate: z.string().nullable().optional(),
        postTime: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(["draft", "approved"]).optional(),
        gradeLevel: z.string().optional(),
        generatedCaption: z.string().nullable().optional(),
        generatedHashtags: z.string().nullable().optional(),
        captionStyle: z.string().nullable().optional(),
        changeType: z.enum(["manual_edit", "ai_rewrite", "grammar_fix"]).optional(),
        changeDescription: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.id);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
        }
        const updateData: Parameters<typeof updateSavedScript>[1] = {};
        if (input.title !== undefined) updateData.title = input.title;
        if (input.postDate !== undefined) updateData.postDate = input.postDate ? parseDateSafe(input.postDate) : null;
        if (input.postTime !== undefined) updateData.postTime = input.postTime;
        if (input.notes !== undefined) updateData.notes = input.notes;
        if (input.status !== undefined) updateData.status = input.status;
        if (input.gradeLevel !== undefined) updateData.gradeLevel = input.gradeLevel;
        if (input.generatedCaption !== undefined) (updateData as any).generatedCaption = input.generatedCaption;
        if (input.generatedHashtags !== undefined) (updateData as any).generatedHashtags = input.generatedHashtags;
        if (input.captionStyle !== undefined) (updateData as any).captionStyle = input.captionStyle;
        if (input.content !== undefined) {
          updateData.content = input.content;
          updateData.wordCount = input.content.trim().split(/\s+/).length;
          // Create a new version
          const versionNum = await getLatestVersionNumber(input.id);
          await createScriptVersion({
            scriptId: input.id,
            content: input.content,
            versionNumber: versionNum + 1,
            changeType: input.changeType || "manual_edit",
            changeDescription: input.changeDescription || "Manual edit",
          });
        }
        await updateSavedScript(input.id, updateData);
        return { success: true };
      }),

    /** Delete a script */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.id);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Script not found" });
        }
        await deleteSavedScript(input.id);
        return { success: true };
      }),

    /** Assign/remove tags */
    assignTag: protectedProcedure
      .input(z.object({ scriptId: z.number(), tagId: z.number() }))
      .mutation(async ({ input }) => {
        await assignTagToScript(input.scriptId, input.tagId);
        return { success: true };
      }),

    removeTag: protectedProcedure
      .input(z.object({ scriptId: z.number(), tagId: z.number() }))
      .mutation(async ({ input }) => {
        await removeTagFromScript(input.scriptId, input.tagId);
        return { success: true };
      }),

    /** AI Grammar Check - fix spelling, grammar, sentence structure */
    grammarCheck: protectedProcedure
      .input(z.object({ scriptId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a professional editor and grammar checker. Fix spelling mistakes, grammar errors, and improve sentence structure while keeping the original meaning, tone, and style intact. Do NOT change the content or add new ideas. Return ONLY the corrected text, nothing else."
            },
            { role: "user", content: input.content }
          ],
        });
        const corrected = (response.choices[0]?.message?.content as string) || input.content;
        // Save the corrected version
        const wordCount = corrected.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: corrected,
          versionNumber: versionNum + 1,
          changeType: "grammar_fix",
          changeDescription: "AI grammar and spelling correction",
        });
        await updateSavedScript(input.scriptId, { content: corrected, wordCount });
        return { content: corrected };
      }),

    /** AI Rewrite - rewrite the script with AI while keeping the same structure */
    aiRewrite: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        instruction: z.string().optional(), // optional custom instruction
      }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const instruction = input.instruction || "Rewrite this script to sound more natural and engaging while keeping the exact same structure, topic, and key points. Make it sound like a confident creator speaking to camera.";
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a professional script rewriter for short-form video content. ${instruction} Return ONLY the rewritten script text, nothing else.`
            },
            { role: "user", content: input.content }
          ],
        });
        const rewritten = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = rewritten.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: rewritten,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: input.instruction || "AI rewrite for natural delivery",
        });
        await updateSavedScript(input.scriptId, { content: rewritten, wordCount });
        return { content: rewritten };
      }),

    /** Phrase Swapper - swap key phrases with creative alternatives */
    phraseSwap: protectedProcedure
      .input(z.object({ scriptId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a creative copywriter for short-form video scripts. Your job is to swap key phrases, power words, and expressions with fresh, punchy alternatives that sound more engaging and viral. Keep the same meaning, structure, and flow. Swap at least 5-8 phrases throughout the script. Do NOT add new sentences or change the topic. Return ONLY the updated script text, nothing else."
            },
            { role: "user", content: input.content }
          ],
        });
        const swapped = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = swapped.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: swapped,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: "AI phrase swap - refreshed key phrases",
        });
        await updateSavedScript(input.scriptId, { content: swapped, wordCount });
        return { content: swapped };
      }),

    /** Simplifier - make script more conversational and easy to understand */
    simplify: protectedProcedure
      .input(z.object({ scriptId: z.number(), content: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a script simplifier for short-form video content. Rewrite this script using simpler, everyday language that anyone can understand. Use short sentences. Replace jargon with plain words. Make it sound like you're talking to a friend. Keep the same structure, key points, and hook. Return ONLY the simplified script text, nothing else."
            },
            { role: "user", content: input.content }
          ],
        });
        const simplified = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = simplified.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: simplified,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: "AI simplification - made more conversational",
        });
        await updateSavedScript(input.scriptId, { content: simplified, wordCount });
        return { content: simplified };
      }),

    /** Grade Level - rewrite at a specific tone/level */
    adjustTone: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        tone: z.enum(["casual", "professional", "academic", "gen_z", "storyteller"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const tonePrompts: Record<string, string> = {
          casual: "Rewrite in a super casual, friendly tone — like texting a buddy. Use contractions, slang, and keep it real. Short punchy sentences.",
          professional: "Rewrite in a polished, professional tone suitable for a business audience. Clear, confident, and authoritative. No slang.",
          academic: "Rewrite in an educational, informative tone. Use precise language, cite-worthy phrasing, and structured arguments. Sound like a TED talk.",
          gen_z: "Rewrite in Gen Z internet speak — use trending phrases, be relatable, add energy. Think TikTok creator vibes. Keep it short and punchy with attitude.",
          storyteller: "Rewrite as a compelling story. Add narrative hooks, build tension, use vivid descriptions. Make the viewer feel like they're watching a mini-movie.",
        };
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a script tone adjuster for short-form video content. ${tonePrompts[input.tone]} Keep the same key points and structure. Return ONLY the rewritten script text, nothing else.`
            },
            { role: "user", content: input.content }
          ],
        });
        const adjusted = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = adjusted.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: adjusted,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Tone adjusted to ${input.tone}`,
        });
        await updateSavedScript(input.scriptId, { content: adjusted, wordCount });
        return { content: adjusted };
      }),

    /** Make Shorter - condense script to fit a target duration */
    makeShorter: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        targetSeconds: z.number().min(15).max(120),
      }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        // Average speaking rate: ~3 words per second
        const targetWords = Math.round(input.targetSeconds * 3);
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a script editor specializing in short-form video content. Condense this script to approximately ${targetWords} words (about ${input.targetSeconds} seconds when spoken). Keep the hook, the core message, and the call-to-action. Cut filler, redundant points, and unnecessary details. Make every word count. Return ONLY the shortened script text, nothing else.`
            },
            { role: "user", content: input.content }
          ],
        });
        const shortened = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = shortened.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: shortened,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Shortened to ~${input.targetSeconds}s (${targetWords} words target)`,
        });
        await updateSavedScript(input.scriptId, { content: shortened, wordCount });
        return { content: shortened };
      }),

    /** Rewrite Selected Lines - rewrite only the highlighted portion */
    rewriteSelection: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        fullContent: z.string(),
        selectedText: z.string(),
        instruction: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const instruction = input.instruction || "Make it more engaging and punchy";
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a script editor for short-form video content. The user has selected a specific portion of their script to rewrite. Rewrite ONLY the selected text according to the instruction: "${instruction}". Keep the same approximate length. Return ONLY the rewritten selected text, nothing else — do NOT return the full script.`
            },
            {
              role: "user",
              content: `Full script for context:\n---\n${input.fullContent}\n---\n\nSelected text to rewrite:\n"${input.selectedText}"`
            }
          ],
        });
        const rewrittenSelection = (response.choices[0]?.message?.content as string) || input.selectedText;
        // Replace the selected text in the full content
        const newContent = input.fullContent.replace(input.selectedText, rewrittenSelection);
        const wordCount = newContent.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: newContent,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Rewrite selection: "${instruction}"`,
        });
        await updateSavedScript(input.scriptId, { content: newContent, wordCount });
        return { content: newContent, rewrittenPart: rewrittenSelection };
      }),

    /** Rewrite with Angle - rewrite the entire script with a specific angle/idea */
    rewriteWithAngle: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string(),
        angle: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are a creative script writer for short-form video content. Rewrite this script with a completely new angle/perspective: "${input.angle}". Keep the same core topic but approach it from this new angle. Maintain a similar length and the hook-body-CTA structure. Make it feel fresh and original. Return ONLY the rewritten script text, nothing else.`
            },
            { role: "user", content: input.content }
          ],
        });
        const rewritten = (response.choices[0]?.message?.content as string) || input.content;
        const wordCount = rewritten.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: rewritten,
          versionNumber: versionNum + 1,
          changeType: "ai_rewrite",
          changeDescription: `Rewritten with angle: "${input.angle}"`,
        });
        await updateSavedScript(input.scriptId, { content: rewritten, wordCount });
        return { content: rewritten };
      }),

    /** Generate an SEO-optimized Instagram caption with 5 strategic hashtags */
    generateCaption: protectedProcedure
      .input(z.object({
        scriptId: z.number(),
        content: z.string().min(1),
        style: z.enum(["storytelling", "question", "cta", "educational", "curiosity", "bold", "relatable"]).default("educational"),
        captionLength: z.enum(["auto", "short", "medium", "long"]).default("auto"),
        niche: z.string().optional(),
        brandHashtag: z.string().optional(),
        targetAudience: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const styleGuides: Record<string, string> = {
          storytelling: "Write as a personal narrative. Start with a relatable moment or struggle, build tension, then deliver a lesson. Use first person. Make the reader feel like they're hearing from a friend.",
          question: "Open with a thought-provoking question that stops the scroll. Follow with 2-3 lines that challenge assumptions. End with another question or a bold statement that invites comments.",
          cta: "Lead with a bold command or urgent statement. Deliver one clear benefit. End with a specific, actionable CTA using the A+B formula: Specific Interaction (A) + Benefit of Interacting (B). Examples: 'Save this post (A) and level-up your captions (B)', 'Comment your question (A) and I will answer them for you (B)'.",
          educational: "Start with a hook that promises value. Deliver 2-3 concise tips or insights that ADD VALUE beyond what the video shows. End with a CTA using the A+B formula.",
          curiosity: "Tease without revealing everything. Use phrases like 'This changed everything', 'I wish I knew this sooner', 'The real reason why...'. Create an open loop that makes them watch the full video.",
          bold: "Make a controversial or contrarian statement that challenges popular belief. Back it up with one strong argument. End with 'Agree or disagree?' or similar debate-starter.",
          relatable: "Use humor, sarcasm, or 'it me' energy. Reference common struggles or wins in the niche. Keep it short, punchy, and shareable. Think meme-caption energy.",
        };

        // Determine caption length based on script word count or user preference
        const scriptWordCount = input.content.trim().split(/\s+/).length;
        let lengthInstruction: string;
        if (input.captionLength === "auto") {
          // Shorter captions for longer scripts, longer captions for shorter scripts
          if (scriptWordCount > 200) {
            lengthInstruction = "SHORT caption (5-7 lines / 40-70 words). The video is long, so keep the caption concise and punchy.";
          } else if (scriptWordCount > 100) {
            lengthInstruction = "MEDIUM caption (8-12 lines / 70-120 words). Balanced length for a medium-length video.";
          } else {
            lengthInstruction = "LONG caption (13+ lines / 120-200 words). The video is short, so the caption should provide substantial extra value and context.";
          }
        } else if (input.captionLength === "short") {
          lengthInstruction = "SHORT caption (5-7 lines / 40-70 words). Keep it tight and punchy. Every word must earn its place.";
        } else if (input.captionLength === "medium") {
          lengthInstruction = "MEDIUM caption (8-12 lines / 70-120 words). Balanced — enough value without overwhelming.";
        } else {
          lengthInstruction = "LONG caption (13+ lines / 120-200 words). Go deep — provide extra value, context, and keywords for SEO.";
        }

        const nicheContext = input.niche ? `The creator's niche is: ${input.niche}.` : "";
        const audienceContext = input.targetAudience ? `Target audience: ${input.targetAudience}.` : "";
        const brandTag = input.brandHashtag ? `The brand hashtag to include is: ${input.brandHashtag}.` : "Do NOT include a brand hashtag.";

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert Instagram caption writer and SEO strategist specializing in Reels. You follow the proven 6-step caption framework used by top creators.

=== THE 3-PART CAPTION STRUCTURE ===
Every caption MUST have exactly 3 parts:

1. THE HOOK (first line, before "...more")
   - MUST be exactly 7-10 words — no more, no less
   - This is the only line visible before users tap "more"
   - Must contain the primary SEO keyword
   - Use one of these proven hook templates:
     * "X [niche] tips I wish I knew earlier"
     * "Steal this blueprint for [dream outcome]"
     * "Stop doing these X mistakes, instead..."
     * "X weird tips most people don't know about [niche]"
     * "Here's the reality about [niche] most people don't know about"
     * "This [thing] changed everything for my [result]"
     * "Nobody talks about this [niche] secret"
     * Or create a similarly compelling 7-10 word hook

2. THE BODY (5-15 lines depending on length setting)
   - Provide EXTRA VALUE beyond what the video shows — don't just summarize the video
   - Give context as to WHY people should care about this post
   - Use proper formatting: emojis + line breaks for readability
   - AVOID long paragraphs, especially at the beginning
   - Repeat the primary keyword 2-3 times naturally throughout
   - Include secondary keywords for SEO
   - Each line should be short and scannable

3. THE CTA (last 1-2 lines)
   - Use the A+B formula: Specific Interaction (A) + Benefit of Interacting (B)
   - Examples:
     * "Save this post (A) and level-up your captions (B)"
     * "Comment your question (A) and I'll answer them for you (B)"
     * "Share this with a creator (A) who needs to hear this (B)"
   - Add a blank line/space AFTER the CTA and BEFORE the hashtags

=== FORMATTING RULES ===
- Use emojis sparingly but strategically (1-3 per caption, not every line)
- Use line breaks between every 1-2 sentences
- NO long paragraphs, especially at the start
- Add blank line between hook and body, and between body and CTA
- The caption must provide ADDITIONAL VALUE to the audience and the algorithm — not just repeat what's in the video

=== CAPTION LENGTH ===
${lengthInstruction}

=== CAPTION STYLE ===
${styleGuides[input.style]}

=== HASHTAG FRAMEWORK — 3x3 STRATEGY (exactly 5) ===
Use the proven 3x3 hashtag strategy adapted for Instagram's 5-hashtag limit:

1-2. VIDEO TOPIC (2 hashtags) — What is this content about?
   - Specific to the video's subject matter (not generic like #marketing)
   - Example for a fitness video: #weightlifting, #homeworkout

3-4. TARGET AUDIENCE (2 hashtags) — Who should see this?
   - Describe the ideal viewer's identity or situation
   - Example: #busydad, #businessowner

5. DREAM RESULT (1 hashtag) — What outcome does the viewer want?
   - The transformation or goal the audience is chasing
   - Example: #losefat, #growoninstagram, #makemoneyonline
   ${input.brandHashtag ? "- Replace one Video Topic hashtag with the brand hashtag: " + input.brandHashtag : ""}

${nicheContext}
${audienceContext}
${brandTag}

RESPOND IN THIS EXACT JSON FORMAT:
{
  "caption": "The full caption text with line breaks as \\n",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3", "hashtag4", "hashtag5"],
  "primaryKeyword": "the main keyword used for SEO",
  "hookType": "the type of hook used"
}

Do NOT include # in the hashtags array — just the word/phrase.
Do NOT put hashtags inside the caption text — they go separately.
The hook MUST be 7-10 words. Count them.`
            },
            {
              role: "user",
              content: `Generate an Instagram caption for this Reel script (${scriptWordCount} words):\n\n${input.content}`
            }
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "caption_result",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  caption: { type: "string", description: "The full caption text" },
                  hashtags: { type: "array", items: { type: "string" }, description: "Exactly 5 hashtags without # prefix" },
                  primaryKeyword: { type: "string", description: "The main SEO keyword" },
                  hookType: { type: "string", description: "The hook type used" }
                },
                required: ["caption", "hashtags", "primaryKeyword", "hookType"],
                additionalProperties: false
              }
            }
          }
        });

        const raw = ((response.choices[0]?.message?.content as string) || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        let result: { caption: string; hashtags: string[]; primaryKeyword: string; hookType: string };
        try {
          result = JSON.parse(raw);
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to parse caption response" });
        }

        // Ensure exactly 5 hashtags
        const hashtags = result.hashtags.slice(0, 5).map(h => h.replace(/^#/, ""));

        // Save to the script record
        await updateSavedScript(input.scriptId, {
          generatedCaption: result.caption,
          generatedHashtags: JSON.stringify(hashtags),
          captionStyle: input.style,
        } as any);

        return {
          caption: result.caption,
          hashtags,
          primaryKeyword: result.primaryKeyword,
          hookType: result.hookType,
          style: input.style,
        };
      }),

    /** Get version history for a script */
    versions: protectedProcedure
      .input(z.object({ scriptId: z.number() }))
      .query(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        return getScriptVersions(input.scriptId);
      }),

    /** Restore a specific version */
    restoreVersion: protectedProcedure
      .input(z.object({ scriptId: z.number(), versionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const script = await getSavedScript(input.scriptId);
        if (!script || script.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const versions = await getScriptVersions(input.scriptId);
        const version = versions.find(v => v.id === input.versionId);
        if (!version) throw new TRPCError({ code: "NOT_FOUND", message: "Version not found" });
        const wordCount = version.content.trim().split(/\s+/).length;
        const versionNum = await getLatestVersionNumber(input.scriptId);
        await createScriptVersion({
          scriptId: input.scriptId,
          content: version.content,
          versionNumber: versionNum + 1,
          changeType: "manual_edit",
          changeDescription: `Restored from version ${version.versionNumber}`,
        });
        await updateSavedScript(input.scriptId, { content: version.content, wordCount });
        return { content: version.content };
      }),
  }),

  // ── Search Reels ──
  search: router({
    /** Search reels by keyword using Instagram's tag/keyword search API (matches Instagram explore results) */
    byKeyword: protectedProcedure
      .input(z.object({
        keyword: z.string().min(1).max(256),
        maxResults: z.number().min(1).max(100).optional().default(50),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "searchCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your search limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "searchCount");
        try {
          // Use Instagram's actual tag sections API to search reels by keyword
          // This matches what Instagram's explore page shows for the same keyword
          const reels = await searchReelsByKeyword(input.keyword, input.maxResults);

          return {
            reels,
            searchType: "keyword" as const,
            query: input.keyword,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Search failed";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    /** Search reels by handle (fetch creator's reels) */
    byHandle: protectedProcedure
      .input(z.object({
        handle: z.string().min(1).max(128),
        maxResults: z.number().min(1).max(100).optional().default(50),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "searchCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your search limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "searchCount");
        try {
          const { reels, profile } = await searchReelsByHandle(input.handle, input.maxResults);
          return { reels, searchType: "handle" as const, query: input.handle, profile };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Search failed";
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
      }),

    /** Transcribe a search result reel (not saved in DB yet) */
    transcribe: protectedProcedure
      .input(z.object({
        shortcode: z.string().min(1),
        videoUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const transcribeCheck = await checkUsageLimit(ctx.user.id, "transcribeCount", ctx.user.openId);
        if (!transcribeCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly transcription limit (${transcribeCheck.used}/${transcribeCheck.limit}). Upgrade to ${transcribeCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "transcribeCount");
        while (activeTranscriptions >= MAX_CONCURRENT_TRANSCRIPTIONS) {
          await new Promise(r => setTimeout(r, 2000));
        }
        activeTranscriptions++;
        try {
        // Always fetch fresh URL to avoid expired Instagram video URLs
        const freshData = await fetchReelByShortcode(input.shortcode);
        if (!freshData?.videoUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not retrieve video URL for this reel.",
          });
        }
        let videoUrl = freshData.videoUrl;

        // Call the new Deepgram-based transcription pipeline
        // This handles: download + retry + ffmpeg + Deepgram Nova-3 + classify
        const { transcribeReel } = await import("./services/transcribeReel.js");
        const result = await transcribeReel({
          videoUrl,
          shortcode: input.shortcode,
        });

        if (!result.success) {
          // No-speech is a valid outcome (music/visual-only reel), not an error.
          // Return empty transcript/segments so the existing frontend fallback
          // ("No speech detected") renders cleanly.
          if (result.errorCode === "NO_SPEECH_DETECTED") {
            return {
              transcript: "",
              segments: [],
            };
          }
          // Map remaining error codes to appropriate TRPC error codes
          const code = result.errorCode === "REEL_TOO_LONG" ? "BAD_REQUEST"
            : result.errorCode === "VIDEO_TOO_LARGE" ? "BAD_REQUEST"
            : result.errorCode === "DEEPGRAM_RATE_LIMIT" ? "TOO_MANY_REQUESTS"
            : "INTERNAL_SERVER_ERROR";
          throw new TRPCError({
            code,
            message: result.userMessage,
            cause: { errorCode: result.errorCode },
          });
        }

        return {
          transcript: result.transcript,
          segments: result.segments,
        };
        } finally {
          activeTranscriptions--;
        }
      }),

    /** Re-create a script from a search result reel transcript */
    recreate: protectedProcedure
      .input(z.object({
        transcript: z.string().min(1),
        caption: z.string().optional().default(""),
        topic: z.string().max(2000).optional().default(""),
        gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check usage limit
        const recreateCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
        if (!recreateCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly AI re-creation limit (${recreateCheck.used}/${recreateCheck.limit}). Upgrade to ${recreateCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "recreateCount");
        const effectiveTopic = input.topic.trim() || "SAME_TOPIC";

        // Use the same LLM pipeline as the main recreate feature
        // Step 1: Analyze viral structure
        const structureResponse = await invokeLLM({
          messages: [
            { role: "system", content: "You are a viral content structure analyst. Always respond with valid JSON only." },
            { role: "user", content: `Analyze the following viral Reel transcript and identify its exact structure. Return JSON with: hook (type, text, technique), body (pacing, structure, keyPoints), transition (type, text), cta (type, text), overallTone, estimatedPace.\n\nCaption: ${input.caption}\n\nTranscript:\n${input.transcript}` },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "viral_structure",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  hook: { type: "object", properties: { type: { type: "string" }, text: { type: "string" }, technique: { type: "string" } }, required: ["type", "text", "technique"], additionalProperties: false },
                  body: { type: "object", properties: { pacing: { type: "string" }, structure: { type: "string" }, keyPoints: { type: "array", items: { type: "string" } } }, required: ["pacing", "structure", "keyPoints"], additionalProperties: false },
                  transition: { type: "object", properties: { type: { type: "string" }, text: { type: "string" } }, required: ["type", "text"], additionalProperties: false },
                  cta: { type: "object", properties: { type: { type: "string" }, text: { type: "string" } }, required: ["type", "text"], additionalProperties: false },
                  overallTone: { type: "string" },
                  estimatedPace: { type: "string" },
                },
                required: ["hook", "body", "transition", "cta", "overallTone", "estimatedPace"],
                additionalProperties: false,
              },
            },
          },
        });

        let viralStructure: Record<string, any>;
        try {
          viralStructure = JSON.parse((String(structureResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
        } catch {
          viralStructure = { error: "Failed to parse" };
        }

        const gradeLevelInstruction = input.gradeLevel === "auto"
          ? "Choose the most appropriate grade level."
          : `Write at a Grade ${input.gradeLevel} reading level.`;

        const isSameTopic = effectiveTopic === "SAME_TOPIC";
        const scriptPrompt = isSameTopic
          ? `Rewrite this viral Reel script keeping the SAME TOPIC but make it fresh and original.\n\nStructure: ${JSON.stringify(viralStructure)}\n\nOriginal: ${input.transcript}\n\n${gradeLevelInstruction}\n\nWrite as spoken text, short paragraphs for pauses. No labels.`
          : `Using this viral structure, write a NEW script on: ${effectiveTopic}\n\nStructure: ${JSON.stringify(viralStructure)}\n\nOriginal style reference: ${input.transcript}\n\n${gradeLevelInstruction}\n\nWrite as spoken text, short paragraphs for pauses. No labels.`;

        const scriptResponse = await invokeLLM({
          messages: [
            { role: "system", content: "You are an expert Instagram Reels scriptwriter." },
            { role: "user", content: scriptPrompt },
          ],
        });

        const generatedScript = String(scriptResponse.choices[0].message.content || "");

        return {
          viralStructure,
          generatedScript,
        };
      }),

    /** Fetch reels by direct Instagram URLs (up to 20) */
    byUrl: protectedProcedure
      .input(z.object({
        urls: z.array(z.string().url()).min(1).max(20),
      }))
      .mutation(async ({ input }) => {
        const results: any[] = [];
        const errors: string[] = [];

        for (const rawUrl of input.urls) {
          try {
            // Parse shortcode from URL
            // Supports: /reel/SHORTCODE/, /p/SHORTCODE/, /reels/SHORTCODE/
            const urlObj = new URL(rawUrl);
            const pathParts = urlObj.pathname.split("/").filter(Boolean);
            let shortcode = "";

            // Find the shortcode after /reel/, /p/, or /reels/
            for (let i = 0; i < pathParts.length; i++) {
              if (["reel", "reels", "p"].includes(pathParts[i]) && pathParts[i + 1]) {
                shortcode = pathParts[i + 1];
                break;
              }
            }

            if (!shortcode) {
              errors.push(`Could not parse shortcode from: ${rawUrl}`);
              continue;
            }

            // Fetch reel data using the media info endpoint (returns full metadata)
            const reelData = await fetchReelByShortcode(shortcode);
            if (!reelData) {
              errors.push(`Could not fetch reel data for: ${rawUrl}`);
              continue;
            }

            // Calculate engagement rate
            const engagementRate = reelData.ownerFollowerCount > 0
              ? ((reelData.likeCount + reelData.commentCount) / reelData.ownerFollowerCount) * 100
              : 0;

            results.push({
              shortcode,
              caption: reelData.caption || "",
              viewCount: reelData.viewCount,
              likeCount: reelData.likeCount,
              commentCount: reelData.commentCount,
              thumbnailUrl: reelData.thumbnailUrl || "",
              videoUrl: reelData.videoUrl || "",
              reelUrl: `https://www.instagram.com/reel/${shortcode}/`,
              duration: reelData.duration,
              postedAt: reelData.postedAt.toISOString(),
              ownerUsername: reelData.ownerUsername,
              ownerFullName: reelData.ownerFullName,
              ownerProfilePicUrl: reelData.ownerProfilePicUrl,
              ownerFollowerCount: reelData.ownerFollowerCount,
              engagementRate: Math.round(engagementRate * 100) / 100,
            });

            // Small delay between requests to avoid rate limiting
            if (input.urls.indexOf(rawUrl) < input.urls.length - 1) {
              await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
            }
          } catch (err) {
            errors.push(`Failed to fetch: ${rawUrl} - ${err instanceof Error ? err.message : "unknown error"}`);
          }
        }

        return {
          reels: results,
          errors,
          searchType: "url" as const,
          totalRequested: input.urls.length,
          totalFetched: results.length,
        };
      }),

    /** Profile preview for handle search (same as scrape.profilePreview) */
    profilePreview: protectedProcedure
      .input(z.object({ handle: z.string().min(1).max(128) }))
      .query(async ({ input }) => {
        try {
          const profile = await fetchProfile(input.handle);
          let proxiedPicUrl = "";
          if (profile.profilePicUrl) {
            try {
              const { gotScraping: gs } = await import("got-scraping");
              const picRes = await gs({
                url: profile.profilePicUrl,
                responseType: "buffer",
                timeout: { request: 10000 },
                retry: { limit: 0 },
              });
              if (picRes.statusCode === 200 && picRes.rawBody) {
                const suffix = Math.random().toString(36).slice(2, 8);
                const key = `profile-pics/${profile.username}-${suffix}.jpg`;
                const { url } = await storagePut(key, picRes.rawBody, "image/jpeg");
                proxiedPicUrl = url;
              }
            } catch {}
          }
          return {
            found: true as const,
            username: profile.username,
            fullName: profile.fullName,
            biography: profile.biography,
            profilePicUrl: proxiedPicUrl,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
            postCount: profile.postCount,
            isVerified: profile.isVerified,
            isPrivate: profile.isPrivate,
            category: profile.category,
            externalUrl: profile.externalUrl,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Profile not found";
          return { found: false as const, error: message };
        }
      }),
  }),

  // ── Script Tags ──
  tags: router({
    /** List all tags for the user (creates defaults if needed) */
    list: protectedProcedure.query(async ({ ctx }) => {
      await ensureDefaultTags(ctx.user.id);
      return getScriptTagsByUser(ctx.user.id);
    }),

    /** Create a custom tag */
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1), color: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const id = await createScriptTag({
          userId: ctx.user.id,
          name: input.name,
          color: input.color,
          isDefault: 0,
          sortOrder: 99,
        });
        return { id };
      }),

    /** Update a tag */
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().optional(), color: z.string().optional() }))
      .mutation(async ({ input }) => {
        const updateData: Parameters<typeof updateScriptTag>[1] = {};
        if (input.name) updateData.name = input.name;
        if (input.color) updateData.color = input.color;
        await updateScriptTag(input.id, updateData);
        return { success: true };
      }),

    /** Delete a custom tag */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        await deleteScriptTag(input.id);
        return { success: true };
      }),
  }),

  // ── Google Docs Export ──
  googleDocs: router({
    /** Check if Google Docs credentials are configured */
    isConfigured: protectedProcedure.query(() => {
      return { configured: isGoogleDocsConfigured() };
    }),

    /** Export a script to Google Docs */
    exportScript: protectedProcedure
      .input(z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        sourceHandle: z.string().nullable().optional(),
        gradeLevel: z.string().nullable().optional(),
        postDate: z.string().nullable().optional(),
        wordCount: z.number().nullable().optional(),
        notes: z.string().nullable().optional(),
        shareWithEmail: z.string().email().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!isGoogleDocsConfigured()) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Google credentials not configured. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in Settings > Secrets.",
          });
        }

        try {
          const result = await exportToGoogleDocs(
            {
              title: input.title,
              content: input.content,
              sourceHandle: input.sourceHandle,
              gradeLevel: input.gradeLevel,
              postDate: input.postDate,
              wordCount: input.wordCount,
              notes: input.notes,
            },
            input.shareWithEmail || ctx.user.email || undefined
          );

          return {
            documentUrl: result.documentUrl,
            documentId: result.documentId,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to create Google Doc";
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
        }
      }),
  }),

  // ── User Preferences ──
  preferences: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const prefs = await getUserPreferences(ctx.user.id);
      return prefs || { timezone: "America/Chicago" };
    }),
    update: protectedProcedure
      .input(z.object({ timezone: z.string().min(1).max(64) }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserPreferences(ctx.user.id, { timezone: input.timezone });
        return { success: true };
      }),
  }),

  // ── Blog ──
  blog: router({
    // Public: list published posts
    published: publicProcedure.query(async () => {
      return getPublishedBlogPosts();
    }),

    // Public: get single post by slug
    bySlug: publicProcedure
      .input(z.object({ slug: z.string() }))
      .query(async ({ input }) => {
        const post = await getBlogPostBySlug(input.slug);
        if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
        return post;
      }),

    // Admin: list all posts (drafts + published)
    all: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return getAllBlogPosts();
    }),

    // Admin: get post by id for editing
    byId: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const post = await getBlogPostById(input.id);
        if (!post) throw new TRPCError({ code: "NOT_FOUND" });
        return post;
      }),

    // Admin: create post
    create: protectedProcedure
      .input(z.object({
        title: z.string().min(1).max(512),
        slug: z.string().min(1).max(512),
        excerpt: z.string().optional(),
        content: z.string().min(1),
        coverImageUrl: z.string().optional(),
        tags: z.array(z.string()).optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const id = await createBlogPost({
          ...input,
          authorId: ctx.user.id,
          publishedAt: input.status === "published" ? new Date() : undefined,
        });
        return { id };
      }),

    // Admin: update post
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(512).optional(),
        slug: z.string().min(1).max(512).optional(),
        excerpt: z.string().optional(),
        content: z.string().optional(),
        coverImageUrl: z.string().optional(),
        tags: z.array(z.string()).optional(),
        metaTitle: z.string().optional(),
        metaDescription: z.string().optional(),
        status: z.enum(["draft", "published"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const { id, ...data } = input;
        if (data.status === "published") {
          const existing = await getBlogPostById(id);
          if (existing && !existing.publishedAt) {
            (data as any).publishedAt = new Date();
          }
        }
        await updateBlogPost(id, data);
        return { success: true };
      }),

    // Admin: delete post
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        await deleteBlogPost(input.id);
        return { success: true };
      }),
  }),

  // ── Telegram Bot Connection ──
  telegram: router({
    /** Get current connection status */
    status: protectedProcedure.query(async ({ ctx }) => {
      const connection = await getTelegramConnectionByUserId(ctx.user.id);
      const botInfo = await getTelegramBotInfo();
      return {
        connected: connection?.isConnected === 1,
        telegramUsername: connection?.telegramUsername || null,
        botUsername: botInfo?.username || null,
        botName: botInfo?.name || null,
      };
    }),

    /** Generate a new link code for connecting Telegram */
    generateLinkCode: protectedProcedure.mutation(async ({ ctx }) => {
      const code = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Check if user already has a connection
      const existing = await getTelegramConnectionByUserId(ctx.user.id);
      if (existing) {
        // Update existing connection with new code
        await updateTelegramConnection(existing.id, {
          linkCode: code,
          linkCodeExpiresAt: expiresAt,
          isConnected: 0,
          telegramChatId: null,
        });
      } else {
        await createTelegramConnection({
          userId: ctx.user.id,
          linkCode: code,
          linkCodeExpiresAt: expiresAt,
        });
      }

      const botInfo = await getTelegramBotInfo();
      return {
        code,
        expiresAt: expiresAt.toISOString(),
        botUsername: botInfo?.username || "SpyReelsBot",
      };
    }),

    /** Disconnect Telegram */
    disconnect: protectedProcedure.mutation(async ({ ctx }) => {
      const connection = await getTelegramConnectionByUserId(ctx.user.id);
      if (connection) {
        await deleteTelegramConnection(connection.id);
      }
      return { success: true };
    }),

    /** Manually set up webhook (admin only) */
    setupWebhook: protectedProcedure
      .input(z.object({ baseUrl: z.string().url() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        const success = await setupTelegramWebhook(input.baseUrl);
        return { success };
      }),
  }),

  // ── Collected Reels (from Telegram bot, URL paste, etc.) ──
  collected: router({
    /** List all collected reels for the user, including transcription status */
    list: protectedProcedure.query(async ({ ctx }) => {
      const reels = await getCollectedReelsByUser(ctx.user.id);
      
      const { getDb } = await import("./db");
      const { reels: reelsTable, transcriptions, scrapeJobs } = await import("../drizzle/schema");
      const { inArray } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return reels.map(r => ({
        ...r,
        transcriptionReelId: r.transcriptionReelId ?? null,
        transcriptionStatus: null as string | null,
        monitoredViewCount: null as number | null,
        monitoredFollowerCount: null as number | null,
      }));
      
      const transcriptionReelIds = Array.from(
        new Set(
          reels
            .map((r) => r.transcriptionReelId)
            .filter((id): id is number => id != null && id > 0)
        )
      );
      const txnStatusByReelId = new Map<number, string>();
      if (transcriptionReelIds.length > 0) {
        const txns = await db
          .select({ reelId: transcriptions.reelId, status: transcriptions.status })
          .from(transcriptions)
          .where(inArray(transcriptions.reelId, transcriptionReelIds));
        for (const t of txns) {
          txnStatusByReelId.set(t.reelId, t.status);
        }
      }

      const readyReels = reels.filter(r => r.status === "ready");
      const shortcodes = readyReels.map(r => r.shortcode);
      
      // Map for cross-referenced view counts from Account Monitoring scrapes
      let monitoredDataMap = new Map<string, { viewCount: number; followerCount: number }>();
      
      if (shortcodes.length > 0) {
        // Cross-reference with Account Monitoring: find matching reels from real scrape jobs (jobId > 0)
        // This gives us view counts that Instagram doesn't expose via page scraping
        const monitoredReels = await db.select({
          shortcode: reelsTable.shortcode,
          viewCount: reelsTable.viewCount,
          jobId: reelsTable.jobId,
        })
          .from(reelsTable)
          .where(inArray(reelsTable.shortcode, shortcodes));
        
        // Get follower counts from scrape jobs for engagement rate calculation
        const jobIds = Array.from(new Set(monitoredReels.filter(r => r.jobId > 0).map(r => r.jobId)));
        let jobFollowerMap = new Map<number, number>();
        if (jobIds.length > 0) {
          const jobs = await db.select({ id: scrapeJobs.id, followerCount: scrapeJobs.followerCount })
            .from(scrapeJobs)
            .where(inArray(scrapeJobs.id, jobIds));
          jobFollowerMap = new Map(jobs.map(j => [j.id, j.followerCount]));
        }
        
        // For each shortcode, pick the best view count (highest from any scrape job)
        for (const mr of monitoredReels) {
          if (mr.jobId === 0) continue; // Skip collected-reel transcription entries
          const existing = monitoredDataMap.get(mr.shortcode);
          const followerCount = jobFollowerMap.get(mr.jobId) || 0;
          if (!existing || mr.viewCount > existing.viewCount) {
            monitoredDataMap.set(mr.shortcode, {
              viewCount: mr.viewCount,
              followerCount: followerCount,
            });
          }
        }
      }
      
      return reels.map(r => {
        const monitored = monitoredDataMap.get(r.shortcode);
        return {
          ...r,
          transcriptionReelId: r.transcriptionReelId ?? null,
          transcriptionStatus:
            r.transcriptionReelId != null
              ? txnStatusByReelId.get(r.transcriptionReelId) ?? null
              : null,
          // Cross-referenced data from Account Monitoring
          monitoredViewCount: monitored?.viewCount ?? null,
          monitoredFollowerCount: monitored?.followerCount ?? null,
        };
      });
    }),

    /** Delete a collected reel */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const reel = await getCollectedReelById(input.id);
        if (!reel || reel.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await deleteCollectedReel(input.id);
        return { success: true };
      }),

    /** Add a reel by URL (manual paste from web UI) */
    addByUrl: protectedProcedure
      .input(z.object({ url: z.string() }))
      .mutation(async ({ ctx, input }) => {
        // Parse shortcode from URL
        const urlPatterns = [
          /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/,
          /instagr\.am\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/,
        ];
        let shortcode = "";
        for (const pattern of urlPatterns) {
          const match = input.url.match(pattern);
          if (match && match[1]) { shortcode = match[1]; break; }
        }
        if (!shortcode) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Could not parse Instagram Reel URL" });
        }

        // Check for duplicates
        const existing = await getCollectedReelByShortcode(ctx.user.id, shortcode);
        if (existing) {
          return { id: existing.id, duplicate: true };
        }

        // Create pending reel
        const id = await createCollectedReel({
          userId: ctx.user.id,
          shortcode,
          reelUrl: `https://www.instagram.com/reel/${shortcode}/`,
          source: "url_paste",
          status: "pending",
        });

        // Fetch metadata in background
        fetchAndUpdateCollectedReelBg(id, shortcode).catch((err) => {
          console.error(`[Collected] Failed to fetch reel ${shortcode}:`, err);
        });

        return { id, duplicate: false };
      }),

    /** Refresh metadata for a failed or incomplete reel */
    retry: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const reel = await getCollectedReelById(input.id);
        if (!reel || reel.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await updateCollectedReel(input.id, { status: "pending", errorMessage: null });
        fetchAndUpdateCollectedReelBg(input.id, reel.shortcode).catch((err) => {
          console.error(`[Collected] Retry failed for ${reel.shortcode}:`, err);
        });
        return { success: true };
      }),

    /** Refresh all reels - re-fetch latest stats (views, likes, comments) for all ready reels */
    refreshAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        const allReels = await getCollectedReelsByUser(ctx.user.id);
        // Refresh ALL reels: pending/failed ones need retry, ready ones need stat updates
        const needsRefresh = allReels.filter(
          (r) => r.status === "pending" || r.status === "failed" || r.status === "ready"
        );
        let count = 0;
        for (const reel of needsRefresh) {
          // Only set to pending for non-ready reels; for ready reels, refresh in background without status change
          if (reel.status !== "ready") {
            await updateCollectedReel(reel.id, { status: "pending", errorMessage: null });
          }
          fetchAndUpdateCollectedReelBg(reel.id, reel.shortcode).catch((err) => {
            console.error(`[Collected] Refresh failed for ${reel.shortcode}:`, err);
          });
          count++;
          // Small delay between requests
          if (count < needsRefresh.length) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        return { refreshed: count };
      }),

    /** Transcribe a collected reel */
    transcribe: protectedProcedure
      .input(z.object({ collectedReelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const reel = await getCollectedReelById(input.collectedReelId);
        if (!reel || reel.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Collected reel not found" });
        }
        if (reel.status !== "ready") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reel metadata not ready yet" });
        }
        if (!reel.videoUrl) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No video URL available for this reel" });
        }

        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "transcribeCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Transcription limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "transcribeCount");

        // Check if transcription already exists for this shortcode (via reels table)
        // For collected reels, we store transcription data directly in a separate approach:
        // We'll create a temporary reel entry to reuse the transcription system
        const tempReelData = {
          jobId: 0, // 0 = collected reel, not from a scrape job
          shortcode: reel.shortcode,
          caption: reel.caption || "",
          viewCount: reel.viewCount || 0,
          likeCount: reel.likeCount || 0,
          commentCount: reel.commentCount || 0,
          thumbnailUrl: reel.thumbnailUrl || "",
          videoUrl: reel.videoUrl || "",
          reelUrl: reel.reelUrl,
          duration: reel.duration || 0,
          postedAt: reel.postedAt || new Date(),
          ownerUsername: reel.ownerUsername || "",
        };

        // Check if we already have a reel entry for this shortcode
        const { getDb } = await import("./db");
        const { reels: reelsTable, collectedReels } = await import("../drizzle/schema");
        const { eq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        let reelId: number;
        if (reel.transcriptionReelId != null && reel.transcriptionReelId > 0) {
          reelId = reel.transcriptionReelId;
        } else {
          const result = await db.insert(reelsTable).values(tempReelData);
          reelId = result[0].insertId;
        }

        await db.update(collectedReels)
          .set({ transcriptionReelId: reelId })
          .where(eq(collectedReels.id, input.collectedReelId));

        // Check for existing transcription
        const existingTranscription = await getTranscriptionByReelId(reelId);
        if (existingTranscription && existingTranscription.status === "completed") {
          return { reelId, transcriptionId: existingTranscription.id, status: "completed" as const };
        }
        if (existingTranscription && existingTranscription.status === "processing") {
          return { reelId, transcriptionId: existingTranscription.id, status: "processing" as const };
        }

        // Create transcription
        const transcriptionId = await createTranscription({
          reelId,
          status: "processing",
        });

        // Run transcription in background (reuse existing logic)
        runTranscription(transcriptionId, {
          id: reelId,
          shortcode: reel.shortcode,
          videoUrl: reel.videoUrl,
          caption: reel.caption,
          thumbnailUrl: reel.thumbnailUrl,
        }).catch((err) => {
          console.error(`[Collected] Transcription failed for ${reel.shortcode}:`, err);
        });

        return { reelId, transcriptionId, status: "processing" as const };
      }),

    /** Get transcription status for a collected reel */
    transcriptionStatus: protectedProcedure
      .input(z.object({ reelId: z.number() }))
      .query(async ({ input }) => {
        const transcription = await getTranscriptionByReelId(input.reelId);
        if (!transcription) return null;
        return transcription;
      }),
  }),

  // ── Script Ideas (Idea to Script Factory) ──
  ideas: router({
    /** Submit a new idea — goes through AI validation first */
    submit: protectedProcedure
      .input(z.object({
        idea: z.string().min(3).max(2000),
        niche: z.string().max(128).optional(),
        tone: z.enum(["casual", "professional", "humorous", "educational", "engaging"]).optional().default("engaging"),
        gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6"]).optional().default("auto"),
        inputMethod: z.enum(["text", "voice", "video"]).optional().default("text"),
        audioUrl: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const ideaId = await createScriptIdea({
          userId: ctx.user.id,
          idea: input.idea,
          niche: input.niche || null,
          tone: input.tone,
          gradeLevel: input.gradeLevel,
          inputMethod: input.inputMethod,
          audioUrl: input.audioUrl || null,
          status: "validating",
          validationStatus: "pending",
        } as any);

        // Trigger AI validation in background
        validateIdeaInBackground(ideaId).catch(err =>
          console.error(`[Ideas] Validation failed for idea ${ideaId}:`, err)
        );

        return { id: ideaId, status: "validating" as const };
      }),

    /** Transcribe voice/video recording into text */
    transcribeVoice: protectedProcedure
      .input(z.object({
        audioBase64: z.string(), // base64 encoded audio data
        mimeType: z.string().default("audio/webm"),
      }))
      .mutation(async ({ ctx, input }) => {
        // Decode base64 to buffer and upload to S3
        const audioBuffer = Buffer.from(input.audioBase64, "base64");
        const ext = input.mimeType.includes("webm") ? "webm" : input.mimeType.includes("mp4") ? "m4a" : "webm";
        const key = `voice-ideas/${ctx.user.id}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
        const { url: audioUrl } = await storagePut(key, audioBuffer, input.mimeType);

        // Transcribe using Whisper
        const result = await transcribeAudio({
          audioUrl,
          language: "en",
          prompt: "Transcribe the user's Instagram Reel content idea",
        });

        if ("error" in result) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error || "Transcription failed",
          });
        }

        return { text: result.text, audioUrl };
      }),

    /** Accept the AI suggestion and proceed to script generation */
    approve: protectedProcedure
      .input(z.object({
        ideaId: z.number(),
        action: z.enum(["accept", "reject", "edit"]),
        editedIdea: z.string().optional(), // only when action is "edit"
      }))
      .mutation(async ({ ctx, input }) => {
        const idea = await getScriptIdeaById(input.ideaId);
        if (!idea || idea.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
        }
        if (idea.status !== "awaiting_approval") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Idea is not awaiting approval" });
        }

        if (input.action === "reject") {
          await updateScriptIdea(input.ideaId, {
            validationStatus: "rejected",
            status: "failed",
            errorMessage: "Idea rejected by user",
          } as any);
          return { status: "rejected" as const };
        }

        if (input.action === "edit" && input.editedIdea) {
          // User edited the idea — re-validate the edited version (back-and-forth loop)
          // No usage credit charged for re-validation, only for final script generation
          await updateScriptIdea(input.ideaId, {
            idea: input.editedIdea,
            validationStatus: "edited",
            status: "validating",
            aiSuggestion: null,
            aiReasoning: null,
          } as any);

          // Re-validate instead of generating script — creates a proper feedback loop
          validateIdeaInBackground(input.ideaId).catch(err =>
            console.error(`[Ideas] Re-validation failed for idea ${input.ideaId}:`, err)
          );

          return { status: "validating" as const };
        }

        // Check usage limit before generating script (only for accept action)
        const recreateCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
        if (!recreateCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You've reached your monthly AI script limit (${recreateCheck.used}/${recreateCheck.limit}). Upgrade to ${recreateCheck.planRequired || "a higher plan"} for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "recreateCount");

        {
          // Accept — use AI suggestion as the idea if available
          const finalIdea = idea.aiSuggestion || idea.idea;
          await updateScriptIdea(input.ideaId, {
            idea: finalIdea,
            validationStatus: "accepted",
            status: "queued",
          } as any);
        }

        // Now generate the script (only for accept action)
        processIdeaInBackground(input.ideaId).catch(err =>
          console.error(`[Ideas] Background processing failed for idea ${input.ideaId}:`, err)
        );

        return { status: "queued" as const };
      }),

    /** Submit multiple ideas at once (batch mode) */
    submitBatch: protectedProcedure
      .input(z.object({
        ideas: z.array(z.object({
          idea: z.string().min(3).max(2000),
          niche: z.string().max(128).optional(),
        })).min(1).max(20),
        tone: z.enum(["casual", "professional", "humorous", "educational", "engaging"]).optional().default("engaging"),
        gradeLevel: z.enum(["auto", "2", "3", "4", "5", "6"]).optional().default("auto"),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if user has enough quota for all ideas
        const recreateCheck = await checkUsageLimit(ctx.user.id, "recreateCount", ctx.user.openId);
        const remaining = recreateCheck.limit - recreateCheck.used;
        if (remaining < input.ideas.length) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You can only generate ${remaining} more scripts this month (trying to submit ${input.ideas.length}). Upgrade for more.`,
          });
        }

        const results: { id: number; idea: string }[] = [];
        for (const item of input.ideas) {
          await incrementUsage(ctx.user.id, "recreateCount");
          const ideaId = await createScriptIdea({
            userId: ctx.user.id,
            idea: item.idea,
            niche: item.niche || null,
            tone: input.tone,
            gradeLevel: input.gradeLevel,
          });
          results.push({ id: ideaId, idea: item.idea });
          // Trigger background generation for each
          processIdeaInBackground(ideaId).catch(err =>
            console.error(`[Ideas] Background processing failed for idea ${ideaId}:`, err)
          );
        }

        return { submitted: results.length, ideas: results };
      }),

    /** Get all ideas for the current user */
    list: protectedProcedure.query(async ({ ctx }) => {
      return getScriptIdeasByUser(ctx.user.id);
    }),

    /** Get a single idea by ID */
    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const idea = await getScriptIdeaById(input.id);
        if (!idea || idea.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
        }
        return idea;
      }),

    /** Save a completed idea's script to My Scripts */
    saveToScripts: protectedProcedure
      .input(z.object({ ideaId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const idea = await getScriptIdeaById(input.ideaId);
        if (!idea || idea.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
        }
        if (idea.status !== "completed" || !idea.generatedScript) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Script not ready yet" });
        }
        if (idea.savedScriptId) {
          return { savedScriptId: idea.savedScriptId, alreadySaved: true };
        }

        // Create a saved script from the idea
        const title = idea.generatedTitle || `Script: ${idea.idea.substring(0, 60)}`;
        const content = idea.generatedScript;
        const wordCount = content.split(/\s+/).filter(Boolean).length;

        const savedScriptId = await createSavedScript({
          userId: ctx.user.id,
          title,
          content,
          originalContent: content,
          sourceHandle: "idea",
          gradeLevel: idea.gradeLevel || "auto",
          wordCount,
          status: "draft",
        });

        // Create initial version
        await createScriptVersion({
          scriptId: savedScriptId,
          content,
          versionNumber: 1,
          changeType: "initial",
          changeDescription: `Generated from idea: ${idea.idea.substring(0, 100)}`,
        });

        // Link the idea to the saved script
        await updateScriptIdea(input.ideaId, { savedScriptId });

        return { savedScriptId, alreadySaved: false };
      }),

    /** Delete an idea */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const idea = await getScriptIdeaById(input.id);
        if (!idea || idea.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
        }
        await deleteScriptIdea(input.id);
        return { success: true };
      }),

    /** Retry a failed idea — re-validate or re-generate */
    retry: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const idea = await getScriptIdeaById(input.id);
        if (!idea || idea.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Idea not found" });
        }
        if (idea.status !== "failed") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Only failed ideas can be retried" });
        }
        // If it failed during validation, re-validate; otherwise re-generate
        if (!idea.validationStatus || idea.validationStatus === "pending") {
          await updateScriptIdea(input.id, { status: "validating", errorMessage: null, validationStatus: "pending" } as any);
          validateIdeaInBackground(input.id).catch(err =>
            console.error(`[Ideas] Retry validation failed for idea ${input.id}:`, err)
          );
        } else {
          await updateScriptIdea(input.id, { status: "queued", errorMessage: null } as any);
          processIdeaInBackground(input.id).catch(err =>
            console.error(`[Ideas] Retry failed for idea ${input.id}:`, err)
          );
        }
        return { status: "queued" as const };
      }),
  }),

  // ── Library: Central hub for all transcripts & scripts ──
  library: router({
    transcripts: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        source: z.enum(["scraped", "collected"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        const opts = input || {};
        return getLibraryTranscripts(ctx.user.id, opts);
      }),

    scripts: protectedProcedure
      .input(z.object({
        search: z.string().optional(),
        source: z.enum(["saved", "recreated", "idea"]).optional(),
        status: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        const opts = input || {};
        return getLibraryScripts(ctx.user.id, opts);
      }),
  }),

  // ── Admin Dashboard ──
  admin: router({
    overview: adminProcedure.query(async () => {
      const db = await getDb();
      if (!db) return { totalUsers: 0, paidUsers: 0, freeUsers: 0, mrr: 0, activeToday: 0, activeThisWeek: 0, activeThisMonth: 0, newThisWeek: 0 };
      const allUsers = await db.select().from(users);
      const allSubs = await db.select().from(subscriptions);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const paidPlans = ["starter", "pro", "business", "agency"];
      const paidSubs = allSubs.filter(s => paidPlans.includes(s.plan) && s.stripeSubscriptionId);
      const priceMap: Record<string, number> = { starter: 19, pro: 49, business: 99, agency: 199 };
      const mrr = paidSubs.reduce((sum, s) => {
        const base = priceMap[s.plan] || 0;
        return sum + (s.billingInterval === "yearly" ? Math.round(base * 0.8) : base);
      }, 0);
      return {
        totalUsers: allUsers.length,
        paidUsers: paidSubs.length,
        freeUsers: allUsers.length - paidSubs.length,
        mrr,
        activeToday: allUsers.filter(u => u.lastSignedIn >= todayStart).length,
        activeThisWeek: allUsers.filter(u => u.lastSignedIn >= weekAgo).length,
        activeThisMonth: allUsers.filter(u => u.lastSignedIn >= monthAgo).length,
        newThisWeek: allUsers.filter(u => u.createdAt >= weekAgo).length,
      };
    }),

    users: adminProcedure
      .input(z.object({
        search: z.string().optional(),
        plan: z.string().optional(),
        sortBy: z.enum(["createdAt", "lastSignedIn", "name"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return { items: [], total: 0 };
        const opts = input || { sortBy: "createdAt", sortOrder: "desc", limit: 50, offset: 0 };
        const allUsers = await db.select().from(users).orderBy(
          opts.sortOrder === "asc" ? asc(users[opts.sortBy]) : desc(users[opts.sortBy])
        );
        const allSubs = await db.select().from(subscriptions);
        const subMap = new Map(allSubs.map(s => [s.userId, s]));
        
        // Get current month usage for all users
        const currentMonth = new Date().toISOString().slice(0, 7);
        const allUsage = await db.select().from(monthlyUsage).where(eq(monthlyUsage.usageMonth, currentMonth));
        const usageMap = new Map(allUsage.map(u => [u.userId, u]));
        
        // Get script counts per user
        const scriptCounts = await db.select({
          userId: savedScripts.userId,
          count: sql<number>`count(*)`,
        }).from(savedScripts).groupBy(savedScripts.userId);
        const scriptMap = new Map(scriptCounts.map(s => [s.userId, s.count]));
        
        // Get scrape job counts per user
        const scrapeCounts = await db.select({
          userId: scrapeJobs.userId,
          count: sql<number>`count(*)`,
        }).from(scrapeJobs).groupBy(scrapeJobs.userId);
        const scrapeMap = new Map(scrapeCounts.map(s => [s.userId, s.count]));
        
        // Get collected reel counts per user
        const collectedCounts = await db.select({
          userId: collectedReels.userId,
          count: sql<number>`count(*)`,
        }).from(collectedReels).groupBy(collectedReels.userId);
        const collectedMap = new Map(collectedCounts.map(s => [s.userId, s.count]));

        let enriched = allUsers.map(u => {
          const sub = subMap.get(u.id);
          const usage = usageMap.get(u.id);
          const now = new Date();
          const daysSinceActive = Math.floor((now.getTime() - u.lastSignedIn.getTime()) / (1000 * 60 * 60 * 24));
          let retentionStatus: "active" | "at_risk" | "churned" = "active";
          if (daysSinceActive > 30) retentionStatus = "churned";
          else if (daysSinceActive > 7) retentionStatus = "at_risk";
          return {
            id: u.id,
            name: u.name || "Unknown",
            email: u.email || "No email",
            loginMethod: u.loginMethod || "unknown",
            role: u.role,
            plan: sub?.plan || "free",
            stripeCustomerId: sub?.stripeCustomerId || null,
            createdAt: u.createdAt,
            lastSignedIn: u.lastSignedIn,
            daysSinceActive,
            retentionStatus,
            scriptsCreated: scriptMap.get(u.id) || 0,
            scrapeJobsRun: scrapeMap.get(u.id) || 0,
            reelsCollected: collectedMap.get(u.id) || 0,
            monthlyUsage: usage ? {
              scrapes: usage.scrapeCount,
              transcriptions: usage.transcribeCount,
              recreates: usage.recreateCount,
              rewrites: usage.rewriteCount,
              searches: usage.searchCount,
            } : { scrapes: 0, transcriptions: 0, recreates: 0, rewrites: 0, searches: 0 },
          };
        });

        // Apply search filter
        if (opts.search) {
          const lower = opts.search.toLowerCase();
          enriched = enriched.filter(u =>
            u.name.toLowerCase().includes(lower) ||
            u.email.toLowerCase().includes(lower)
          );
        }
        // Apply plan filter
        if (opts.plan) {
          enriched = enriched.filter(u => u.plan === opts.plan);
        }

        const total = enriched.length;
        const items = enriched.slice(opts.offset, opts.offset + opts.limit);
        return { items, total };
      }),

    userDetail: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
        const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
        if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
        
        // Get all monthly usage history
        const usageHistory = await db.select().from(monthlyUsage)
          .where(eq(monthlyUsage.userId, input.userId))
          .orderBy(desc(monthlyUsage.usageMonth))
          .limit(12);
        
        // Get recent scrape jobs
        const recentJobs = await db.select().from(scrapeJobs)
          .where(eq(scrapeJobs.userId, input.userId))
          .orderBy(desc(scrapeJobs.createdAt))
          .limit(10);
        
        // Get recent scripts
        const recentScripts = await db.select({
          id: savedScripts.id,
          title: savedScripts.title,
          status: savedScripts.status,
          createdAt: savedScripts.createdAt,
        }).from(savedScripts)
          .where(eq(savedScripts.userId, input.userId))
          .orderBy(desc(savedScripts.createdAt))
          .limit(10);
        
        const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, input.userId)).limit(1);
        
        return {
          user: { id: user.id, name: user.name, email: user.email, loginMethod: user.loginMethod, role: user.role, createdAt: user.createdAt, lastSignedIn: user.lastSignedIn },
          subscription: sub ? { plan: sub.plan, status: sub.status, billingInterval: sub.billingInterval, stripeCustomerId: sub.stripeCustomerId, currentPeriodEnd: sub.currentPeriodEnd } : null,
          usageHistory,
          recentJobs,
          recentScripts,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;

// ── Helper functions ──

async function fetchAndUpdateCollectedReelBg(reelId: number, shortcode: string): Promise<void> {
  try {
    const data = await fetchReelByShortcode(shortcode);
    if (!data) {
      await updateCollectedReel(reelId, {
        status: "failed",
        errorMessage: "Could not fetch reel data from Instagram",
      });
      return;
    }

    // Read existing reel data to preserve values that Instagram may not return
    // (e.g., view counts are often null/0 from page scrape since Instagram
    // restricts play_count for unauthenticated requests)
    const existing = await getCollectedReelById(reelId);

    await updateCollectedReel(reelId, {
      caption: data.caption || existing?.caption || null,
      // Preserve existing view count if the new fetch returns 0 (Instagram restriction)
      viewCount: data.viewCount > 0 ? data.viewCount : (existing?.viewCount || 0),
      likeCount: data.likeCount > 0 ? data.likeCount : (existing?.likeCount || 0),
      commentCount: data.commentCount > 0 ? data.commentCount : (existing?.commentCount || 0),
      thumbnailUrl: data.thumbnailUrl || existing?.thumbnailUrl || null,
      videoUrl: data.videoUrl || existing?.videoUrl || null,
      duration: data.duration || existing?.duration || null,
      postedAt: data.postedAt || existing?.postedAt || null,
      ownerUsername: data.ownerUsername || existing?.ownerUsername || null,
      ownerFullName: data.ownerFullName || existing?.ownerFullName || null,
      ownerProfilePicUrl: data.ownerProfilePicUrl || existing?.ownerProfilePicUrl || null,
      ownerFollowerCount: data.ownerFollowerCount > 0 ? data.ownerFollowerCount : (existing?.ownerFollowerCount || 0),
      status: "ready",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateCollectedReel(reelId, {
      status: "failed",
      errorMessage: message,
    });
  }
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function buildExportData(jobId: number) {
  const reelsList = await getReelsByJobId(jobId);
  const transcriptionsList = await getTranscriptionsByJobId(jobId);
  const transcriptionMap = new Map(
    transcriptionsList.map((t) => [t.reelId, t])
  );
  const job = await getScrapeJob(jobId);
  const followerCount = job?.followerCount || 0;

  const headers = [
    "Reel URL",
    "Shortcode",
    "Caption",
    "Views",
    "Likes",
    "Comments",
    "Engagement Rate (%)",
    "Duration (s)",
    "Posted At",
    "Thumbnail URL",
    "Transcript",
    "Hook Analysis",
  ];

  const rows = reelsList.map((r) => {
    const t = transcriptionMap.get(r.id);
    const engagementRate = followerCount > 0
      ? ((r.likeCount + r.commentCount) / followerCount) * 100
      : 0;
    return [
      r.reelUrl,
      r.shortcode,
      escapeCsv(r.caption || ""),
      r.viewCount.toString(),
      r.likeCount.toString(),
      r.commentCount.toString(),
      (Math.round(engagementRate * 100) / 100).toString(),
      (r.duration || 0).toString(),
      r.postedAt ? new Date(r.postedAt).toISOString() : "",
      r.thumbnailUrl || "",
      escapeCsv(t?.transcript || ""),
      escapeCsv(t?.hookAnalysis || ""),
    ];
  });

  const csvContent =
    headers.join(",") + "\n" + rows.map((row) => row.join(",")).join("\n");

  const filename = `reels_${job?.handle || "export"}_${new Date().toISOString().slice(0, 10)}.csv`;

  return { csvContent, filename };
}

/** Background scrape job runner */
async function runScrapeJob(
  jobId: number,
  handle: string,
  timeframeDays: number
): Promise<void> {
  try {
    // Stage 1: connecting → about to call Instagram for the profile.
    await updateScrapeJob(jobId, {
      status: "running",
      currentStep: "connecting",
      progressPercent: 5,
    });

    // Stage 2: fetching_profile → scrapeReels will call fetchProfile as its
    // first step; we can't peek inside the function, so we mark the stage at
    // the boundary.
    await updateScrapeJob(jobId, {
      currentStep: "fetching_profile",
      progressPercent: 15,
    });

    const { reels: reelData, followerCount, profilePicUrl } = await scrapeReels(
      handle,
      timeframeDays,
      (count) => {
        // Stage 3: pulling_reels → scales 20→80 against a visual baseline
        // of 30 reels; caps at 80 so we always leave headroom for ranking.
        updateScrapeJob(jobId, {
          currentStep: "pulling_reels",
          totalReels: count,
          reelsFound: count,
          progressPercent: Math.min(20 + Math.floor((count / 30) * 60), 80),
        }).catch(() => {});
      },
      { maxReels: 500, timeoutMs: 5 * 60 * 1000 }
    );

    // Stage 4: ranking → insert + finalize. Set before pic proxy so the UI
    // has a visible "analyzing" beat even when the proxy work is quick.
    await updateScrapeJob(jobId, {
      currentStep: "ranking",
      progressPercent: 85,
    });

    // Proxy profile pic through S3 to avoid Instagram CORS/hotlink blocking
    let proxiedPicUrl = "";
    if (profilePicUrl) {
      try {
        const { gotScraping: gs } = await import("got-scraping");
        const picRes = await gs({
          url: profilePicUrl,
          responseType: "buffer",
          timeout: { request: 10000 },
          retry: { limit: 0 },
        });
        if (picRes.statusCode === 200 && picRes.rawBody) {
          const suffix = Math.random().toString(36).slice(2, 8);
          const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
          const key = `profile-pics/${cleanHandle}-${suffix}.jpg`;
          const { url } = await storagePut(key, picRes.rawBody, "image/jpeg");
          proxiedPicUrl = url;
        }
      } catch {
        // If proxy fails, leave empty - UI shows fallback avatar
      }
    }

    if (reelData.length === 0) {
      await updateScrapeJob(jobId, {
        status: "completed",
        totalReels: 0,
        followerCount,
        profilePicUrl: proxiedPicUrl || undefined,
        currentStep: "complete",
        progressPercent: 100,
      });
      return;
    }

    await insertReels(
      reelData.map((r) => ({
        jobId,
        shortcode: r.shortcode,
        caption: r.caption,
        viewCount: r.viewCount,
        likeCount: r.likeCount,
        commentCount: r.commentCount,
        thumbnailUrl: r.thumbnailUrl,
        videoUrl: r.videoUrl,
        reelUrl: r.reelUrl,
        duration: r.duration,
        postedAt: r.postedAt,
        ownerUsername: r.ownerUsername,
      }))
    );

    await updateScrapeJob(jobId, {
      status: "completed",
      totalReels: reelData.length,
      followerCount,
      profilePicUrl: proxiedPicUrl || undefined,
      currentStep: "complete",
      reelsFound: reelData.length,
      progressPercent: 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Failure preserves the last progressPercent the UI saw — just flip the
    // terminal flags so the client can show the error state.
    await updateScrapeJob(jobId, {
      status: "failed",
      errorMessage: message,
      currentStep: "failed",
    });
  }
}

/** Background resync job runner — only fetches new reels since last sync */
async function runResyncJob(
  jobId: number,
  handle: string,
  daysSinceSync: number
): Promise<void> {
  try {
    await updateScrapeJob(jobId, {
      currentStep: "connecting",
      progressPercent: 5,
    });
    await updateScrapeJob(jobId, {
      currentStep: "fetching_profile",
      progressPercent: 15,
    });

    const { reels: reelData, followerCount, profilePicUrl } = await scrapeReels(
      handle,
      daysSinceSync,
      (count) => {
        updateScrapeJob(jobId, {
          currentStep: "pulling_reels",
          totalReels: count,
          reelsFound: count,
          progressPercent: Math.min(20 + Math.floor((count / 30) * 60), 80),
        }).catch(() => {});
      },
      { maxReels: 500, timeoutMs: 5 * 60 * 1000 }
    );

    await updateScrapeJob(jobId, {
      currentStep: "ranking",
      progressPercent: 85,
    });

    // Proxy profile pic through S3 (refresh on each resync for freshness)
    let proxiedPicUrl = "";
    if (profilePicUrl) {
      try {
        const { gotScraping: gs } = await import("got-scraping");
        const picRes = await gs({
          url: profilePicUrl,
          responseType: "buffer",
          timeout: { request: 10000 },
          retry: { limit: 0 },
        });
        if (picRes.statusCode === 200 && picRes.rawBody) {
          const suffix = Math.random().toString(36).slice(2, 8);
          const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
          const key = `profile-pics/${cleanHandle}-${suffix}.jpg`;
          const { url } = await storagePut(key, picRes.rawBody, "image/jpeg");
          proxiedPicUrl = url;
        }
      } catch {
        // If proxy fails, keep existing pic
      }
    }

    // Get existing shortcodes to deduplicate
    const existingShortcodes = new Set(await getExistingShortcodes(jobId));
    const newReels = reelData.filter(r => !existingShortcodes.has(r.shortcode));

    if (newReels.length > 0) {
      await insertReels(
        newReels.map((r) => ({
          jobId,
          shortcode: r.shortcode,
          caption: r.caption,
          viewCount: r.viewCount,
          likeCount: r.likeCount,
          commentCount: r.commentCount,
          thumbnailUrl: r.thumbnailUrl,
          videoUrl: r.videoUrl,
          reelUrl: r.reelUrl,
          duration: r.duration,
          postedAt: r.postedAt,
          ownerUsername: r.ownerUsername,
        }))
      );
    }

    // Update total count (existing + new)
    const totalReels = existingShortcodes.size + newReels.length;
    await updateScrapeJobResync(jobId, {
      totalReels,
      followerCount,
      status: "completed",
      profilePicUrl: proxiedPicUrl || undefined,
    });
    await updateScrapeJob(jobId, {
      currentStep: "complete",
      reelsFound: totalReels,
      progressPercent: 100,
    });

    console.log(`[Resync] @${handle}: ${newReels.length} new reels added (${totalReels} total)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateScrapeJob(jobId, {
      status: "failed",
      errorMessage: message,
      currentStep: "failed",
    });
  }
}

/** Background transcription runner */
async function runTranscription(
  transcriptionId: number,
  reel: {
    id: number;
    shortcode: string;
    videoUrl: string | null;
    caption: string | null;
    thumbnailUrl: string | null;
  }
): Promise<void> {
  // Serialize with the same process-local semaphore that search.transcribe
  // uses. Prevents cascading Instagram CDN rate-limits when batch kickoffs
  // (e.g. "Transcribe All" on Saved Reels) fan out many reels in parallel
  // from our single Render IP.
  while (activeTranscriptions >= MAX_CONCURRENT_TRANSCRIPTIONS) {
    await new Promise((r) => setTimeout(r, 2000));
  }
  activeTranscriptions++;
  try {
    // Always fetch fresh URL to avoid expired Instagram video URLs
    const initialFresh = await fetchReelByShortcode(reel.shortcode);
    if (!initialFresh?.videoUrl) {
      throw new Error(
        "Could not retrieve video URL for this reel. The video may no longer be available."
      );
    }
    let videoUrl = initialFresh.videoUrl;

    // Call the new Deepgram-based transcription pipeline
    const { transcribeReel } = await import("./services/transcribeReel.js");
    const result = await transcribeReel({
      videoUrl,
      shortcode: reel.shortcode,
    });

    if (!result.success) {
      // No-speech is a valid outcome (music/visual-only reel).
      // Save empty transcript + "no speech" marker so the UI can
      // render the appropriate state.
      if (result.errorCode === "NO_SPEECH_DETECTED") {
        await updateTranscription(transcriptionId, {
          transcript: "",
          segments: [],
          hookAnalysis: "",
          status: "completed",
        });
        return;
      }
      // All other errors: mark the job as failed with the friendly message
      throw new Error(result.userMessage);
    }

    const transcript = result.transcript;
    const segments = result.segments;

    const hookAnalysis = await analyzeHook(
      transcript,
      reel.caption || "",
      reel.thumbnailUrl || "",
      segments as any
    );

    await updateTranscription(transcriptionId, {
      transcript,
      segments: segments as any,
      hookAnalysis,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[runTranscription] ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    await updateTranscription(transcriptionId, {
      status: "failed",
      errorMessage: message,
    });
  } finally {
    activeTranscriptions--;
  }
}

/** Analyze the hook (first 3 seconds) of a reel */
async function analyzeHook(
  transcript: string,
  caption: string,
  thumbnailUrl: string,
  segments?: Array<{ start: number; end: number; text: string }>
): Promise<string> {
  let first3sText = "";
  if (segments && segments.length > 0) {
    first3sText = segments
      .filter((s) => s.start < 3)
      .map((s) => s.text)
      .join(" ")
      .trim();
  }

  const prompt = `You are an expert social media content analyst specializing in Instagram Reels.

Analyze the HOOK of this Instagram Reel (the first 3 seconds that capture attention).

**Caption:** ${caption}

**Full Transcript:** ${transcript}

**Audio in first 3 seconds:** ${first3sText || "No speech detected in first 3 seconds"}

Please provide a concise analysis with these sections:

**Audio Hook:** What is said or heard in the first 3 seconds? Identify the specific words, sounds, or music that grab attention.

**Visual Hook (Inferred):** Based on the caption, transcript context, and thumbnail, what visual elements likely appear in the first 3 seconds?

**Hook Type:** Classify the hook type (e.g., Question, Bold Statement, Pattern Interrupt, Curiosity Gap, Controversy, Story Opening, Tutorial Promise, etc.)

**Effectiveness Score:** Rate 1-10 with brief reasoning.

**Improvement Suggestion:** One specific way to make this hook stronger.

Keep the analysis concise and actionable.`;

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a social media content strategist.",
        },
        { role: "user", content: prompt },
      ],
    });

    return (result.choices[0]?.message?.content as string) || "Analysis unavailable";
  } catch (error) {
    return "Hook analysis failed – transcript is still available above.";
  }
}

/** Background job: analyze viral structure and generate a new script */
async function runScriptGeneration(
  scriptId: number,
  originalTranscript: string,
  segments: unknown,
  caption: string,
  topic: string,
  gradeLevel: string
): Promise<void> {
  try {
    // Step 1: Analyze viral structure
    const structurePrompt = `You are an expert viral content analyst specializing in Instagram Reels scripts.

Analyze the following viral Reel transcript and identify its exact structure. Return a JSON object with these fields:

{
  "hook": {
    "type": "string - the pattern type (e.g., 'Bold Statement', 'Negativity Bias', 'Question', 'Shocking Stat', 'Controversial Take', 'Story Opening', 'Direct Address')",
    "text": "string - the exact hook text from the transcript",
    "technique": "string - brief explanation of why this hook works"
  },
  "body": {
    "pacing": "string - how information is delivered (e.g., 'Rapid-fire list', 'Problem-solution', 'Story arc', 'Step-by-step', 'Comparison')",
    "structure": "string - describe the flow of information",
    "keyPoints": ["array of the main points made"]
  },
  "transition": {
    "type": "string - how it moves from problem to solution (e.g., 'But here\\'s the thing...', 'The secret is...', 'What if I told you...')",
    "text": "string - the exact transition text"
  },
  "cta": {
    "type": "string - the closing trigger type (e.g., 'Follow for more', 'Save this', 'Comment below', 'Try this today', 'Link in bio')",
    "text": "string - the exact CTA text"
  },
  "overallTone": "string - the overall tone (e.g., 'authoritative', 'casual', 'urgent', 'educational')",
  "estimatedPace": "string - slow/medium/fast"
}

**Caption:** ${caption}

**Full Transcript:**
${originalTranscript}

Return ONLY valid JSON, no markdown formatting.`;

    const structureResponse = await invokeLLM({
      messages: [
        { role: "system", content: "You are a viral content structure analyst. Always respond with valid JSON only." },
        { role: "user", content: structurePrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "viral_structure",
          strict: true,
          schema: {
            type: "object",
            properties: {
              hook: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                  technique: { type: "string" },
                },
                required: ["type", "text", "technique"],
                additionalProperties: false,
              },
              body: {
                type: "object",
                properties: {
                  pacing: { type: "string" },
                  structure: { type: "string" },
                  keyPoints: { type: "array", items: { type: "string" } },
                },
                required: ["pacing", "structure", "keyPoints"],
                additionalProperties: false,
              },
              transition: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                },
                required: ["type", "text"],
                additionalProperties: false,
              },
              cta: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                },
                required: ["type", "text"],
                additionalProperties: false,
              },
              overallTone: { type: "string" },
              estimatedPace: { type: "string" },
            },
            required: ["hook", "body", "transition", "cta", "overallTone", "estimatedPace"],
            additionalProperties: false,
          },
        },
      },
    });

    let viralStructure: Record<string, unknown>;
    try {
      viralStructure = JSON.parse((String(structureResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      viralStructure = { error: "Failed to parse structure" };
    }

    // Step 2: Generate new script using the viral structure
    const gradeLevelInstruction = gradeLevel === "auto"
      ? "Choose the most appropriate grade level (between Grade 2-6) based on the topic and audience."
      : `Write at a Grade ${gradeLevel} reading level. Use simple vocabulary and short sentences appropriate for that grade level.`;

    const isSameTopic = topic === "SAME_TOPIC";

    const scriptPrompt = isSameTopic
      ? `You are an expert Instagram Reels scriptwriter. Rewrite the following viral Reel script keeping the EXACT SAME TOPIC and core message, but make it sound fresh and original — not a copy.

**VIRAL STRUCTURE ANALYSIS:**
${JSON.stringify(viralStructure, null, 2)}

**ORIGINAL VIRAL TRANSCRIPT:**
${originalTranscript}

**READABILITY REQUIREMENT:**
${gradeLevelInstruction}

**INSTRUCTIONS:**
1. Keep the SAME topic and core message as the original.
2. HOOK: Use the SAME hook pattern type ("${(viralStructure.hook as any)?.type || 'Bold Statement'}") with the same core idea, but rephrase it so it sounds different. Use different words, a slightly different angle, or a fresh way to open.
3. BODY: Cover the SAME key points and arguments but rephrase them. Change the examples, analogies, or supporting details. Keep the same pacing style ("${(viralStructure.body as any)?.pacing || 'Problem-solution'}") and information flow.
4. TRANSITION: Use a similar transition technique ("${(viralStructure.transition as any)?.type || 'pivot'}") but word it differently.
5. CTA: End with a similar call-to-action style ("${(viralStructure.cta as any)?.type || 'engagement'}") but phrase it in your own words.
6. Match the overall tone: "${(viralStructure as any)?.overallTone || 'engaging'}"
7. Keep similar length and pacing to the original.
8. The result should feel like a DIFFERENT PERSON making the same argument — same topic, same structure, but different wording throughout.
9. Do NOT just swap synonyms — genuinely rephrase and restructure sentences while keeping the meaning.

Write the script as spoken text (no stage directions, no [brackets]). Write it exactly as it should be spoken aloud.
Use short paragraphs to indicate natural pauses.
Do NOT include any labels like "Hook:" or "Body:" - just write the flowing script.`
      : `You are an expert Instagram Reels scriptwriter. Using the EXACT viral structure from a proven viral Reel, write a NEW script on a different topic.

**VIRAL STRUCTURE ANALYSIS:**
${JSON.stringify(viralStructure, null, 2)}

**ORIGINAL VIRAL TRANSCRIPT (for reference of style and pacing):**
${originalTranscript}

**NEW TOPIC/ANGLE:**
${topic}

**READABILITY REQUIREMENT:**
${gradeLevelInstruction}

**INSTRUCTIONS:**
1. HOOK: Use the SAME hook pattern type ("${(viralStructure.hook as any)?.type || 'Bold Statement'}") but adapted to the new topic. Keep it punchy and attention-grabbing.
2. BODY: Follow the SAME pacing style ("${(viralStructure.body as any)?.pacing || 'Problem-solution'}") and information structure. Match the number of key points.
3. TRANSITION: Use a similar transition technique ("${(viralStructure.transition as any)?.type || 'pivot'}") adapted to the new topic.
4. CTA: End with a similar call-to-action style ("${(viralStructure.cta as any)?.type || 'engagement'}") but relevant to the new topic.
5. Match the overall tone: "${(viralStructure as any)?.overallTone || 'engaging'}"
6. Keep similar length and pacing to the original.

Write the script as spoken text (no stage directions, no [brackets]). Write it exactly as it should be spoken aloud.
Use short paragraphs to indicate natural pauses.
Do NOT include any labels like "Hook:" or "Body:" - just write the flowing script.`;

    const scriptResponse = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert Instagram Reels scriptwriter. Write natural, spoken scripts that match viral patterns." },
        { role: "user", content: scriptPrompt },
      ],
    });

    const generatedScript = String(scriptResponse.choices[0].message.content || "");

    // Step 3: Hemingway-style readability analysis
    const hemingwayPrompt = `You are a readability analysis engine modeled after the Hemingway Editor. Analyze the following script and return a JSON response.

**SCRIPT:**
${generatedScript}

**TARGET GRADE LEVEL:** ${gradeLevel === "auto" ? "Auto-detect appropriate level" : `Grade ${gradeLevel}`}

Return a JSON object with:
{
  "gradeLevel": number (the Flesch-Kincaid grade level of the text),
  "readingEase": number (Flesch reading ease score, 0-100),
  "wordCount": number,
  "sentenceCount": number,
  "avgWordsPerSentence": number,
  "issues": [
    {
      "type": "passive_voice" | "complex_sentence" | "adverb" | "hard_to_read" | "very_hard_to_read",
      "text": "the exact problematic text",
      "suggestion": "brief suggestion for improvement"
    }
  ],
  "passiveVoiceCount": number,
  "adverbCount": number,
  "hardSentenceCount": number,
  "veryHardSentenceCount": number,
  "overallAssessment": "string - brief assessment of readability"
}

Return ONLY valid JSON.`;

    const hemingwayResponse = await invokeLLM({
      messages: [
        { role: "system", content: "You are a readability analysis engine. Always respond with valid JSON only." },
        { role: "user", content: hemingwayPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "readability_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              gradeLevel: { type: "number" },
              readingEase: { type: "number" },
              wordCount: { type: "number" },
              sentenceCount: { type: "number" },
              avgWordsPerSentence: { type: "number" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    text: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["type", "text", "suggestion"],
                  additionalProperties: false,
                },
              },
              passiveVoiceCount: { type: "number" },
              adverbCount: { type: "number" },
              hardSentenceCount: { type: "number" },
              veryHardSentenceCount: { type: "number" },
              overallAssessment: { type: "string" },
            },
            required: [
              "gradeLevel", "readingEase", "wordCount", "sentenceCount",
              "avgWordsPerSentence", "issues", "passiveVoiceCount", "adverbCount",
              "hardSentenceCount", "veryHardSentenceCount", "overallAssessment"
            ],
            additionalProperties: false,
          },
        },
      },
    });

    let readabilityAnalysis: Record<string, unknown>;
    try {
      readabilityAnalysis = JSON.parse((String(hemingwayResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      readabilityAnalysis = { error: "Failed to parse readability analysis" };
    }

    await updateRecreatedScript(scriptId, {
      viralStructure: viralStructure as any,
      generatedScript: String(generatedScript),
      readabilityAnalysis: readabilityAnalysis as any,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateRecreatedScript(scriptId, {
      status: "failed",
      errorMessage: message,
    });
  }
}

async function runScriptRewrite(
  scriptId: number,
  existingScript: string,
  viralStructure: Record<string, unknown> | null,
  originalTranscript: string,
  caption: string,
  gradeLevel: string,
  targetDuration: string,
  addCues: boolean
): Promise<void> {
  try {
    const gradeLevelInstruction = gradeLevel === "auto"
      ? "Choose the most appropriate grade level (between Grade 2-8) based on the topic and audience."
      : `Write at a Grade ${gradeLevel} reading level. Use simple vocabulary and short sentences appropriate for that grade level.`;

    // Calculate target word count based on duration (average speaking pace ~150 words/minute)
    let durationInstruction = "";
    if (targetDuration !== "any") {
      const seconds = parseInt(targetDuration);
      const targetWords = Math.round((seconds / 60) * 150);
      const minWords = Math.round(targetWords * 0.85);
      const maxWords = Math.round(targetWords * 1.15);
      durationInstruction = `\n**TARGET DURATION:** ${seconds} seconds (~${targetWords} words). Keep the script between ${minWords}-${maxWords} words. Cut or expand content as needed while preserving the viral structure.`;
    }

    let cuesInstruction = "";
    if (addCues) {
      cuesInstruction = `\n**DELIVERY CUES:** Add performance/delivery cues in square brackets throughout the script to guide the speaker on HOW to deliver each line. These cues should be based on analyzing the viral structure and what makes the original engaging. Use cues like:
- [PAUSE] - dramatic pause for emphasis
- [LEAN IN] - get closer to camera, create intimacy
- [SPEED UP] - increase pace for energy/urgency
- [SLOW DOWN] - slow pace for emphasis on key point
- [WHISPER] - lower voice for dramatic effect
- [EMPHASIZE] - stress the next word/phrase
- [LOOK AT CAMERA] - direct eye contact moment
- [GESTURE] - use hand gesture to illustrate
- [RAISE VOICE] - increase volume for impact
- [SMILE] - show enthusiasm/warmth
- [SERIOUS FACE] - convey gravity/importance
- [COUNT ON FINGERS] - enumerate points visually
- [SHAKE HEAD] - express disagreement/disbelief
- [NOD] - affirm the point being made

Place cues at the START of the line they apply to. Every 2-3 lines should have a cue. The cues should create a dynamic, engaging delivery that keeps viewer attention throughout.`;
    }

    const rewritePrompt = `You are an expert Instagram Reels scriptwriter. Rewrite the following script with the specified adjustments.

**CURRENT SCRIPT:**
${existingScript}

${viralStructure ? `**VIRAL STRUCTURE (preserve this pattern):**\n${JSON.stringify(viralStructure, null, 2)}` : ""}

${originalTranscript ? `**ORIGINAL VIRAL TRANSCRIPT (for reference):**\n${originalTranscript}` : ""}

**READABILITY REQUIREMENT:**
${gradeLevelInstruction}
${durationInstruction}
${cuesInstruction}

**INSTRUCTIONS:**
1. Rewrite the script maintaining the same topic, message, and viral structure.
2. Adjust the vocabulary and sentence complexity to match the target grade level.
3. ${targetDuration !== "any" ? `Adjust the length to fit approximately ${targetDuration} seconds of speaking time.` : "Keep similar length."}
4. ${addCues ? "Add delivery cues in [BRACKETS] throughout to guide performance. Make cues specific and actionable." : "Do NOT add any delivery cues or stage directions."}
5. Keep the same hook pattern, body structure, transition, and CTA style.
6. Write as natural spoken text with short paragraphs for natural pauses.
7. Do NOT include labels like "Hook:" or "Body:" - just write the flowing script${addCues ? " with [CUES] inline" : ""}.`;

    const scriptResponse = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert Instagram Reels scriptwriter. Write natural, spoken scripts that match viral patterns." },
        { role: "user", content: rewritePrompt },
      ],
    });

    const rewrittenScript = String(scriptResponse.choices[0].message.content || "");

    // Run readability analysis on the rewritten script
    const hemingwayPrompt = `You are a readability analysis engine. Analyze the following script and return a JSON response.

**SCRIPT:**
${rewrittenScript}

**TARGET GRADE LEVEL:** ${gradeLevel === "auto" ? "Auto-detect appropriate level" : `Grade ${gradeLevel}`}

Return a JSON object with:
{
  "gradeLevel": number (the Flesch-Kincaid grade level of the text),
  "readingEase": number (Flesch reading ease score, 0-100),
  "wordCount": number,
  "sentenceCount": number,
  "avgWordsPerSentence": number,
  "issues": [
    {
      "type": "passive_voice" | "complex_sentence" | "adverb" | "hard_to_read" | "very_hard_to_read",
      "text": "the exact problematic text",
      "suggestion": "brief suggestion for improvement"
    }
  ],
  "passiveVoiceCount": number,
  "adverbCount": number,
  "hardSentenceCount": number,
  "veryHardSentenceCount": number,
  "overallAssessment": "string - brief assessment of readability"
}

Return ONLY valid JSON.`;

    const hemingwayResponse = await invokeLLM({
      messages: [
        { role: "system", content: "You are a readability analysis engine. Always respond with valid JSON only." },
        { role: "user", content: hemingwayPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "readability_analysis",
          strict: true,
          schema: {
            type: "object",
            properties: {
              gradeLevel: { type: "number" },
              readingEase: { type: "number" },
              wordCount: { type: "number" },
              sentenceCount: { type: "number" },
              avgWordsPerSentence: { type: "number" },
              issues: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string" },
                    text: { type: "string" },
                    suggestion: { type: "string" },
                  },
                  required: ["type", "text", "suggestion"],
                  additionalProperties: false,
                },
              },
              passiveVoiceCount: { type: "number" },
              adverbCount: { type: "number" },
              hardSentenceCount: { type: "number" },
              veryHardSentenceCount: { type: "number" },
              overallAssessment: { type: "string" },
            },
            required: [
              "gradeLevel", "readingEase", "wordCount", "sentenceCount",
              "avgWordsPerSentence", "issues", "passiveVoiceCount", "adverbCount",
              "hardSentenceCount", "veryHardSentenceCount", "overallAssessment"
            ],
            additionalProperties: false,
          },
        },
      },
    });

    let readabilityAnalysis: Record<string, unknown>;
    try {
      readabilityAnalysis = JSON.parse((String(hemingwayResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      readabilityAnalysis = { error: "Failed to parse readability analysis" };
    }

    // Preserve the original viral structure
    await updateRecreatedScript(scriptId, {
      viralStructure: viralStructure as any,
      generatedScript: String(rewrittenScript),
      readabilityAnalysis: readabilityAnalysis as any,
      status: "completed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await updateRecreatedScript(scriptId, {
      status: "failed",
      errorMessage: message,
    });
  }
}


/**
 * Background processor for Idea-to-Script.
 * Generates a full reel script from a user's topic idea using AI.
 */
async function processIdeaInBackground(ideaId: number): Promise<void> {
  try {
    // Mark as processing
    await updateScriptIdea(ideaId, { status: "processing" } as any);

    const idea = await getScriptIdeaById(ideaId);
    if (!idea) {
      console.error(`[Ideas] Idea ${ideaId} not found`);
      return;
    }

    const nicheContext = idea.niche ? ` in the ${idea.niche} niche` : "";
    const toneContext = idea.tone || "engaging";
    const gradeLevelInstruction = idea.gradeLevel === "auto"
      ? "Choose the most appropriate reading level for the audience."
      : `Write at a Grade ${idea.gradeLevel} reading level.`;

    // Step 1: Generate a viral structure for the idea
    const structureResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: "You are a viral Instagram Reels content strategist. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: `Create a viral Reel structure for this topic${nicheContext}: "${idea.idea}"

The tone should be ${toneContext}.

Return JSON with:
- hook: { type (question/statistic/bold_claim/story/controversy), text (the actual hook line), technique (why it works) }
- body: { pacing (fast/medium/slow), structure (listicle/story/tutorial/comparison/myth_busting), keyPoints (array of 3-5 main points to cover) }
- transition: { type (pattern_interrupt/visual_change/rhetorical_question), text (transition line) }
- cta: { type (follow/save/share/comment/link), text (the CTA line) }
- overallTone: string
- estimatedPace: string
- suggestedTitle: a catchy title for this script (max 80 chars)`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "viral_idea_structure",
          strict: true,
          schema: {
            type: "object",
            properties: {
              hook: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                  technique: { type: "string" },
                },
                required: ["type", "text", "technique"],
                additionalProperties: false,
              },
              body: {
                type: "object",
                properties: {
                  pacing: { type: "string" },
                  structure: { type: "string" },
                  keyPoints: { type: "array", items: { type: "string" } },
                },
                required: ["pacing", "structure", "keyPoints"],
                additionalProperties: false,
              },
              transition: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                },
                required: ["type", "text"],
                additionalProperties: false,
              },
              cta: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                },
                required: ["type", "text"],
                additionalProperties: false,
              },
              overallTone: { type: "string" },
              estimatedPace: { type: "string" },
              suggestedTitle: { type: "string" },
            },
            required: ["hook", "body", "transition", "cta", "overallTone", "estimatedPace", "suggestedTitle"],
            additionalProperties: false,
          },
        },
      },
    });

    let viralStructure: Record<string, any>;
    try {
      viralStructure = JSON.parse((String(structureResponse.choices[0].message.content) || "{}").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    } catch {
      viralStructure = { error: "Failed to parse structure" };
    }

    const suggestedTitle = viralStructure.suggestedTitle || `Script: ${idea.idea.substring(0, 60)}`;

    // Step 2: Generate the full script based on the structure
    const scriptResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are an expert Instagram Reels scriptwriter who creates viral, engaging scripts. Write scripts as spoken text — short paragraphs for natural pauses. No labels, no headers, no stage directions. Just the words the creator will say on camera.`,
        },
        {
          role: "user",
          content: `Write a complete Instagram Reel script for this topic${nicheContext}: "${idea.idea}"

Use this viral structure:
${JSON.stringify(viralStructure, null, 2)}

Requirements:
- Tone: ${toneContext}
- ${gradeLevelInstruction}
- Start with the hook immediately — no intro
- Keep it between 150-300 words (30-60 second reel)
- Use short paragraphs (1-2 sentences each) for natural speaking pauses
- End with a strong CTA
- Write as spoken text only — no labels, headers, or stage directions
- Make it feel natural and conversational, not scripted`,
        },
      ],
    });

    const generatedScript = String(scriptResponse.choices[0].message.content || "");

    // Update the idea with the generated content
    await updateScriptIdea(ideaId, {
      generatedScript,
      generatedTitle: suggestedTitle,
      viralStructure: viralStructure as any,
      status: "completed",
    } as any);

    console.log(`[Ideas] Successfully generated script for idea ${ideaId}: "${suggestedTitle}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Ideas] Failed to process idea ${ideaId}:`, message);
    await updateScriptIdea(ideaId, {
      status: "failed",
      errorMessage: message,
    } as any);
  }
}


/**
 * AI validates an idea before script generation.
 * Checks if the idea is clear, specific, and has viral potential.
 * Suggests improvements and assigns a viral score.
 */
async function validateIdeaInBackground(ideaId: number) {
  try {
    await updateScriptIdea(ideaId, { status: "validating" } as any);
    const idea = await getScriptIdeaById(ideaId);
    if (!idea) throw new Error("Idea not found");

    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a viral Instagram Reels content strategist. Your job is to evaluate content ideas and suggest improvements to maximize viral potential.

Evaluate the idea on these criteria:
1. Clarity - Is the idea specific enough to create a script from?
2. Hook potential - Can this grab attention in the first 1-2 seconds?
3. Relatability - Will the target audience connect with this?
4. Shareability - Would people share this with friends?
5. Trend alignment - Does it align with current social media trends?

Provide:
- A viral score from 1-10
- A brief reasoning (2-3 sentences) explaining the score
- An improved/refined version of the idea that would perform better
- Keep the improved version concise (1-2 sentences max)

If the idea is already great (8+), the suggestion can be similar to the original with minor tweaks.`
        },
        {
          role: "user",
          content: `Evaluate this Instagram Reel idea:\n\n"${idea.idea}"${idea.niche ? `\n\nNiche/Category: ${idea.niche}` : ""}${idea.tone ? `\nDesired tone: ${idea.tone}` : ""}`
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "idea_validation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              viralScore: { type: "number", description: "Score from 1-10" },
              reasoning: { type: "string", description: "2-3 sentence explanation of the score" },
              improvedIdea: { type: "string", description: "Refined version of the idea optimized for viral potential" },
            },
            required: ["viralScore", "reasoning", "improvedIdea"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error("No validation response from AI");

    const contentStr = typeof content === "string" ? content : "";
    const validation = JSON.parse(contentStr.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());

    await updateScriptIdea(ideaId, {
      aiSuggestion: validation.improvedIdea,
      aiReasoning: validation.reasoning,
      viralScore: Math.min(10, Math.max(1, Math.round(Number(validation.viralScore) || 5))),
      validationStatus: "validated",
      status: "awaiting_approval",
    } as any);

    console.log(`[Ideas] Validated idea ${ideaId}: score ${validation.viralScore}/10`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Ideas] Validation failed for idea ${ideaId}:`, message);
    await updateScriptIdea(ideaId, {
      status: "failed",
      errorMessage: `Validation failed: ${message}`,
    } as any);
  }
}
