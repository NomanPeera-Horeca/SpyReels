import type { ViralTrendStatus } from "@shared/viralPosts";
import { followerViralBadge, type FollowerViralBadge } from "@shared/viralTier";
import {
  deriveHook,
  inferFormatFromCopy,
} from "./candidateAdapter";
import { selectTieredDailyFeed, type DiversityCandidate } from "./diversity";
import { passesIndexedViralQualification } from "./indexedQualification";
import { CREATOR_SIGNAL_RECENT_DAYS } from "../personalization/home/homeService";
import {
  personalizationRelevanceBoost,
  strategyTopicSignals,
} from "./personalization";
import { remakeabilityScoreForCandidate, relevanceScoreForCandidate } from "./rankingSignals";
import { scoreCandidate, TODAY_PICKS_SCORE_WEIGHTS } from "./scoring";

/**
 * Home ranking for both sections. Qualification, relevance, Today's Picks
 * weights, and diversity all come from Viral Posts. Goal and audience text
 * can only add the existing capped topic boost. They are not a niche.
 *
 * Videos are the diverse top slice. Creators are grouped from every qualified
 * post in that same inventory, then ranked by the existing follower viral
 * badge. A null badge drops the creator. Follower count is not a rank.
 *
 * `min: 1` is the shared selector's fill target, not a new score cutoff.
 * The strong and fallback floors stay the Today's Picks constants. A thin
 * pool therefore cannot pad the row with posts that missed qualification
 * or the strong bar.
 */
export type IndexedHomePost = {
  id: number;
  platform: string;
  sourceId: string;
  creatorId: string | null;
  creatorHandle: string | null;
  caption: string | null;
  hashtags: string[];
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  creatorFollowers: number | null;
  publishedAt: Date | null;
  primaryPillar: string;
  pillarConfidence: number;
  creatorName?: string | null;
  creatorAvatarUrl?: string | null;
};

export type IndexedHomeCreatorPick<T extends IndexedHomePost = IndexedHomePost> = {
  post: T;
  badge: FollowerViralBadge;
};

export function selectIndexedHomePosts<T extends IndexedHomePost>(args: {
  posts: T[];
  goalText: string | null;
  audienceText: string | null;
  limit: number;
  now?: Date;
}): T[] {
  if (args.limit <= 0 || args.posts.length === 0) return [];
  return rankIndexedHomeInventory(args).display;
}

export function rankIndexedHomeInventory<T extends IndexedHomePost>(args: {
  posts: T[];
  goalText: string | null;
  audienceText: string | null;
  limit: number;
  creatorLimit?: number;
  now?: Date;
  recentDays?: number;
}): { display: T[]; creators: Array<IndexedHomeCreatorPick<T>> } {
  const empty = { display: [] as T[], creators: [] as Array<IndexedHomeCreatorPick<T>> };
  if (args.posts.length === 0) return empty;

  const qualified = args.posts.filter(post =>
    passesIndexedViralQualification({
      platform: post.platform,
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      creatorFollowers: post.creatorFollowers,
    })
  );
  if (qualified.length === 0) return empty;

  const signals = strategyTopicSignals({
    goalText: args.goalText,
    audienceText: args.audienceText,
  });
  const now = args.now ?? new Date();
  const scoreInputs = qualified.map(post => {
    const hook = deriveHook(post.caption || "");
    const format = inferFormatFromCopy({ caption: post.caption, hook });
    const relevance = relevanceScoreForCandidate({
      candidate: {
        caption: post.caption,
        hook,
        hashtags: post.hashtags,
        contentPillar: post.primaryPillar,
      },
      pillarConfidence: post.pillarConfidence,
      activePillar: post.primaryPillar,
    });
    const boost = personalizationRelevanceBoost(
      {
        platform: post.platform === "tiktok" || post.platform === "youtube" ? post.platform : "instagram",
        sourceId: post.sourceId,
        creatorId: post.creatorId,
        creatorHandle: post.creatorHandle,
        format,
        caption: post.caption,
        hook,
      },
      signals
    );
    return {
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      saves: post.saves,
      creatorFollowers: post.creatorFollowers,
      publishedAt: post.publishedAt,
      relevanceScore: Math.min(100, relevance + boost),
      adaptabilityScore: remakeabilityScoreForCandidate({
        format,
        hook,
        caption: post.caption,
        transcript: null,
      }),
    };
  });

  const diversityInput: Array<DiversityCandidate & { post: T }> = qualified.map((post, index) => {
    const scored = scoreCandidate(scoreInputs[index]!, scoreInputs, now, TODAY_PICKS_SCORE_WEIGHTS);
    const hook = deriveHook(post.caption || "") || "";
    const creatorKey = (post.creatorId || post.creatorHandle || `candidate:${post.id}`)
      .toLowerCase()
      .replace(/^@/, "");
    return {
      post,
      candidateId: post.id,
      sourceId: post.sourceId,
      creatorKey,
      caption: post.caption || "",
      hook,
      contentPillar: post.primaryPillar,
      format: inferFormatFromCopy({ caption: post.caption, hook }),
      finalScore: scored.finalScore,
      trendStatus: scored.trendStatus as ViralTrendStatus,
      hidden: false,
      recentlyDismissed: false,
      recentlyShown: false,
      hashtagKey: post.hashtags[0] || null,
      platform: post.platform,
    };
  });

  const limit = Math.max(0, args.limit);
  const display: T[] = [];
  if (limit > 0) {
    const selection = selectTieredDailyFeed(diversityInput, { min: 1, max: limit });
    const byId = new Map(diversityInput.map(entry => [entry.candidateId, entry.post]));
    for (const entry of selection.selected) {
      const post = byId.get(entry.candidateId);
      if (post) display.push(post);
    }
  }

  return {
    display,
    creators: groupCreatorsFromQualified({
      scored: diversityInput.map(entry => ({
        post: entry.post,
        finalScore: entry.finalScore,
      })),
      limit: args.creatorLimit ?? 3,
      now,
      recentDays: args.recentDays,
    }),
  };
}

function groupCreatorsFromQualified<T extends IndexedHomePost>(args: {
  scored: Array<{ post: T; finalScore: number }>;
  limit: number;
  now: Date;
  recentDays?: number;
}): Array<IndexedHomeCreatorPick<T>> {
  const recentDays = args.recentDays ?? CREATOR_SIGNAL_RECENT_DAYS;
  const since = args.now.getTime() - recentDays * 86_400_000;
  const best = new Map<string, IndexedHomeCreatorPick<T> & { finalScore: number }>();

  for (const entry of args.scored) {
    const platform = entry.post.platform;
    if (platform !== "instagram" && platform !== "tiktok" && platform !== "youtube") continue;
    const handle = (entry.post.creatorId || entry.post.creatorHandle || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
    if (!handle) continue;
    const publishedAt = entry.post.publishedAt;
    if (!publishedAt || publishedAt.getTime() < since) continue;
    const badge = followerViralBadge(entry.post.views, entry.post.creatorFollowers);
    if (!badge) continue;
    const key = `${platform}:${handle}`;
    const current = best.get(key);
    const stronger =
      !current ||
      badge.multiple > current.badge.multiple ||
      (badge.multiple === current.badge.multiple && entry.finalScore > current.finalScore);
    if (stronger) {
      best.set(key, { post: entry.post, badge, finalScore: entry.finalScore });
    }
  }

  return [...best.values()]
    .sort((a, b) => b.badge.multiple - a.badge.multiple || b.finalScore - a.finalScore)
    .slice(0, Math.max(0, args.limit))
    .map(({ post, badge }) => ({ post, badge }));
}
