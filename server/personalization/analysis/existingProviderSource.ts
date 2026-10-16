/**
 * ProfileDataSource backed by the EXISTING ScrapeCreators integrations.
 * No new provider, endpoint or scraper.
 *
 *   instagram -> server/instagram.ts  scrapeReels(handle, timeframeDays)
 *   tiktok    -> server/tiktok.ts     scrapeTikTokVideos(handle, _, { sinceDate })
 *   youtube   -> server/youtube.ts    scrapeYouTubeShorts(handle, _, { sinceDate })
 *
 * These are the same calls a research scrape makes, but called directly: no
 * scrape job, no research-history rows, no research credit consumed.
 *
 * Cost and data caveats (documented, not hidden):
 * - Each function makes several paid requests (profile/channel lookup +
 *   pages). fetchTikTokProfile retries internally up to 5 times. None of them
 *   report a call count, so providerCalls is null ("unknown").
 * - A durable retry after a failure during fetch repeats those calls. After
 *   stage 1 succeeds the snapshot prevents any repeat.
 * - The integrations coerce missing numbers to 0, so a 0 may mean "unknown".
 *   We keep the provider's value; we never fill in or estimate numbers.
 * - Items marked outsideSpyWindow (sample backfill) are excluded.
 */
import type {
  AnalysisSourceSnapshot,
  NormalizedPost,
  SocialPlatform,
} from "@shared/personalization/model";
import { ProviderError, type ProfileDataSource } from "./contract";

type Fetchers = {
  scrapeReels: (
    handle: string,
    timeframeDays: number
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
    options: { sinceDate: Date }
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
    options: { sinceDate: Date }
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
    scrapeReels: (h, d) => ig.scrapeReels(h, d),
    scrapeTikTokVideos: (h, _p, o) => tt.scrapeTikTokVideos(h, undefined, o),
    scrapeYouTubeShorts: (h, _p, o) => yt.scrapeYouTubeShorts(h, undefined, o),
  };
};

/** Maps the existing integrations' error messages to retry decisions. */
export function classifyProviderError(err: unknown): ProviderError {
  const message = err instanceof Error ? err.message : String(err);
  if (/\bprivate\b/i.test(message))
    return new ProviderError("private", message);
  if (/not found|does not exist|no such channel/i.test(message))
    return new ProviderError("not_found", message);
  if (/rate limit|\b429\b|temporarily/i.test(message))
    return new ProviderError("rate_limited", message);
  return new ProviderError("transient", message);
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const iso = (d: unknown): string | null =>
  d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;

export function createExistingProviderSource(
  fetchers?: Fetchers
): ProfileDataSource {
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
      let posts: NormalizedPost[];
      let followerCount: number | null;
      try {
        if (platform === "instagram") {
          const r = await f.scrapeReels(handle, days);
          followerCount = num(r.followerCount);
          posts = r.reels
            .filter(x => !x.outsideSpyWindow && inWindow(x.postedAt))
            .map(x => ({
              postId: x.shortcode,
              url: x.reelUrl || null,
              publishedAt: iso(x.postedAt),
              views: num(x.viewCount),
              likes: num(x.likeCount),
              comments: num(x.commentCount),
              durationSec: num(x.duration),
              caption: x.caption || null,
            }));
        } else if (platform === "tiktok") {
          const r = await f.scrapeTikTokVideos(handle, undefined, {
            sinceDate: windowStart,
          });
          followerCount = num(r.followerCount);
          posts = r.videos
            .filter(x => inWindow(x.postedAt))
            .map(x => ({
              postId: x.awemeId,
              url: x.videoPageUrl || null,
              publishedAt: iso(x.postedAt),
              views: num(x.viewCount),
              likes: num(x.likeCount),
              comments: num(x.commentCount),
              durationSec: num(x.durationSec),
              caption: x.caption || null,
            }));
        } else {
          const r = await f.scrapeYouTubeShorts(handle, undefined, {
            sinceDate: windowStart,
          });
          followerCount = num(r.subscriberCount);
          posts = r.videos
            .filter(x => !x.outsideSpyWindow && inWindow(x.postedAt))
            .map(x => ({
              postId: x.videoId,
              url: x.videoPageUrl || null,
              publishedAt: iso(x.postedAt),
              views: num(x.viewCount),
              likes: num(x.likeCount),
              comments: num(x.commentCount),
              durationSec: num(x.durationSec),
              caption: x.title || null,
            }));
        }
      } catch (err) {
        throw classifyProviderError(err);
      }
      const snapshot: AnalysisSourceSnapshot = {
        version: 1,
        platform: platform as SocialPlatform,
        handle,
        followerCount,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        posts,
      };
      return { snapshot, providerCalls: null };
    },
  };
}
