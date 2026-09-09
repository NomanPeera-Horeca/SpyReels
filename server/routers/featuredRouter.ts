import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { featuredAccounts, featuredReels, niches, featuredAccountNiches, transcriptions, scrapeJobs, users } from "../../drizzle/schema";
import type { Transcription, Reel } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { accountEngagementRatePercent } from "../accountEngagementRate";
import { getDb, transcriptionViewFromFeaturedReelRow, updateScrapeJob, seedDemoScrape } from "../db";
import { fetchProfile } from "../instagram";
import { ensureProfilePicOnR2 } from "../profilePicR2";
import { clientIpFromRequest, isPublicIpRateLimited } from "../publicRateLimit";
import { reelNicheInputEnum } from "../reelNicheInputEnum";
import { ensureReelThumbnailOnR2 } from "../reelThumbnailR2";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "../utils/sanitizeAiOutput";
import { normalizeInstagramHandle, isValidInstagramHandleNormalized, INSTAGRAM_HANDLE_INVALID_MESSAGE } from "@shared/instagramHandle";
import { PUBLIC_DEMO_HANDLES, PUBLIC_DEMO_REEL_LIMIT, isPublicDemoHandle } from "@shared/publicDemoAccounts";
import { and, or, eq, ne, sql, desc, not, asc, inArray } from "drizzle-orm";
import { PUBLIC_TIKTOK_DEMO_CACHE_TTL_MS, PUBLIC_TIKTOK_DEMO_EMPTY_CACHE_TTL_MS, PublicTikTokDemoPayload, publicTikTokDemoCache, emptyPublicTikTokDemoPayload, readPublicTikTokDemoCache, writePublicTikTokDemoCache } from "./_shared";

function formatBestPostingTime(
  day: string | null,
  hour: number | null
): string | null {
  if (day == null || hour == null) return null;
  const weekendDays = new Set(["saturday", "sunday"]);
  const dayLower = day.toLowerCase();
  const is12h = ((hour + 11) % 12) + 1;
  const ampm = hour < 12 ? "AM" : "PM";
  const timeStr = `${is12h} ${ampm}`;
  // "Posts weekdays around 2 PM" vs "Posts Sundays around 10 AM".
  if (weekendDays.has(dayLower)) {
    const capitalized = dayLower.charAt(0).toUpperCase() + dayLower.slice(1);
    return `Posts ${capitalized}s around ${timeStr}`;
  }
  return `Posts weekdays around ${timeStr}`;
}


type PublicDemoPayload = {
  handle: string;
  totalReelCount: number;
  medianViewCount: number;
  reels: {
    id: number;
    reelShortcode: string;
    caption: string;
    viewCount: number;
    likeCount: number;
    commentCount: number;
    engagementRate: number;
    thumbnailUrl: string;
    duration: number | null;
    postedAt: Date;
    transcriptionStatus: string;
    contentType: string | null;
    hookPattern: string | null;
    productionFormat: string | null;
    viralFlag: boolean | null;
    confidence: number | null;
  }[];
};

const PUBLIC_DEMO_CACHE_TTL_MS = 10 * 60 * 1000;

const PUBLIC_DEMO_EMPTY_CACHE_TTL_MS = 90 * 1000;

const publicDemoCache = new Map<string, { expiresAt: number; payload: PublicDemoPayload }>();

type PublicProfilePreviewPayload =
  | {
      found: true;
      username: string;
      fullName: string;
      biography: string;
      profilePicUrl: string;
      followerCount: number;
      followingCount: number;
      postCount: number;
      isVerified: boolean;
      isPrivate: boolean;
      category: string;
      externalUrl: string;
    }
  | {
      found: false;
      error: string;
    };

const PUBLIC_PROFILE_PREVIEW_TTL_MS = 5 * 60_000;

const publicProfilePreviewCache = new Map<
  string,
  { expiresAt: number; payload: PublicProfilePreviewPayload }
>();

function readPublicProfilePreviewCache(
  handle: string
): PublicProfilePreviewPayload | null {
  const hit = publicProfilePreviewCache.get(handle);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    publicProfilePreviewCache.delete(handle);
    return null;
  }
  return hit.payload;
}


function writePublicProfilePreviewCache(
  handle: string,
  payload: PublicProfilePreviewPayload
): void {
  publicProfilePreviewCache.set(handle, {
    expiresAt: Date.now() + PUBLIC_PROFILE_PREVIEW_TTL_MS,
    payload,
  });
}


export const publicDemoProbeStats = {
  requests: 0,
  cacheHitFull: 0,
  cacheHitEmpty: 0,
  accountQueries: 0,
  countQueries: 0,
  medianQueries: 0,
  reelListQueries: 0,
  healJobsStarted: 0,
  emptyCacheWrites: 0,
  fullCacheWrites: 0,
};

function emptyPublicDemoPayload(handle: string): PublicDemoPayload {
  return { handle, totalReelCount: 0, medianViewCount: 0, reels: [] };
}


function readPublicDemoCache(handle: string): PublicDemoPayload | null {
  const hit = publicDemoCache.get(handle);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    publicDemoCache.delete(handle);
    return null;
  }
  return hit.payload;
}


function writePublicDemoCache(handle: string, payload: PublicDemoPayload): void {
  const empty = payload.reels.length === 0;
  publicDemoCache.set(handle, {
    expiresAt:
      Date.now() +
      (empty ? PUBLIC_DEMO_EMPTY_CACHE_TTL_MS : PUBLIC_DEMO_CACHE_TTL_MS),
    payload,
  });
  if (empty) publicDemoProbeStats.emptyCacheWrites += 1;
  else publicDemoProbeStats.fullCacheWrites += 1;
}


export function resetPublicDemoProbeStats(): void {
  publicDemoProbeStats.requests = 0;
  publicDemoProbeStats.cacheHitFull = 0;
  publicDemoProbeStats.cacheHitEmpty = 0;
  publicDemoProbeStats.accountQueries = 0;
  publicDemoProbeStats.countQueries = 0;
  publicDemoProbeStats.medianQueries = 0;
  publicDemoProbeStats.reelListQueries = 0;
  publicDemoProbeStats.healJobsStarted = 0;
  publicDemoProbeStats.emptyCacheWrites = 0;
  publicDemoProbeStats.fullCacheWrites = 0;
}


export function clearPublicDemoCache(): void {
  publicDemoCache.clear();
}


async function featuredAccountMedianViewCount(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  reelFilter: ReturnType<typeof and>,
  totalReelCount: number
): Promise<number> {
  if (totalReelCount <= 0) return 0;
  publicDemoProbeStats.medianQueries += 1;
  const offset = Math.floor((totalReelCount - 1) / 2);
  const limit = totalReelCount % 2 === 0 ? 2 : 1;
  const midRows = await db
    .select({ viewCount: featuredReels.viewCount })
    .from(featuredReels)
    .where(reelFilter)
    .orderBy(asc(featuredReels.viewCount))
    .limit(limit)
    .offset(offset);
  if (midRows.length === 0) return 0;
  if (midRows.length === 1) return midRows[0].viewCount;
  return Math.round((midRows[0].viewCount + midRows[1].viewCount) / 2);
}


export const featuredRouter = router({
    /**
     * Public, read-only demo slice of the curated featured catalog. Powers the
     * logged-out /features/viral-reel-finder marketing page, so it is the one
     * unauthenticated procedure in this router: restricted to the
     * `PUBLIC_DEMO_HANDLES` allow-list, capped at `PUBLIC_DEMO_REEL_LIMIT`
     * rows, and returning display fields only — never transcript text,
     * videoUrl, or account/user ids.
     *
     * If the requested allow-listed handle is inactive or has zero usable
     * reels, walks the rest of the allow-list so the marketing page never
     * renders an empty grid.
     */
    publicDemo: publicProcedure
      .input(z.object({ handle: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        publicDemoProbeStats.requests += 1;
        const ip = clientIpFromRequest(ctx.req);
        if (isPublicIpRateLimited(ip)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests. Please try again in a minute.",
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database unavailable",
          });
        }

        const requested = normalizeInstagramHandle(input?.handle ?? "");
        const tryOrder: string[] = [];
        if (isPublicDemoHandle(requested)) tryOrder.push(requested);
        for (const h of PUBLIC_DEMO_HANDLES) {
          if (!tryOrder.includes(h)) tryOrder.push(h);
        }

        for (const handle of tryOrder) {
          const cached = readPublicDemoCache(handle);
          if (cached) {
            if (cached.reels.length > 0) {
              publicDemoProbeStats.cacheHitFull += 1;
              return cached;
            }
            // Cached empty/degraded: skip DB + heal jobs, try next handle.
            publicDemoProbeStats.cacheHitEmpty += 1;
            continue;
          }

          publicDemoProbeStats.accountQueries += 1;
          const accountRows = await db
            .select({
              id: featuredAccounts.id,
              handle: featuredAccounts.handle,
              followerCount: featuredAccounts.followerCount,
            })
            .from(featuredAccounts)
            .where(
              and(eq(featuredAccounts.handle, handle), eq(featuredAccounts.isActive, true))
            )
            .limit(1);

          if (accountRows.length === 0) {
            writePublicDemoCache(handle, emptyPublicDemoPayload(handle));
            continue;
          }

          const acc = accountRows[0];
          const reelFilter = and(
            eq(featuredReels.featuredAccountId, acc.id),
            ne(featuredReels.transcriptionStatus, "failed")
          );

          publicDemoProbeStats.countQueries += 1;
          const [countRow] = await db
            .select({ c: sql<number>`COUNT(*)` })
            .from(featuredReels)
            .where(reelFilter);
          const totalReelCount = Number(countRow?.c ?? 0);

          if (totalReelCount === 0) {
            writePublicDemoCache(handle, emptyPublicDemoPayload(handle));
            continue;
          }

          const medianViewCount = await featuredAccountMedianViewCount(
            db,
            reelFilter,
            totalReelCount
          );

          // Over-fetch so we can still return a full page when some top rows
          // still point at expired Instagram CDN thumbs.
          const CANDIDATE_LIMIT = Math.max(PUBLIC_DEMO_REEL_LIMIT * 2, 16);
          publicDemoProbeStats.reelListQueries += 1;
          const reelRows = await db
            .select({
              id: featuredReels.id,
              reelShortcode: featuredReels.reelShortcode,
              caption: featuredReels.caption,
              viewCount: featuredReels.viewCount,
              likeCount: featuredReels.likeCount,
              commentCount: featuredReels.commentCount,
              engagementRate: featuredReels.engagementRate,
              thumbnailUrl: featuredReels.thumbnailUrl,
              duration: featuredReels.duration,
              postedAt: featuredReels.postedAt,
              transcriptionStatus: featuredReels.transcriptionStatus,
              contentType: featuredReels.contentType,
              hookPattern: featuredReels.hookPattern,
              productionFormat: featuredReels.productionFormat,
              viralFlag: featuredReels.viralFlag,
              confidence: featuredReels.confidence,
            })
            .from(featuredReels)
            .where(reelFilter)
            .orderBy(desc(featuredReels.viewCount))
            .limit(CANDIDATE_LIMIT);

          if (reelRows.length === 0) {
            writePublicDemoCache(handle, emptyPublicDemoPayload(handle));
            continue;
          }

          const followerCount = acc.followerCount || 0;
          const r2PublicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(
            /\/+$/,
            ""
          );

          const isStableThumb = (url: string) => {
            if (!url) return false;
            if (r2PublicBase && url.startsWith(r2PublicBase)) return true;
            try {
              const host = new URL(url).host;
              return host.endsWith(".r2.dev") || host.includes("cloudfront.net");
            } catch {
              return false;
            }
          };

          const looksLikeCdn = (url: string) =>
            /cdninstagram\.com|fbcdn\.net|instagram\.com/i.test(url);

          // Prefer already-stable R2 thumbs on the read path. CDN rows are
          // skipped for this response and healed fire-and-forget so an
          // anonymous GET never blocks on CDN download + R2 write.
          const usable: PublicDemoPayload["reels"] = [];
          const healJobs: Promise<void>[] = [];

          for (const r of reelRows) {
            if (usable.length >= PUBLIC_DEMO_REEL_LIMIT) break;

            const rawThumb = (r.thumbnailUrl ?? "").trim();
            if (!rawThumb) continue;

            if (!isStableThumb(rawThumb)) {
              if (looksLikeCdn(rawThumb)) {
                publicDemoProbeStats.healJobsStarted += 1;
                healJobs.push(
                  (async () => {
                    const healed = await ensureReelThumbnailOnR2(
                      r.reelShortcode,
                      rawThumb
                    );
                    if (!isStableThumb(healed) || healed === rawThumb) return;
                    await db
                      .update(featuredReels)
                      .set({ thumbnailUrl: healed })
                      .where(eq(featuredReels.id, r.id));
                  })().catch((err) => {
                    console.warn(
                      `[featured.publicDemo] background thumb heal failed for ${r.reelShortcode}:`,
                      err instanceof Error ? err.message : err
                    );
                  })
                );
              }
              continue;
            }

            usable.push({
              id: r.id,
              reelShortcode: r.reelShortcode,
              caption: r.caption ?? "",
              viewCount: r.viewCount,
              likeCount: r.likeCount,
              commentCount: r.commentCount,
              engagementRate:
                followerCount > 0
                  ? accountEngagementRatePercent(
                      r.likeCount,
                      r.commentCount,
                      followerCount
                    )
                  : Number(r.engagementRate ?? 0),
              thumbnailUrl: rawThumb,
              duration: r.duration,
              postedAt: r.postedAt,
              transcriptionStatus: r.transcriptionStatus,
              contentType: r.contentType ?? null,
              hookPattern: r.hookPattern ?? null,
              productionFormat: r.productionFormat ?? null,
              viralFlag: r.viralFlag,
              confidence: r.confidence ?? null,
            });
          }

          if (healJobs.length > 0) {
            void Promise.allSettled(healJobs);
          }

          if (usable.length === 0) {
            writePublicDemoCache(handle, emptyPublicDemoPayload(handle));
            continue;
          }

          if (usable.length < PUBLIC_DEMO_REEL_LIMIT) {
            console.warn(
              `[featured.publicDemo] handle=@${acc.handle} only returned ${usable.length}/${PUBLIC_DEMO_REEL_LIMIT} reels with stable thumbnails (candidates=${reelRows.length})`
            );
          }

          const payload: PublicDemoPayload = {
            handle: acc.handle,
            totalReelCount,
            medianViewCount,
            reels: usable,
          };

          writePublicDemoCache(handle, payload);
          return payload;
        }

        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This creator isn't available",
        });
      }),

    /**
     * Unauthenticated profile lookup for the viral reel finder landing hero.
     * Same payload shape as `scrape.profilePreview`, with the shared public IP
     * rate limit plus a short in-memory cache so anonymous typing does not
     * re-hit ScrapeCreators on every keystroke debounce.
     */
    publicProfilePreview: publicProcedure
      .input(z.object({ handle: z.string().min(1).max(128) }))
      .query(async ({ ctx, input }) => {
        const ip = clientIpFromRequest(ctx.req);
        if (isPublicIpRateLimited(ip)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests. Please try again in a minute.",
          });
        }

        const normalized = normalizeInstagramHandle(input.handle);
        if (!isValidInstagramHandleNormalized(normalized)) {
          return {
            found: false as const,
            error: INSTAGRAM_HANDLE_INVALID_MESSAGE,
          };
        }

        const cached = readPublicProfilePreviewCache(normalized);
        if (cached) return cached;

        try {
          const profile = await fetchProfile(normalized);
          const cleanHandle = normalizeInstagramHandle(profile.username);
          const proxiedPicUrl = await ensureProfilePicOnR2(
            cleanHandle,
            profile.profilePicUrl
          );
          const payload = {
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
          writePublicProfilePreviewCache(normalized, payload);
          return payload;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Profile not found";
          const payload = {
            found: false as const,
            error: message,
          };
          writePublicProfilePreviewCache(normalized, payload);
          return payload;
        }
      }),

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
        .leftJoin(
          featuredReels,
          and(
            eq(featuredReels.featuredAccountId, featuredAccounts.id),
            ne(featuredReels.transcriptionStatus, "failed")
          )
        )
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
     * Read-only featured catalog dashboard: account + reels from
     * `featured_*` tables (no per-user scrape_jobs copy). Transcription
     * join via `transcriptions.featuredReelId` is stubbed empty until
     * migration 0028 / Commit 3a.
     */
    getDashboardData: protectedProcedure
      .input(
        z.object({
          featuredAccountId: z.number().int().positive(),
          niche: reelNicheInputEnum.optional(),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database unavailable",
          });
        }

        const accountRows = await db
          .select({
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            profilePicUrl: featuredAccounts.profilePicUrl,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            bestPostingHour: featuredAccounts.bestPostingHour,
            bestPostingDay: featuredAccounts.bestPostingDay,
          })
          .from(featuredAccounts)
          .where(
            and(
              eq(featuredAccounts.id, input.featuredAccountId),
              eq(featuredAccounts.isActive, true)
            )
          )
          .limit(1);

        if (accountRows.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This creator isn't available",
          });
        }

        const acc = accountRows[0];

        const nicheRows = await db
          .select({ slug: niches.slug, name: niches.name })
          .from(featuredAccountNiches)
          .innerJoin(niches, eq(niches.id, featuredAccountNiches.nicheId))
          .where(
            and(
              eq(featuredAccountNiches.accountId, acc.id),
              eq(featuredAccountNiches.isPrimary, true)
            )
          )
          .limit(1);

        const classifiedNicheSlug = nicheRows[0]?.slug ?? null;
        const primaryNicheName = nicheRows[0]?.name ?? "";

        const reelRows = await db
          .select()
          .from(featuredReels)
          .where(
            and(
              eq(featuredReels.featuredAccountId, acc.id),
              ne(featuredReels.transcriptionStatus, "failed"),
              ...(input.niche ? [eq(featuredReels.niche, input.niche as NonNullable<Reel["niche"]>)] : [])
            )
          )
          .orderBy(desc(featuredReels.viewCount));

        const fc = acc.followerCount || 0;

        const reels = reelRows.map((r) => ({
          id: r.id,
          featuredReelId: r.id,
          shortcode: r.reelShortcode,
          thumbnailUrl: r.thumbnailUrl ?? "",
          videoUrl: r.videoUrl ?? "",
          caption: r.caption ?? "",
          viewCount: r.viewCount,
          likeCount: r.likeCount,
          commentCount: r.commentCount,
          duration: r.duration,
          postedAt: r.postedAt,
          reelUrl: `https://www.instagram.com/reel/${r.reelShortcode}/`,
          ownerUsername: acc.handle,
          engagementRate: accountEngagementRatePercent(
            r.likeCount,
            r.commentCount,
            fc
          ),
          transcription: transcriptionViewFromFeaturedReelRow(r),
          contentType: r.contentType ?? null,
          remakeabilityScore: r.remakeabilityScore ?? null,
          suggestedAction: r.suggestedAction ?? null,
          classificationReason: r.classificationReason ?? null,
          classifiedAt: r.classifiedAt ?? null,
          niche: r.niche ?? null,
          hookPattern: r.hookPattern ?? null,
          productionFormat: r.productionFormat ?? null,
          thumbnailText: r.thumbnailText ?? null,
          viralFlag: r.viralFlag ?? false,
          confidence: r.confidence ?? null,
        }));

        return {
          isFeaturedView: true as const,
          account: {
            id: acc.id,
            handle: acc.handle,
            displayName: acc.displayName ?? "",
            profilePicUrl: acc.profilePicUrl ?? "",
            followerCount: acc.followerCount,
            avgEngagement: Number(acc.avgEngagementRate),
            classifiedNicheSlug,
            primaryNicheName,
            // Commit 6 — formatted best posting window for the dashboard
            // header. Null when either column is null (backfill hasn't
            // run or the account has zero reels). Formatting lives on the
            // server so mobile + desktop + any future surface render
            // identically.
            bestPostingTime: formatBestPostingTime(
              acc.bestPostingDay,
              acc.bestPostingHour
            ),
          },
          followerCount: fc,
          reels,
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
            and(
              eq(featuredReels.featuredAccountId, featuredAccounts.id),
              ne(featuredReels.transcriptionStatus, "failed")
            )
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
     * Batch version of `accountsByNiche` for the /onboarding Step 2 UI
     * (spec §3). Takes N slugs, returns a map of slug → accounts using
     * the exact same creator shape and filter rules as the single-slug
     * endpoint. Keeps the onboarding page to one round-trip regardless
     * of how many niches the user picked.
     *
     * Slugs are deduped up front. Unknown slugs resolve to an empty
     * array rather than throwing — the UI shows an empty state for
     * empty sections, which is the same behavior it needs for niches
     * with zero active creators anyway (edge case #3).
     */
    accountsByNicheSlugs: protectedProcedure
      .input(z.object({ slugs: z.array(z.string().trim().min(1)).min(1).max(30) }))
      .query(async ({ input }) => {
        const db = await getDb();
        const dedupedSlugs = Array.from(new Set(input.slugs));

        // Seed the output map so every requested slug has an entry
        // (empty array for unknowns / no-creator niches). Downstream
        // code can rely on `result[slug]` existing without a defined
        // check.
        const grouped: Record<
          string,
          {
            id: number;
            handle: string;
            displayName: string;
            followerCount: number;
            avgEngagementRate: number;
            profilePicUrl: string;
            totalReelsEver: number;
            reelsAvailable: number;
          }[]
        > = {};
        for (const slug of dedupedSlugs) grouped[slug] = [];

        // Single join covers all slugs; we partition by slug client-
        // side (cheaper than N queries). Filter rules match
        // `accountsByNiche` exactly: active accounts with ≥1 stored
        // reel, sorted by follower count desc within each niche.
        const rows = await db!
          .select({
            slug: niches.slug,
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            profilePicUrl: featuredAccounts.profilePicUrl,
            totalReelsEver: featuredAccounts.totalReelsEver,
            reelsAvailable: sql<number>`COUNT(${featuredReels.id})`,
          })
          .from(niches)
          .innerJoin(featuredAccountNiches, eq(featuredAccountNiches.nicheId, niches.id))
          .innerJoin(
            featuredAccounts,
            and(
              eq(featuredAccounts.id, featuredAccountNiches.accountId),
              eq(featuredAccounts.isActive, true)
            )
          )
          .leftJoin(
            featuredReels,
            and(
              eq(featuredReels.featuredAccountId, featuredAccounts.id),
              ne(featuredReels.transcriptionStatus, "failed")
            )
          )
          .where(inArray(niches.slug, dedupedSlugs))
          .groupBy(
            niches.slug,
            featuredAccounts.id,
            featuredAccounts.handle,
            featuredAccounts.displayName,
            featuredAccounts.followerCount,
            featuredAccounts.avgEngagementRate,
            featuredAccounts.profilePicUrl,
            featuredAccounts.totalReelsEver
          )
          .having(sql`COUNT(${featuredReels.id}) > 0`)
          .orderBy(asc(niches.slug), desc(featuredAccounts.followerCount));

        for (const r of rows) {
          grouped[r.slug].push({
            id: r.id,
            handle: r.handle,
            displayName: r.displayName ?? "",
            followerCount: r.followerCount,
            avgEngagementRate: Number(r.avgEngagementRate),
            profilePicUrl: r.profilePicUrl ?? "",
            totalReelsEver: r.totalReelsEver,
            reelsAvailable: Number(r.reelsAvailable),
          });
        }

        return { groups: grouped };
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
          .where(
            and(
              eq(featuredReels.featuredAccountId, input.accountId),
              ne(featuredReels.transcriptionStatus, "failed")
            )
          )
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
     * Resolve a catalog featured account by Instagram handle: stable id
     * plus primary niche (or first niche by `sortOrder` when no primary
     * flag). Used by the job dashboard sidebar to (a) exclude the current
     * creator from `relatedCreators` and (b) derive niche for demo jobs
     * when `classifiedNicheSlug` is unset.
     */
    accountContextByHandle: protectedProcedure
      .input(z.object({ handle: z.string().trim().min(1).max(128) }))
      .query(async ({ input }) => {
        const db = await getDb();
        const normalized = input.handle.replace(/^@/, "").trim().toLowerCase();

        const rows = await db!
          .select({
            featuredAccountId: featuredAccounts.id,
            nicheSlug: niches.slug,
            nicheName: niches.name,
            isPrimary: featuredAccountNiches.isPrimary,
          })
          .from(featuredAccounts)
          .innerJoin(
            featuredAccountNiches,
            eq(featuredAccountNiches.accountId, featuredAccounts.id)
          )
          .innerJoin(niches, eq(niches.id, featuredAccountNiches.nicheId))
          .where(
            and(eq(featuredAccounts.handle, normalized), eq(featuredAccounts.isActive, true))
          )
          .orderBy(desc(featuredAccountNiches.isPrimary), asc(niches.sortOrder))
          .limit(1);

        if (rows.length === 0) {
          return {
            featuredAccountId: null as number | null,
            nicheSlug: null as string | null,
            nicheName: null as string | null,
          };
        }

        return {
          featuredAccountId: rows[0].featuredAccountId,
          nicheSlug: rows[0].nicheSlug,
          nicheName: rows[0].nicheName,
        };
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
            and(
              eq(featuredReels.featuredAccountId, featuredAccounts.id),
              ne(featuredReels.transcriptionStatus, "failed")
            )
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
     * Featured accounts matching onboarding “picked” handles. Same
     * anti-empty guard as `relatedCreators` (at least one stored reel),
     * ordered by followers desc.
     */
    creatorsByHandles: protectedProcedure
      .input(
        z.object({
          handles: z.array(z.string().trim().min(1)).min(1).max(5),
          excludeHandle: z.string().trim().optional(),
          limit: z.number().int().positive().max(20).default(5),
        })
      )
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) {
          return [] as {
            id: number;
            handle: string;
            displayName: string;
            followerCount: number;
            avgEngagementRate: number;
            profilePicUrl: string;
            nicheName: string;
          }[];
        }
        const exclude = input.excludeHandle
          ?.replace(/^@/, "")
          .trim()
          .toLowerCase();
        const unique = new Set(
          input.handles
            .map((h) => h.replace(/^@/, "").trim().toLowerCase())
            .filter(Boolean)
        );
        if (exclude) unique.delete(exclude);
        const list = Array.from(unique).slice(0, 5);
        if (list.length === 0) return [];

        const whereClauses = [
          inArray(featuredAccounts.handle, list),
          eq(featuredAccounts.isActive, true),
        ];

        const rows = await db
          .select({
            id: featuredAccounts.id,
            handle: featuredAccounts.handle,
            displayName: featuredAccounts.displayName,
            followerCount: featuredAccounts.followerCount,
            avgEngagementRate: featuredAccounts.avgEngagementRate,
            profilePicUrl: featuredAccounts.profilePicUrl,
          })
          .from(featuredAccounts)
          .leftJoin(
            featuredReels,
            and(
              eq(featuredReels.featuredAccountId, featuredAccounts.id),
              ne(featuredReels.transcriptionStatus, "failed")
            )
          )
          .where(and(...whereClauses))
          .groupBy(
            featuredAccounts.id,
            featuredAccounts.handle,
            featuredAccounts.displayName,
            featuredAccounts.followerCount,
            featuredAccounts.avgEngagementRate,
            featuredAccounts.profilePicUrl
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
          nicheName: "",
        }));
      }),

    /**
     * Top recent reels in the user’s onboarding niches (by primary niche tag),
     * posted in the last 7 days, for the “Going viral” sidebar.
     */
    goingViralByNiches: protectedProcedure
      .input(
        z.object({
          slugs: z.array(z.string().trim().min(1)).max(5),
        })
      )
      .query(async ({ input }) => {
        const slugs = Array.from(
          new Set(input.slugs.map((s) => s.trim().toLowerCase()).filter(Boolean))
        ).slice(0, 5);
        if (slugs.length === 0) return [];

        const db = await getDb();
        if (!db) return [];

        const rows = await db
          .select({
            reelId: featuredReels.id,
            shortcode: featuredReels.reelShortcode,
            caption: featuredReels.caption,
            thumbnailUrl: featuredReels.thumbnailUrl,
            viewCount: featuredReels.viewCount,
            creatorHandle: featuredAccounts.handle,
            creatorName: featuredAccounts.displayName,
            profilePicUrl: featuredAccounts.profilePicUrl,
            featuredAccountId: featuredAccounts.id,
          })
          .from(featuredReels)
          .innerJoin(
            featuredAccounts,
            eq(featuredReels.featuredAccountId, featuredAccounts.id)
          )
          .innerJoin(
            featuredAccountNiches,
            and(
              eq(featuredAccountNiches.accountId, featuredAccounts.id),
              eq(featuredAccountNiches.isPrimary, true)
            )
          )
          .innerJoin(
            niches,
            and(
              eq(niches.id, featuredAccountNiches.nicheId),
              inArray(niches.slug, slugs)
            )
          )
          .where(
            and(
              eq(featuredAccounts.isActive, true),
              ne(featuredReels.transcriptionStatus, "failed"),
              sql`${featuredReels.postedAt} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
            )
          )
          .orderBy(desc(featuredReels.viewCount))
          .limit(5);

        return rows.map((r) => ({
          reelId: String(r.reelId),
          shortcode: r.shortcode,
          caption: r.caption ?? "",
          thumbnailUrl: r.thumbnailUrl ?? "",
          viewCount: r.viewCount,
          creatorHandle: r.creatorHandle,
          creatorName: r.creatorName ?? "",
          profilePicUrl: r.profilePicUrl ?? "",
          featuredAccountId: String(r.featuredAccountId),
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
                eq(scrapeJobs.workspaceId, ctx.workspaceId)
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
              content: withAiFormattingRules(
                "You classify Instagram creators into niches. Respond with valid JSON only, no prose, no markdown, no code fences."
              ),
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
          parsed = sanitizeAiOutputDeep(JSON.parse(raw));
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

    /**
     * Resolve a user-scoped demo scrape job for a featured account id.
     * Used by /dashboard?featuredAccountId=<id> deep-links from /research:
     *
     * - If this user already has a demo job for the creator handle, reuse it.
     * - Otherwise seed one on demand via seedDemoScrape.
     *
     * Mutation (not query) because it may write a new scrape_jobs row.
     */
    ensureDemoJob: protectedProcedure
      .input(z.object({ featuredAccountId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();

        const accountRows = await db!
          .select({
            handle: featuredAccounts.handle,
            isActive: featuredAccounts.isActive,
          })
          .from(featuredAccounts)
          .where(eq(featuredAccounts.id, input.featuredAccountId))
          .limit(1);

        if (accountRows.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Featured creator not found",
          });
        }

        const account = accountRows[0];
        const existingDemo = await db!
          .select({ id: scrapeJobs.id })
          .from(scrapeJobs)
          .where(
            and(
              eq(scrapeJobs.workspaceId, ctx.workspaceId),
              eq(scrapeJobs.handle, account.handle),
              eq(scrapeJobs.isDemo, true),
              eq(scrapeJobs.status, "completed")
            )
          )
          .orderBy(desc(scrapeJobs.createdAt))
          .limit(1);

        // If the creator was deactivated after this user already got a demo
        // copy, keep serving the existing job.
        if (existingDemo.length > 0) {
          return { jobId: existingDemo[0].id };
        }

        if (!account.isActive) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Featured creator is unavailable",
          });
        }

        const ENSURE_DEMO_SEED_TIMEOUT_MS = 30_000;
        let seededJobId: number | null;
        try {
          seededJobId = await Promise.race([
            seedDemoScrape(ctx.user.id, account.handle),
            new Promise<never>((_, reject) => {
              setTimeout(() => {
                const err = new Error("ENSURE_DEMO_JOB_SEED_TIMEOUT");
                err.name = "EnsureDemoJobTimeout";
                reject(err);
              }, ENSURE_DEMO_SEED_TIMEOUT_MS);
            }),
          ]);
        } catch (raceErr: unknown) {
          const e = raceErr as { name?: string; message?: string };
          if (e?.name === "EnsureDemoJobTimeout" && e?.message === "ENSURE_DEMO_JOB_SEED_TIMEOUT") {
            console.error(
              `[ensureDemoJob] timeout after 30s for featuredAccountId=${input.featuredAccountId}, userId=${ctx.user.id}`
            );
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Couldn't load this creator right now. Please try again.",
            });
          }
          throw raceErr;
        }
        if (seededJobId == null) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not prepare creator reels right now",
          });
        }
        return { jobId: seededJobId };
      }),
});
