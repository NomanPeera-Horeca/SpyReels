import {
  InstagramHandleNotFoundError,
  InstagramPrivateAccountError,
  InstagramProviderError,
  InstagramRestrictedMediaError,
  resolveInstagramIdentity,
  searchReelsByHandle,
  type InstagramIdentity,
  type SearchReelData,
} from "../../instagram";
import {
  checkUsageLimit,
  decrementUsage,
  incrementUsage,
} from "../../stripe/stripe-service";
import { AiGatewayError } from "../errors";
import type { AiGatewayActor } from "../types";

export interface CreatorSummary {
  username: string;
  fullName: string;
  biography: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
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

function creatorSummary(identity: InstagramIdentity): CreatorSummary {
  return {
    username: identity.username,
    fullName: identity.fullName,
    biography: identity.biography,
    followerCount: identity.followerCount,
    followingCount: identity.followingCount,
    postCount: identity.postCount,
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
    return creatorSummary(identity);
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

export async function findTopContent(input: {
  actor: AiGatewayActor;
  handle: string;
  limit: number;
  rankBy: "views" | "engagement";
}): Promise<{
  creator: CreatorSummary;
  rankBy: "views" | "engagement";
  sampleSize: number;
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
    const sampleTarget = Math.min(50, Math.max(input.limit * 4, 20));
    const { reels, profile } = await searchReelsByHandle(
      input.handle,
      sampleTarget
    );

    const ranked = [...reels].sort((a, b) => {
      if (input.rankBy === "engagement") {
        return b.engagementRate - a.engagementRate || b.viewCount - a.viewCount;
      }
      return b.viewCount - a.viewCount || b.engagementRate - a.engagementRate;
    });

    return {
      creator: {
        username: profile.username,
        fullName: profile.fullName,
        biography: profile.biography,
        followerCount: profile.followerCount,
        followingCount: profile.followingCount,
        postCount: profile.postCount,
        isVerified: profile.isVerified,
        isPrivate: profile.isPrivate,
        category: profile.category,
        externalUrl: profile.externalUrl,
        profilePicUrl: profile.profilePicUrl,
      },
      rankBy: input.rankBy,
      sampleSize: reels.length,
      content: ranked.slice(0, input.limit).map(mapRankedContent),
    };
  } catch (error) {
    await decrementUsage(input.actor.userId, "searchCount").catch((refundError) => {
      console.error("[ai-gateway] failed to refund search usage", refundError);
    });
    return mapInstagramError(error);
  }
}
