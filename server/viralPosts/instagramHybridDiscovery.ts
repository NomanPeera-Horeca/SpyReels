import Anthropic from "@anthropic-ai/sdk";
import {
  enrichInstagramPostByUrl,
  extractInstagramSearchRows,
  fetchProfile,
  parseInstagramSearchPost,
  searchHashtagReels,
  searchInstagramKeywordReels,
  searchInstagramPopular,
  type InstagramSearchPost,
} from "../instagram";
import { MIN_VIEWS, scoreViralMetrics, type ViralMetricsScore } from "../discovery/scoring";
import type { AdaptedCandidate } from "./candidateAdapter";
import { deriveHook } from "./candidateAdapter";
import {
  classifySemanticPoolRelevance,
  MIN_SEMANTIC_POOL_CONFIDENCE,
  routeSemanticPoolCandidates,
  SEMANTIC_POOL_MODEL,
  type SemanticPoolRejected,
  type SemanticPoolReroute,
  type SemanticPoolVerdict,
} from "./semanticPoolRelevance";

const DEFAULT_SC_USD_PER_CREDIT = 0.002;

export const INSTAGRAM_HYBRID_MAX_POPULAR_QUERIES = 3;
export const INSTAGRAM_HYBRID_MAX_KEYWORD_QUERIES = 2;
export const INSTAGRAM_HYBRID_MAX_HASHTAG_QUERIES = 1;
export const INSTAGRAM_HYBRID_MAX_SEARCH_CALLS = 6;
export const INSTAGRAM_HYBRID_MAX_POPULAR_PROFILE_CALLS = 6;
export const INSTAGRAM_HYBRID_MAX_POST_ENRICHMENT_CALLS = 6;

export type InstagramHybridLane = "popular" | "keyword" | "hashtag";

export type InstagramHybridSearchRow = InstagramSearchPost & {
  lanes: InstagramHybridLane[];
  queries: string[];
};

export type InstagramHybridStrictRow = {
  post: InstagramHybridSearchRow;
  score: ViralMetricsScore;
  views: number;
  followers: number;
};

export type InstagramHybridResult = {
  generatedQueries: string[];
  popularQueries: string[];
  keywordQueries: string[];
  hashtagQueries: string[];
  popularCalls: number;
  keywordCalls: number;
  hashtagCalls: number;
  searchCalls: number;
  rawPopular: number;
  rawKeyword: number;
  rawHashtag: number;
  uniquePosts: number;
  uniqueCreators: number;
  crossLaneOverlap: number;
  prefilterDomainRelevant: number;
  prefilterPrimaryOperations: number;
  prefilterSibling: number;
  prefilterRejected: number;
  prefilterHaikuCalls: number;
  popularCreatorsSelected: string[];
  profileCalls: number;
  keywordHashtagPostsSelected: number;
  postDetailCalls: number;
  enrichmentFailures: number;
  viewsRecovered: number;
  followersRecovered: number;
  bothMetricsRecovered: number;
  metricMissing: number;
  strictViral: number;
  adapted: AdaptedCandidate[];
  reroutedCandidates: SemanticPoolReroute[];
  semanticRejectedCandidates: SemanticPoolRejected[];
  semanticRejected: number;
  semanticRerouted: number;
  strictRows: InstagramHybridStrictRow[];
  wastedEnrichmentCalls: number;
  totalScCalls: number;
  costEstimateUsd: number;
  queryGenerationHaikuCalls: number;
  semanticHaikuCalls: number;
};

export function fallbackInstagramSearchQueries(args: {
  niche: string;
  pillar: string;
  count: number;
}): string[] {
  const pillar = args.pillar.trim() || args.niche.trim() || "restaurant operations";
  const stems =
    pillar === "restaurant operations"
      ? [
          "restaurant staff training",
          "restaurant SOP",
          "restaurant inventory management",
          "restaurant scheduling",
          "restaurant manager systems",
        ]
      : [
          pillar,
          `${pillar} systems`,
          `${pillar} workflow`,
          `${pillar} training`,
          `${pillar} SOP`,
        ];
  return stems.slice(0, Math.max(1, args.count));
}

export async function generateInstagramSearchQueries(args: {
  niche: string;
  pillar: string;
  count: number;
}): Promise<{ queries: string[]; haikuCalls: number }> {
  const count = Math.max(1, Math.min(5, args.count));
  const fallback = fallbackInstagramSearchQueries({ ...args, count });
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return { queries: fallback, haikuCalls: 0 };
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: SEMANTIC_POOL_MODEL,
      max_tokens: 400,
      temperature: 0.2,
      system:
        "You write short Instagram search phrases for finding operator-useful Reels. Return JSON only. Do not use em dashes.",
      messages: [
        {
          role: "user",
          content: `Generate exactly ${count} Instagram search phrases for pillar "${args.pillar}" in niche "${args.niche}".
Each phrase should be 2 to 4 words, no hashtags, and aimed at business/operator lessons rather than recipes or entertainment.
Return {"queries":["..."]}.`,
        },
      ],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as {
      queries?: unknown;
    };
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.replace(/#/g, "").replace(/\s+/g, " ").trim())
          .filter((item) => {
            const words = item.split(/\s+/).filter(Boolean);
            return words.length >= 2 && words.length <= 4;
          })
      : [];
    if (queries.length === 0) return { queries: fallback, haikuCalls: 1 };
    return { queries: queries.slice(0, count), haikuCalls: 1 };
  } catch (error) {
    console.warn("[viralPosts.hybrid] instagram_query_generation_failed", {
      pillar: args.pillar,
      error: error instanceof Error ? error.message : String(error),
    });
    return { queries: fallback, haikuCalls: 0 };
  }
}

export function allocateInstagramHybridQueries(args: {
  queries: string[];
}): { popularQueries: string[]; keywordQueries: string[]; hashtagQueries: string[] } {
  const popularQueries = args.queries.slice(0, INSTAGRAM_HYBRID_MAX_POPULAR_QUERIES);
  const remaining = args.queries.slice(INSTAGRAM_HYBRID_MAX_POPULAR_QUERIES);
  const keywordQueries = remaining.slice(0, INSTAGRAM_HYBRID_MAX_KEYWORD_QUERIES);
  const hashtagSource = args.queries[4] || args.queries[0] || "restaurant SOP";
  const hashtag = hashtagSource
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join("");
  return {
    popularQueries,
    keywordQueries,
    hashtagQueries: hashtag ? [hashtag] : [],
  };
}

export function mergeInstagramHybridRows(
  rows: Array<InstagramSearchPost & { lane: InstagramHybridLane; query: string }>
): InstagramHybridSearchRow[] {
  const byId = new Map<string, InstagramHybridSearchRow>();
  for (const row of rows) {
    const existing = byId.get(row.shortcode);
    if (!existing) {
      byId.set(row.shortcode, {
        ...row,
        lanes: [row.lane],
        queries: [row.query],
      });
      continue;
    }
    if (!existing.lanes.includes(row.lane)) existing.lanes.push(row.lane);
    if (!existing.queries.includes(row.query)) existing.queries.push(row.query);
    if ((row.views ?? 0) > (existing.views ?? 0)) existing.views = row.views;
    if ((row.likes ?? 0) > (existing.likes ?? 0)) existing.likes = row.likes;
    if ((row.comments ?? 0) > (existing.comments ?? 0)) existing.comments = row.comments;
    if ((row.ownerFollowerCount ?? 0) > (existing.ownerFollowerCount ?? 0)) {
      existing.ownerFollowerCount = row.ownerFollowerCount;
    }
  }
  return [...byId.values()];
}

export function countCrossLaneOverlap(rows: InstagramHybridSearchRow[]): number {
  return rows.filter((row) => row.lanes.length > 1).length;
}

function toAdaptedStub(post: InstagramHybridSearchRow, niche: string): AdaptedCandidate {
  const caption = post.caption || "";
  return {
    platform: "instagram",
    sourceId: post.shortcode,
    sourceUrl: post.sourceUrl,
    creatorId: post.ownerUsername || null,
    creatorName: post.ownerUsername || "Instagram creator",
    creatorHandle: post.ownerUsername ? `@${post.ownerUsername}` : null,
    creatorAvatarUrl: null,
    creatorFollowers: post.ownerFollowerCount,
    thumbnailUrl: post.thumbnailUrl,
    videoUrl: post.videoUrl,
    caption,
    transcript: null,
    hashtags: [],
    publishedAt: post.publishedAt,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    shares: null,
    saves: null,
    reachMultiplier: null,
    engagementRate: null,
    viewsPerHour: null,
    trendStatus: "proven-format",
    relevanceHint: 50,
    contentPillar: null,
    relevanceLabel: "Hybrid search",
    relevanceReason: `Fits ${niche} Instagram hybrid search`,
    hook: deriveHook(caption),
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: {
      source: "instagram_hybrid_discovery",
      lanes: post.lanes,
      queries: post.queries,
    },
  };
}

export function selectPopularCreatorsForProfileEnrichment(args: {
  posts: InstagramHybridSearchRow[];
  verdicts: SemanticPoolVerdict[];
  sourcePillar: string;
  maxCreators: number;
}): string[] {
  const verdictById = new Map(args.verdicts.map((verdict) => [verdict.sourceId, verdict]));
  const bestByCreator = new Map<string, number>();
  for (const post of args.posts) {
    if (!post.lanes.includes("popular")) continue;
    if (post.views == null || post.views < MIN_VIEWS) continue;
    const handle = post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
    if (!handle) continue;
    const verdict = verdictById.get(post.shortcode);
    if (!verdict?.domainRelevant || verdict.confidence < MIN_SEMANTIC_POOL_CONFIDENCE) continue;
    const primaryBonus = verdict.primaryPillar === args.sourcePillar ? 2 : 1;
    const score = primaryBonus * verdict.confidence * Math.log10(1 + post.views);
    const existing = bestByCreator.get(handle) ?? 0;
    if (score > existing) bestByCreator.set(handle, score);
  }
  return [...bestByCreator.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, args.maxCreators))
    .map(([handle]) => handle);
}

export function selectPostsForDetailEnrichment(args: {
  posts: InstagramHybridSearchRow[];
  verdicts: SemanticPoolVerdict[];
  sourcePillar: string;
  maxPosts: number;
}): InstagramHybridSearchRow[] {
  const verdictById = new Map(args.verdicts.map((verdict) => [verdict.sourceId, verdict]));
  const ranked = args.posts
    .filter((post) => post.lanes.includes("keyword") || post.lanes.includes("hashtag"))
    .map((post) => {
      const verdict = verdictById.get(post.shortcode);
      if (!verdict?.domainRelevant || verdict.confidence < MIN_SEMANTIC_POOL_CONFIDENCE) {
        return null;
      }
      const engagement = (post.likes ?? 0) + (post.comments ?? 0);
      const primaryBonus = verdict.primaryPillar === args.sourcePillar ? 2 : 1;
      return {
        post,
        score: primaryBonus * verdict.confidence * Math.log10(1 + engagement),
      };
    })
    .filter((row): row is { post: InstagramHybridSearchRow; score: number } => row !== null)
    .sort((a, b) => b.score - a.score);

  const selected: InstagramHybridSearchRow[] = [];
  const perCreator = new Map<string, number>();
  for (const row of ranked) {
    if (selected.length >= args.maxPosts) break;
    const handle = row.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
    const used = perCreator.get(handle) ?? 0;
    if (used >= 1) continue;
    selected.push(row.post);
    perCreator.set(handle, used + 1);
  }
  return selected;
}

export function applyCreatorFollowers(
  posts: InstagramHybridSearchRow[],
  handle: string,
  followers: number | null
): InstagramHybridSearchRow[] {
  if (followers == null || followers <= 0) return posts;
  const clean = handle.replace(/^@/, "").trim().toLowerCase();
  return posts.map((post) =>
    post.ownerUsername.replace(/^@/, "").trim().toLowerCase() === clean
      ? { ...post, ownerFollowerCount: post.ownerFollowerCount ?? followers }
      : post
  );
}

export function scoreInstagramHybridPost(
  post: InstagramHybridSearchRow
): InstagramHybridStrictRow | null {
  const views = post.views;
  const followers = post.ownerFollowerCount;
  if (views == null || views <= 0 || followers == null || followers <= 0) return null;
  const scored = scoreViralMetrics({
    views,
    likes: post.likes ?? 0,
    comments: post.comments ?? 0,
    followers,
    isPrivate: post.ownerIsPrivate === true,
  });
  if (!scored) return null;
  return { post, score: scored, views, followers };
}

function uniqueCreatorCount(posts: InstagramHybridSearchRow[]): number {
  return new Set(
    posts
      .map((post) => post.ownerUsername.replace(/^@/, "").trim().toLowerCase())
      .filter(Boolean)
  ).size;
}

export async function discoverInstagramHybridCandidates(args: {
  niche: string;
  pillar: string;
  region?: string;
}): Promise<InstagramHybridResult> {
  void args.region;
  const generated = await generateInstagramSearchQueries({
    niche: args.niche,
    pillar: args.pillar,
    count: 5,
  });
  const allocated = allocateInstagramHybridQueries({ queries: generated.queries });

  const collected: Array<InstagramSearchPost & { lane: InstagramHybridLane; query: string }> = [];
  let rawPopular = 0;
  let rawKeyword = 0;
  let rawHashtag = 0;
  let popularCalls = 0;
  let keywordCalls = 0;
  let hashtagCalls = 0;

  for (const query of allocated.popularQueries) {
    try {
      const result = await searchInstagramPopular(query);
      popularCalls += 1;
      rawPopular += result.rawCount;
      for (const post of result.posts) collected.push({ ...post, lane: "popular", query });
    } catch (error) {
      popularCalls += 1;
      console.warn("[viralPosts.hybrid] instagram_popular_failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const query of allocated.keywordQueries) {
    try {
      const result = await searchInstagramKeywordReels(query);
      keywordCalls += 1;
      rawKeyword += result.rawCount;
      for (const post of result.posts) collected.push({ ...post, lane: "keyword", query });
    } catch (error) {
      keywordCalls += 1;
      console.warn("[viralPosts.hybrid] instagram_keyword_failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const query of allocated.hashtagQueries) {
    try {
      const result = await searchHashtagReels(query);
      hashtagCalls += 1;
      const rows = result.success ? extractInstagramSearchRows(result.data) : [];
      const parsed = rows
        .map((row) => parseInstagramSearchPost(row))
        .filter((post): post is InstagramSearchPost => post !== null);
      rawHashtag += rows.length;
      for (const post of parsed) collected.push({ ...post, lane: "hashtag", query });
    } catch (error) {
      hashtagCalls += 1;
      console.warn("[viralPosts.hybrid] instagram_hashtag_failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let unique = mergeInstagramHybridRows(collected);
  const searchCalls = popularCalls + keywordCalls + hashtagCalls;

  const stubs = unique.map((post) => toAdaptedStub(post, args.niche));
  let prefilterVerdicts: SemanticPoolVerdict[] = [];
  let prefilterHaikuCalls = 0;
  if (stubs.length > 0 && process.env.ANTHROPIC_API_KEY?.trim()) {
    const classified = await classifySemanticPoolRelevance({
      niche: args.niche,
      candidates: stubs,
    });
    prefilterVerdicts = classified.verdicts;
    prefilterHaikuCalls = classified.haikuCalls;
  }

  const prefilterRouted = routeSemanticPoolCandidates({
    sourcePillar: args.pillar,
    candidates: stubs,
    verdicts: prefilterVerdicts,
  });
  const prefilterDomainRelevant = prefilterVerdicts.filter((row) => row.domainRelevant).length;
  const prefilterPrimaryOperations = prefilterRouted.currentPool.length;
  const prefilterSibling = prefilterRouted.rerouted.length;
  const prefilterRejected = prefilterRouted.rejected.length;

  const popularCreatorsSelected = selectPopularCreatorsForProfileEnrichment({
    posts: unique,
    verdicts: prefilterVerdicts,
    sourcePillar: args.pillar,
    maxCreators: INSTAGRAM_HYBRID_MAX_POPULAR_PROFILE_CALLS,
  });

  let profileCalls = 0;
  let enrichmentFailures = 0;
  let viewsRecovered = 0;
  let followersRecovered = 0;
  for (const handle of popularCreatorsSelected) {
    try {
      const profile = await fetchProfile(handle);
      profileCalls += 1;
      const followers =
        profile.followerCount > 0 && profile.isPrivate !== true ? profile.followerCount : null;
      if (followers == null) {
        enrichmentFailures += 1;
        continue;
      }
      const before = unique.filter(
        (post) =>
          post.lanes.includes("popular") &&
          post.ownerUsername.replace(/^@/, "").toLowerCase() === handle &&
          (post.ownerFollowerCount == null || post.ownerFollowerCount <= 0)
      ).length;
      unique = applyCreatorFollowers(unique, handle, followers);
      followersRecovered += before;
    } catch (error) {
      profileCalls += 1;
      enrichmentFailures += 1;
      console.warn("[viralPosts.hybrid] instagram_profile_failed", {
        handle,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const detailTargets = selectPostsForDetailEnrichment({
    posts: unique,
    verdicts: prefilterVerdicts,
    sourcePillar: args.pillar,
    maxPosts: INSTAGRAM_HYBRID_MAX_POST_ENRICHMENT_CALLS,
  });
  let postDetailCalls = 0;
  for (const target of detailTargets) {
    try {
      const enriched = await enrichInstagramPostByUrl(target.sourceUrl);
      postDetailCalls += 1;
      if (!enriched) {
        enrichmentFailures += 1;
        continue;
      }
      unique = unique.map((post) => {
        if (post.shortcode !== target.shortcode) return post;
        const next = { ...post };
        if (post.views == null && enriched.views != null) {
          next.views = enriched.views;
          viewsRecovered += 1;
        }
        if (post.ownerFollowerCount == null && enriched.ownerFollowerCount != null) {
          next.ownerFollowerCount = enriched.ownerFollowerCount;
          followersRecovered += 1;
        }
        if (enriched.likes != null) next.likes = enriched.likes;
        if (enriched.comments != null) next.comments = enriched.comments;
        if (enriched.caption) next.caption = enriched.caption;
        if (enriched.publishedAt) next.publishedAt = enriched.publishedAt;
        if (enriched.ownerIsPrivate != null) next.ownerIsPrivate = enriched.ownerIsPrivate;
        return next;
      });
    } catch (error) {
      postDetailCalls += 1;
      enrichmentFailures += 1;
      console.warn("[viralPosts.hybrid] instagram_post_enrich_failed", {
        shortcode: target.shortcode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const leftoverProfileSlots = Math.max(
    0,
    INSTAGRAM_HYBRID_MAX_POPULAR_PROFILE_CALLS - profileCalls
  );
  if (leftoverProfileSlots > 0) {
    const stillNeedFollowers = [
      ...new Set(
        unique
          .filter(
            (post) =>
              post.views != null &&
              post.views > 0 &&
              (post.ownerFollowerCount == null || post.ownerFollowerCount <= 0) &&
              post.ownerUsername.trim()
          )
          .map((post) => post.ownerUsername.replace(/^@/, "").toLowerCase())
      ),
    ].slice(0, leftoverProfileSlots);
    for (const handle of stillNeedFollowers) {
      try {
        const profile = await fetchProfile(handle);
        profileCalls += 1;
        const followers =
          profile.followerCount > 0 && profile.isPrivate !== true
            ? profile.followerCount
            : null;
        if (followers == null) {
          enrichmentFailures += 1;
          continue;
        }
        const before = unique.filter(
          (post) =>
            post.ownerUsername.replace(/^@/, "").toLowerCase() === handle &&
            (post.ownerFollowerCount == null || post.ownerFollowerCount <= 0)
        ).length;
        unique = applyCreatorFollowers(unique, handle, followers);
        followersRecovered += before;
        if (!popularCreatorsSelected.includes(handle)) {
          popularCreatorsSelected.push(handle);
        }
      } catch (error) {
        profileCalls += 1;
        enrichmentFailures += 1;
        console.warn("[viralPosts.hybrid] instagram_profile_failed", {
          handle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const bothMetricsRecovered = unique.filter(
    (post) => post.views != null && post.ownerFollowerCount != null
  ).length;

  const strictRows: InstagramHybridStrictRow[] = [];
  let metricMissing = 0;
  for (const post of unique) {
    const verdict = prefilterVerdicts.find((row) => row.sourceId === post.shortcode);
    const wasShortlisted =
      !!verdict?.domainRelevant && verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE;
    const scored = scoreInstagramHybridPost(post);
    if (scored) {
      strictRows.push(scored);
      continue;
    }
    if (wasShortlisted && (post.views == null || post.ownerFollowerCount == null)) {
      metricMissing += 1;
    }
  }

  const strictAdapted = strictRows.map((row) => toAdaptedStub(row.post, args.niche));
  const strictVerdicts = prefilterVerdicts.filter((verdict) =>
    strictRows.some((row) => row.post.shortcode === verdict.sourceId)
  );
  const routed = routeSemanticPoolCandidates({
    sourcePillar: args.pillar,
    candidates: strictAdapted,
    verdicts: strictVerdicts,
  });

  const strictIds = new Set(strictRows.map((row) => row.post.shortcode));
  const wastedProfileCalls = popularCreatorsSelected.filter((handle) => {
    const creatorPosts = unique.filter(
      (post) =>
        post.lanes.includes("popular") &&
        post.ownerUsername.replace(/^@/, "").toLowerCase() === handle
    );
    return creatorPosts.every((post) => !strictIds.has(post.shortcode));
  }).length;
  const wastedPostCalls = detailTargets.filter((post) => !strictIds.has(post.shortcode)).length;
  const wastedEnrichmentCalls = wastedProfileCalls + wastedPostCalls;

  const totalScCalls = searchCalls + profileCalls + postDetailCalls;
  const usdPerCredit =
    Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || DEFAULT_SC_USD_PER_CREDIT;

  console.info("[viralPosts.hybrid] instagram_hybrid_search", {
    pillar: args.pillar,
    niche: args.niche,
    generatedQueries: generated.queries,
    searchCalls,
    profileCalls,
    postDetailCalls,
    totalScCalls,
    uniquePosts: unique.length,
    strictViral: strictRows.length,
    currentPoolAdmitted: routed.currentPool.length,
    semanticRejected: routed.rejected.length,
    semanticRerouted: routed.rerouted.length,
  });

  return {
    generatedQueries: generated.queries,
    popularQueries: allocated.popularQueries,
    keywordQueries: allocated.keywordQueries,
    hashtagQueries: allocated.hashtagQueries,
    popularCalls,
    keywordCalls,
    hashtagCalls,
    searchCalls,
    rawPopular,
    rawKeyword,
    rawHashtag,
    uniquePosts: unique.length,
    uniqueCreators: uniqueCreatorCount(unique),
    crossLaneOverlap: countCrossLaneOverlap(unique),
    prefilterDomainRelevant,
    prefilterPrimaryOperations,
    prefilterSibling,
    prefilterRejected,
    prefilterHaikuCalls,
    popularCreatorsSelected,
    profileCalls,
    keywordHashtagPostsSelected: detailTargets.length,
    postDetailCalls,
    enrichmentFailures,
    viewsRecovered,
    followersRecovered,
    bothMetricsRecovered,
    metricMissing,
    strictViral: strictRows.length,
    adapted: routed.currentPool,
    reroutedCandidates: routed.rerouted,
    semanticRejectedCandidates: routed.rejected,
    semanticRejected: routed.rejected.length,
    semanticRerouted: routed.rerouted.length,
    strictRows,
    wastedEnrichmentCalls,
    totalScCalls,
    costEstimateUsd: totalScCalls * usdPerCredit,
    queryGenerationHaikuCalls: generated.haikuCalls,
    semanticHaikuCalls: prefilterHaikuCalls,
  };
}
