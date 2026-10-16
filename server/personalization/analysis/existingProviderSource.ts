/**
 * ProfileDataSource backed by the EXISTING ScrapeCreators integrations.
 * No new provider, endpoint or scraper.
 *
 *   instagram -> server/instagram.ts  scrapeReels(handle, days, _, { maxReels })
 *   tiktok    -> server/tiktok.ts     scrapeTikTokVideos(handle, _, { sinceDate, maxVideos })
 *   youtube   -> server/youtube.ts    scrapeYouTubeShorts(handle, _, { sinceDate, maxVideos })
 *
 * Called directly: no scrape job, no research-history rows, no research credit.
 *
 * Cost protection: every fetch runs inside withScrapeCreatorsMeter, which
 * counts each real paid request (including the integrations' own internal
 * retries) and blocks requests past PROFILE_ANALYSIS_REQUEST_BUDGET_PER_ATTEMPT.
 * The existing maxReels / maxVideos option caps pagination.
 *
 * Data caveats: the integrations coerce missing numbers to 0, so a 0 may mean
 * "unknown". We keep the provider's value and never estimate. Items marked
 * outsideSpyWindow (sample backfill) are excluded.
 */
import type {
  AnalysisSourceSnapshot,
  NormalizedPost,
  SocialPlatform,
} from "@shared/personalization/model";
import {
  withScrapeCreatorsMeter,
  type ScrapeCreatorsMeterReport,
} from "../../scrapeCreatorsMeter";
import {
  PROFILE_ANALYSIS_MAX_POSTS,
  PROFILE_ANALYSIS_REQUEST_BUDGET_PER_ATTEMPT,
  ProviderError,
  type ProfileDataSource,
} from "./contract";

type Fetchers = {
  scrapeReels: (
    handle: string,
    timeframeDays: number,
    onProgress: undefined,
    options: { maxReels: number }
  ) => Promise<{
    reels: Array<{
      shortcode: string;
      caption: string;
      viewCount: number;
      likeCount: number;
      commentCount: number;
      reelUrl: string;
      duration: number;
      postedAt: Date;
      outsideSpyWindow?: boolean;
    }>;
    followerCount: number;
  }>;
  scrapeTikTokVideos: (
    handle: string,
    onProgress: undefined,
    options: { sinceDate: Date; maxVideos: number }
  ) => Promise<{
    videos: Array<{
      awemeId: string;
      caption: string;
      viewCount: number;
      likeCount: number;
      commentCount: number;
      videoPageUrl: string;
      durationSec: number;
      postedAt: Date;
    }>;
    followerCount: number;
  }>;
  scrapeYouTubeShorts: (
    handle: string,
    onProgress: undefined,
    options: { sinceDate: Date; maxVideos: number }
  ) => Promise<{
    videos: Array<{
      videoId: string;
      title: string;
      viewCount: number;
      likeCount: number;
      commentCount: number;
      videoPageUrl: string;
      durationSec: number;
      postedAt: Date;
      outsideSpyWindow?: boolean;
    }>;
    subscriberCount: number;
  }>;
};

const defaultFetchers = async (): Promise<Fetchers> => {
  const [ig, tt, yt] = await Promise.all([
    import("../../instagram"),
    import("../../tiktok"),
    import("../../youtube"),
  ]);
  return {
    scrapeReels: (h, d, _p, o) => ig.scrapeReels(h, d, undefined, o),
    scrapeTikTokVideos: (h, _p, o) => tt.scrapeTikTokVideos(h, undefined, o),
    scrapeYouTubeShorts: (h, _p, o) => yt.scrapeYouTubeShorts(h, undefined, o),
  };
};

/** Maps the existing integrations' error messages to retry decisions. */
export function classifyProviderError(
  err: unknown,
  meter: ScrapeCreatorsMeterReport | null = null
): ProviderError {
  const message = err instanceof Error ? err.message : String(err);
  if (meter && meter.blockedByBudget > 0) {
    return new ProviderError("request_budget_exhausted", message, meter);
  }
  if (/\bprivate\b/i.test(message))
    return new ProviderError("private", message, meter);
  if (/not found|does not exist|no such channel/i.test(message)) {
    return new ProviderError("not_found", message, meter);
  }
  if (/rate limit|\b429\b|temporarily/i.test(message)) {
    return new ProviderError("rate_limited", message, meter);
  }
  return new ProviderError("transient", message, meter);
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const iso = (d: unknown): string | null =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;

export function createExistingProviderSource(
  fetchers?: Fetchers,
  opts: { requestBudget?: number; maxPosts?: number } = {}
): ProfileDataSource {
  const requestBudget =
    opts.requestBudget ?? PROFILE_ANALYSIS_REQUEST_BUDGET_PER_ATTEMPT;
  const maxPosts = opts.maxPosts ?? PROFILE_ANALYSIS_MAX_POSTS;
  return {
    async fetchPosts({ platform, handle, windowStart, windowEnd }) {
      const f = fetchers ?? (await defaultFetchers());
      const days = Math.max(
        1,
        Math.ceil((windowEnd.getTime() - windowStart.getTime()) / 86_400_000)
      );
      const inWindow = (d: Date | null | undefined) =>
        d instanceof Date &&
        d.getTime() >= windowStart.getTime() &&
        d.getTime() <= windowEnd.getTime();

      const metered = await withScrapeCreatorsMeter(requestBudget, async () => {
        if (platform === "instagram") {
          const r = await f.scrapeReels(handle, days, undefined, {
            maxReels: maxPosts,
          });
          return {
            followerCount: num(r.followerCount),
            posts: r.reels
              .filter(x => !x.outsideSpyWindow && inWindow(x.postedAt))
              .map<NormalizedPost>(x => ({
                postId: x.shortcode,
                url: x.reelUrl || null,
                publishedAt: iso(x.postedAt),
                views: num(x.viewCount),
                likes: num(x.likeCount),
                comments: num(x.commentCount),
                durationSec: num(x.duration),
                caption: x.caption || null,
              })),
          };
        }
        if (platform === "tiktok") {
          const r = await f.scrapeTikTokVideos(handle, undefined, {
            sinceDate: windowStart,
            maxVideos: maxPosts,
          });
          return {
            followerCount: num(r.followerCount),
            posts: r.videos
              .filter(x => inWindow(x.postedAt))
              .map<NormalizedPost>(x => ({
                postId: x.awemeId,
                url: x.videoPageUrl || null,
                publishedAt: iso(x.postedAt),
                views: num(x.viewCount),
                likes: num(x.likeCount),
                comments: num(x.commentCount),
                durationSec: num(x.durationSec),
                caption: x.caption || null,
              })),
          };
        }
        const r = await f.scrapeYouTubeShorts(handle, undefined, {
          sinceDate: windowStart,
          maxVideos: maxPosts,
        });
        return {
          followerCount: num(r.subscriberCount),
          posts: r.videos
            .filter(x => !x.outsideSpyWindow && inWindow(x.postedAt))
            .map<NormalizedPost>(x => ({
              postId: x.videoId,
              url: x.videoPageUrl || null,
              publishedAt: iso(x.postedAt),
              views: num(x.viewCount),
              likes: num(x.likeCount),
              comments: num(x.commentCount),
              durationSec: num(x.durationSec),
              caption: x.title || null,
            })),
        };
      });

      if ("error" in metered)
        throw classifyProviderError(metered.error, metered.report);
      const snapshot: AnalysisSourceSnapshot = {
        version: 1,
        platform: platform as SocialPlatform,
        handle,
        followerCount: metered.result.followerCount,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        posts: metered.result.posts,
      };
      return { snapshot, meter: metered.report };
    },
  };
}
