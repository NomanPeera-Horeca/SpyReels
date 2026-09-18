import {
  InstagramHandleNotFoundError,
  InstagramPrivateAccountError,
  InstagramProviderError,
  InstagramRestrictedMediaError,
  resolveInstagramIdentity,
  searchReelsByHandle,
  type InstagramIdentity,
  type ProfileInfo,
  type SearchReelData,
} from "../../instagram";
import {
  getInstagramVisiblePostCount,
  type InstagramVisiblePostCount,
} from "../../instagramPostCount";
import {
  checkUsageLimit,
  decrementUsage,
  incrementUsage,
} from "../../stripe/stripe-service";
import { AiGatewayError } from "../errors";
import type { AiGatewayActor } from "../types";

const TOP_CONTENT_MIN_SAMPLE = 10;
const TOP_CONTENT_MAX_SAMPLE = 12;
const TOP_CONTENT_CACHE_TTL_MS = 5 * 60 * 1000;
const TOP_CONTENT_CACHE_MAX_ENTRIES = 100;

type CachedCreatorSample = {
  expiresAt: number;
  profile: ProfileInfo;
  reels: SearchReelData[];
};

const creatorSampleCache = new Map<string, CachedCreatorSample>();

export interface CreatorSummary {
  username: string;
  fullName: string;
  biography: string;
  followerCount: number;
  followingCount: number;
  postCount: number | null;
  postCountEstimated: boolean;
  postCountVerified: boolean;
  postCountSource: "instagram_profile_post_count" | "unavailable";
  isVerified: boolean;
  isPrivate: boolean;
  category: string;
  externalUrl: string;
  profilePicUrl: string;
}

export interface RankedContentItem {
  shortcode: string;
  reelUrl: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  engagementRate: number;
  duration: number;
  postedAt: string;
  thumbnailUrl: string;
}

export interface TopContentSampleMeta {
  policy: "bounded_provider_sample";
  requested: number;
  analyzed: number;
  newestPostedAt: string | null;
  oldestPostedAt: string | null;
  cacheHit: boolean;
  statement: string;
}

function creatorSummary(
  identity: InstagramIdentity | ProfileInfo,
  visiblePostCount: InstagramVisiblePostCount | null
): CreatorSummary {
  return {
    username: identity.username,
    fullName: identity.fullName,
    biography: identity.biography,
    followerCount: identity.followerCount,
    followingCount: identity.followingCount,
    postCount: visiblePostCount?.count ?? null,
    postCountEstimated: visiblePostCount?.estimated ?? false,
    postCountVerified: visiblePostCount !== null,
    postCountSource: visiblePostCount
      ? "instagram_profile_post_count"
      : "unavailable",
    isVerified: identity.isVerified,
    isPrivate: identity.isPrivate,
    category: identity.category,
    externalUrl: identity.externalUrl,
    profilePicUrl: identity.profilePicUrl,
  };
}

function mapInstagramError(error: unknown): never {
  if (error instanceof InstagramHandleNotFoundError) {
    throw new AiGatewayError({
      code: "NOT_FOUND",
      message: error.message,
      retryable: false,
      cause: error,
    });
  }
  if (error instanceof InstagramPrivateAccountError) {
    throw new AiGatewayError({
      code: "PRIVATE_ACCOUNT",
      message: error.message,
      retryable: false,
      cause: error,
    });
  }
  if (
    error instanceof InstagramProviderError ||
    error instanceof InstagramRestrictedMediaError
  ) {
    throw new AiGatewayError({
      code: "UPSTREAM_UNAVAILABLE",
      message:
        "Instagram data is temporarily unavailable for this creator. Please try again later.",
      retryable: true,
      cause: error,
    });
  }
  throw new AiGatewayError({
    code: "UPSTREAM_UNAVAILABLE",
    message: "SpyReels could not load this Instagram creator right now.",
    retryable: true,
    cause: error,
  });
}

export async function findCreator(handle: string): Promise<CreatorSummary> {
  try {
    const identity = await resolveInstagramIdentity(handle);
    const visiblePostCount = await getInstagramVisiblePostCount(identity.username);
    return creatorSummary(identity, visiblePostCount);
  } catch (error) {
    return mapInstagramError(error);
  }
}

function mapRankedContent(item: SearchReelData): RankedContentItem {
  return {
    shortcode: item.shortcode,
    reelUrl: item.reelUrl,
    caption: item.caption,
    viewCount: item.viewCount,
    likeCount: item.likeCount,
    commentCount: item.commentCount,
    engagementRate: item.engagementRate,
    duration: item.duration,
    postedAt: item.postedAt.toISOString(),
    thumbnailUrl: item.thumbnailUrl,
  };
}

function normalizedHandle(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}

function sampleTarget(limit: number): number {
  return Math.min(
    TOP_CONTENT_MAX_SAMPLE,
    Math.max(TOP_CONTENT_MIN_SAMPLE, limit * 2)
  );
}

function pruneCreatorSampleCache(now = Date.now()): void {
  for (const [key, value] of creatorSampleCache) {
    if (value.expiresAt <= now) creatorSampleCache.delete(key);
  }
  while (creatorSampleCache.size > TOP_CONTENT_CACHE_MAX_ENTRIES) {
    const oldestKey = creatorSampleCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    creatorSampleCache.delete(oldestKey);
  }
}

async function getCreatorSample(
  handle: string,
  requested: number
): Promise<{ reels: SearchReelData[]; profile: ProfileInfo; cacheHit: boolean }> {
  const key = normalizedHandle(handle);
  const now = Date.now();
  pruneCreatorSampleCache(now);
  const cached = creatorSampleCache.get(key);
  if (cached && cached.expiresAt > now && cached.reels.length >= requested) {
    return {
      reels: cached.reels.slice(0, requested),
      profile: cached.profile,
      cacheHit: true,
    };
  }

  const fresh = await searchReelsByHandle(handle, requested);
  creatorSampleCache.set(key, {
    expiresAt: now + TOP_CONTENT_CACHE_TTL_MS,
    profile: fresh.profile,
    reels: fresh.reels,
  });
  pruneCreatorSampleCache(now);
  return { ...fresh, cacheHit: false };
}

function compareByRecencyThenShortcode(a: SearchReelData, b: SearchReelData): number {
  const recency = b.postedAt.getTime() - a.postedAt.getTime();
  if (recency !== 0) return recency;
  return a.shortcode.localeCompare(b.shortcode);
}

export function sortTopContentDeterministically(
  reels: SearchReelData[],
  rankBy: "views" | "engagement"
): SearchReelData[] {
  return [...reels].sort((a, b) => {
    if (rankBy === "engagement") {
      return (
        b.engagementRate - a.engagementRate ||
        b.viewCount - a.viewCount ||
        compareByRecencyThenShortcode(a, b)
      );
    }
    return (
      b.viewCount - a.viewCount ||
      b.engagementRate - a.engagementRate ||
      compareByRecencyThenShortcode(a, b)
    );
  });
}

function sampleMeta(
  reels: SearchReelData[],
  requested: number,
  cacheHit: boolean
): TopContentSampleMeta {
  const validDates = reels
    .map((reel) => reel.postedAt)
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const oldest = validDates[0] ?? null;
  const newest = validDates.at(-1) ?? null;

  return {
    policy: "bounded_provider_sample",
    requested,
    analyzed: reels.length,
    newestPostedAt: newest?.toISOString() ?? null,
    oldestPostedAt: oldest?.toISOString() ?? null,
    cacheHit,
    statement:
      `Ranked from ${reels.length} Reels returned in this bounded provider sample. ` +
      "This is not an all-time ranking of every Reel the creator has posted.",
  };
}

export async function findTopContent(input: {
  actor: AiGatewayActor;
  handle: string;
  limit: number;
  rankBy: "views" | "engagement";
}): Promise<{
  creator: CreatorSummary;
  rankBy: "views" | "engagement";
  sampleSize: number;
  sample: TopContentSampleMeta;
  content: RankedContentItem[];
}> {
  const usage = await checkUsageLimit(
    input.actor.userId,
    "searchCount",
    input.actor.openId ?? undefined,
    { email: input.actor.email, role: input.actor.role }
  );

  if (!usage.allowed) {
    throw new AiGatewayError({
      code: "USAGE_LIMIT_REACHED",
      message: `Your current SpyReels plan has reached its creator research limit (${usage.used}/${usage.limit}).`,
      retryable: false,
      upgradePlan: usage.planRequired,
    });
  }

  // Reserve the same usage counter used by the existing SpyReels search flow.
  // Refund it if the provider fails so an upstream outage does not consume quota.
  await incrementUsage(input.actor.userId, "searchCount");

  try {
    const requested = sampleTarget(input.limit);
    const { reels, profile, cacheHit } = await getCreatorSample(
      input.handle,
      requested
    );
    const visiblePostCount = await getInstagramVisiblePostCount(profile.username);
    const ranked = sortTopContentDeterministically(reels, input.rankBy);

    return {
      creator: creatorSummary(profile, visiblePostCount),
      rankBy: input.rankBy,
      sampleSize: reels.length,
      sample: sampleMeta(reels, requested, cacheHit),
      content: ranked.slice(0, input.limit).map(mapRankedContent),
    };
  } catch (error) {
    await decrementUsage(input.actor.userId, "searchCount").catch((refundError) => {
      console.error("[ai-gateway] failed to refund search usage", refundError);
    });
    return mapInstagramError(error);
  }
}
