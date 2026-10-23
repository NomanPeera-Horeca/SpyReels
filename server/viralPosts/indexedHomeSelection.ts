import type { ViralTrendStatus } from "@shared/viralPosts";
import {
  deriveHook,
  inferFormatFromCopy,
} from "./candidateAdapter";
import { selectTieredDailyFeed, type DiversityCandidate } from "./diversity";
import { passesIndexedViralQualification } from "./indexedQualification";
import {
  personalizationRelevanceBoost,
  strategyTopicSignals,
} from "./personalization";
import { remakeabilityScoreForCandidate, relevanceScoreForCandidate } from "./rankingSignals";
import { scoreCandidate, TODAY_PICKS_SCORE_WEIGHTS } from "./scoring";

/**
 * Home "Videos for you" ranking. Qualification, relevance, Today's Picks
 * weights, and diversity all come from Viral Posts. Goal and audience text
 * can only add the existing capped topic boost. They are not a niche.
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
};

export function selectIndexedHomePosts<T extends IndexedHomePost>(args: {
  posts: T[];
  goalText: string | null;
  audienceText: string | null;
  limit: number;
  now?: Date;
}): T[] {
  const limit = Math.max(0, args.limit);
  if (limit === 0 || args.posts.length === 0) return [];

  const qualified = args.posts.filter(post =>
    passesIndexedViralQualification({
      platform: post.platform,
      views: post.views,
      likes: post.likes,
      comments: post.comments,
      creatorFollowers: post.creatorFollowers,
    })
  );
  if (qualified.length === 0) return [];

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

  const selection = selectTieredDailyFeed(diversityInput, { min: 1, max: limit });
  const byId = new Map(diversityInput.map(entry => [entry.candidateId, entry.post]));
  const selected: T[] = [];
  for (const entry of selection.selected) {
    const post = byId.get(entry.candidateId);
    if (post) selected.push(post);
  }
  return selected;
}
