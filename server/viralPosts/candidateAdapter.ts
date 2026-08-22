import type { DiscoveryResult } from "../discovery/pipeline";
import type { ViralTrendStatus } from "@shared/viralPosts";
import {
  ageHoursFromPublished,
  classifyTrendStatus,
  computeEngagementRate,
  computeReachMultiplier,
  computeViewsPerHour,
} from "./scoring";

export type AdaptedCandidate = {
  platform: "instagram";
  sourceId: string;
  sourceUrl: string;
  creatorId: string | null;
  creatorName: string;
  creatorHandle: string | null;
  creatorAvatarUrl: string | null;
  creatorFollowers: number | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
  transcript: string | null;
  hashtags: string[];
  publishedAt: Date | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  reachMultiplier: number | null;
  engagementRate: number | null;
  viewsPerHour: number | null;
  trendStatus: ViralTrendStatus;
  relevanceHint: number;
  contentPillar: string | null;
  relevanceLabel: string;
  relevanceReason: string;
  hook: string | null;
  format: string | null;
  hashtagKey: string | null;
  rawProviderPayload: Record<string, unknown>;
};

function extractHashtags(caption: string): string[] {
  const matches = caption.match(/#[a-zA-Z0-9_]+/g) || [];
  return [...new Set(matches.map((h) => h.slice(1).toLowerCase()))].slice(0, 20);
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

function adaptabilityFromFormat(format: string | null): number {
  switch (format) {
    case "list":
    case "myth-vs-fact":
    case "tutorial":
    case "talking-head":
    case "story":
      return 75;
    case "before-after":
      return 65;
    default:
      return 55;
  }
}

export function adaptabilityScoreForCandidate(
  candidate: Pick<AdaptedCandidate, "format">
): number {
  return adaptabilityFromFormat(candidate.format);
}

/**
 * Convert Discovery pipeline viral reels into Viral Posts candidates.
 * Does not invent metrics: null when missing.
 */
export function adaptDiscoveryResult(
  result: DiscoveryResult,
  opts?: { now?: Date }
): AdaptedCandidate[] {
  const now = opts?.now ?? new Date();
  const niche = result.routedNiche?.trim() || "your niche";

  return result.viralReels.map((reel) => {
    const caption = typeof reel.caption === "string" ? reel.caption : "";
    const publishedAt =
      reel.postedAt && !Number.isNaN(Date.parse(reel.postedAt))
        ? new Date(reel.postedAt)
        : null;
    const views =
      typeof reel.views === "number" && Number.isFinite(reel.views)
        ? reel.views
        : null;
    const likes =
      typeof reel.likes === "number" && Number.isFinite(reel.likes)
        ? reel.likes
        : null;
    const comments =
      typeof reel.comments === "number" && Number.isFinite(reel.comments)
        ? reel.comments
        : null;
    const followers =
      typeof reel.owner?.followers === "number" &&
      Number.isFinite(reel.owner.followers) &&
      reel.owner.followers > 0
        ? reel.owner.followers
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

    const handle = reel.owner?.username?.replace(/^@/, "").trim() || null;
    const hashtags = extractHashtags(caption);
    const hook = deriveHook(caption);
    const format = inferFormat(caption);
    const viralScore =
      typeof reel.viralScore === "number" && Number.isFinite(reel.viralScore)
        ? reel.viralScore
        : 0;

    return {
      platform: "instagram" as const,
      sourceId: reel.shortcode,
      sourceUrl:
        reel.reelUrl || `https://www.instagram.com/reel/${reel.shortcode}/`,
      creatorId: handle,
      creatorName: reel.owner?.fullName?.trim() || handle || "Instagram creator",
      creatorHandle: handle ? `@${handle}` : null,
      creatorAvatarUrl: reel.owner?.profilePicUrl || null,
      creatorFollowers: followers,
      thumbnailUrl: reel.thumbnailUrl || null,
      videoUrl: reel.videoUrl || null,
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
      relevanceHint: Math.min(100, Math.max(0, viralScore)),
      contentPillar: niche,
      relevanceLabel: `Matches ${niche}`,
      relevanceReason: `Fits your ${niche} search based on caption topic and creator niche signals.`,
      hook,
      format,
      hashtagKey: hashtags[0] || result.hashtagsUsed[0] || null,
      rawProviderPayload: {
        shortcode: reel.shortcode,
        viralTier: reel.viralTier,
        tier: reel.tier,
        hashtagsUsed: result.hashtagsUsed,
      },
    };
  });
}
