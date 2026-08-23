import type { TikTokVideoData } from "../tiktok";
import type { YouTubeVideoData } from "../youtube";
import type { AdaptedCandidate } from "./candidateAdapter";
import {
  ageHoursFromPublished,
  classifyTrendStatus,
  computeEngagementRate,
  computeReachMultiplier,
  computeViewsPerHour,
} from "./scoring";

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map((h) => h.slice(1).toLowerCase()))].slice(
    0,
    20
  );
}

function deriveHook(caption: string): string | null {
  const cleaned = caption.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const firstLine = cleaned.split(/[.!?\n]/)[0]?.trim() || cleaned;
  return firstLine.slice(0, 160) || null;
}

function inferFormat(caption: string): string | null {
  const c = caption.toLowerCase();
  if (/\b(\d+)\s*(ways|tips|things|mistakes|reasons)\b/.test(c)) {
    return "list";
  }
  if (/\b(myth|vs\.?|versus|stop believing)\b/.test(c)) return "myth-vs-fact";
  if (/\b(before|after)\b/.test(c)) return "before-after";
  if (/\b(how to|tutorial|step)\b/.test(c)) return "tutorial";
  if (/\bi (learned|stopped|realized|used to)\b/.test(c)) return "story";
  return "talking-head";
}

function relevanceHintFromViews(views: number | null): number {
  if (views == null || views <= 0) return 40;
  if (views >= 1_000_000) return 90;
  if (views >= 250_000) return 80;
  if (views >= 50_000) return 70;
  if (views >= 10_000) return 55;
  return 45;
}

export function adaptTikTokVideos(
  videos: TikTokVideoData[],
  opts: {
    niche: string;
    creatorFollowers?: number | null;
    creatorAvatarUrl?: string | null;
    now?: Date;
  }
): AdaptedCandidate[] {
  const now = opts.now ?? new Date();
  const niche = opts.niche.trim() || "your niche";
  const followers =
    opts.creatorFollowers != null &&
    Number.isFinite(opts.creatorFollowers) &&
    opts.creatorFollowers > 0
      ? opts.creatorFollowers
      : null;

  return videos
    .filter((v) => v.awemeId?.trim())
    .map((video) => {
      const caption = video.caption || "";
      const publishedAt =
        video.postedAt && !Number.isNaN(video.postedAt.getTime())
          ? video.postedAt
          : null;
      const views =
        typeof video.viewCount === "number" && Number.isFinite(video.viewCount)
          ? video.viewCount
          : null;
      const likes =
        typeof video.likeCount === "number" && Number.isFinite(video.likeCount)
          ? video.likeCount
          : null;
      const comments =
        typeof video.commentCount === "number" &&
        Number.isFinite(video.commentCount)
          ? video.commentCount
          : null;
      const shares =
        typeof video.shareCount === "number" && Number.isFinite(video.shareCount)
          ? video.shareCount
          : null;

      const ageHours = ageHoursFromPublished(publishedAt, now);
      const reachMultiplier = computeReachMultiplier(views, followers);
      const engagementRate = computeEngagementRate({
        views,
        likes,
        comments,
        shares,
        saves: null,
      });
      const viewsPerHour = computeViewsPerHour(views, ageHours);
      const trendStatus = classifyTrendStatus({
        reachMultiplier,
        viewsPerHour,
        ageHours,
        views,
      });
      const handle = video.ownerUsername?.replace(/^@/, "").trim() || null;
      const hashtags = extractHashtags(caption);
      const hook = deriveHook(caption);
      const format = inferFormat(caption);

      return {
        platform: "tiktok" as const,
        sourceId: video.awemeId,
        sourceUrl:
          video.videoPageUrl ||
          (handle
            ? `https://www.tiktok.com/@${handle}/video/${video.awemeId}`
            : `https://www.tiktok.com/video/${video.awemeId}`),
        creatorId: handle,
        creatorName: handle || "TikTok creator",
        creatorHandle: handle ? `@${handle}` : null,
        creatorAvatarUrl: opts.creatorAvatarUrl || null,
        creatorFollowers: followers,
        thumbnailUrl: video.thumbnailUrl || null,
        videoUrl: video.videoUrl || null,
        caption: caption || null,
        transcript: null,
        hashtags,
        publishedAt,
        views,
        likes,
        comments,
        shares,
        saves: null,
        reachMultiplier,
        engagementRate,
        viewsPerHour,
        trendStatus,
        relevanceHint: relevanceHintFromViews(views),
        contentPillar: niche,
        relevanceLabel: `Matches ${niche}`,
        relevanceReason: `Fits your ${niche} niche from a TikTok creator seed scrape.`,
        hook,
        format,
        hashtagKey: hashtags[0] || null,
        rawProviderPayload: {
          awemeId: video.awemeId,
          platform: "tiktok",
        },
      };
    });
}

export function adaptYouTubeShorts(
  videos: YouTubeVideoData[],
  opts: {
    niche: string;
    creatorFollowers?: number | null;
    creatorAvatarUrl?: string | null;
    creatorName?: string | null;
    now?: Date;
  }
): AdaptedCandidate[] {
  const now = opts.now ?? new Date();
  const niche = opts.niche.trim() || "your niche";
  const followers =
    opts.creatorFollowers != null &&
    Number.isFinite(opts.creatorFollowers) &&
    opts.creatorFollowers > 0
      ? opts.creatorFollowers
      : null;

  return videos
    .filter((v) => v.videoId?.trim())
    .map((video) => {
      const caption = [video.title, video.description]
        .filter(Boolean)
        .join("\n")
        .trim();
      const publishedAt =
        video.postedAt && !Number.isNaN(video.postedAt.getTime())
          ? video.postedAt
          : null;
      const views =
        typeof video.viewCount === "number" && Number.isFinite(video.viewCount)
          ? video.viewCount
          : null;
      const likes =
        typeof video.likeCount === "number" && Number.isFinite(video.likeCount)
          ? video.likeCount
          : null;
      const comments =
        typeof video.commentCount === "number" &&
        Number.isFinite(video.commentCount)
          ? video.commentCount
          : null;

      const ageHours = ageHoursFromPublished(publishedAt, now);
      const reachMultiplier = computeReachMultiplier(views, followers);
      const engagementRate = computeEngagementRate({
        views,
        likes,
        comments,
        shares: null,
        saves: null,
      });
      const viewsPerHour = computeViewsPerHour(views, ageHours);
      const trendStatus = classifyTrendStatus({
        reachMultiplier,
        viewsPerHour,
        ageHours,
        views,
      });
      const handle = video.ownerHandle?.replace(/^@/, "").trim() || null;
      const hashtags = extractHashtags(caption);
      const hook = deriveHook(video.title || caption);
      const format = inferFormat(caption);

      return {
        platform: "youtube" as const,
        sourceId: video.videoId,
        sourceUrl:
          video.videoPageUrl ||
          `https://www.youtube.com/shorts/${video.videoId}`,
        creatorId: handle,
        creatorName:
          opts.creatorName?.trim() || handle || "YouTube creator",
        creatorHandle: handle ? `@${handle}` : null,
        creatorAvatarUrl: opts.creatorAvatarUrl || null,
        creatorFollowers: followers,
        thumbnailUrl: video.thumbnailUrl || null,
        videoUrl: null,
        caption: caption || null,
        transcript: null,
        hashtags,
        publishedAt,
        views,
        likes,
        comments,
        shares: null,
        saves: null,
        reachMultiplier,
        engagementRate,
        viewsPerHour,
        trendStatus,
        relevanceHint: relevanceHintFromViews(views),
        contentPillar: niche,
        relevanceLabel: `Matches ${niche}`,
        relevanceReason: `Fits your ${niche} niche from a YouTube Shorts seed scrape.`,
        hook,
        format,
        hashtagKey: hashtags[0] || null,
        rawProviderPayload: {
          videoId: video.videoId,
          platform: "youtube",
        },
      };
    });
}
