import Anthropic from "@anthropic-ai/sdk";
import {
  createDiscoveryScCallTracker,
  enrichInstagramPostByUrl,
  fetchProfile,
  runWithDiscoveryScCallTracker,
  searchInstagramPopular,
  type InstagramSearchPost,
} from "../instagram";
import {
  TIER2_MIN_REACH_MULTIPLIER,
  TIER2_MIN_VIEWS,
  scoreViralMetrics,
  type ViralMetricsScore,
} from "../discovery/scoring";
import type { AdaptedCandidate } from "./candidateAdapter";
import { deriveHook } from "./candidateAdapter";
import {
  DEFAULT_CONTENT_PILLARS,
  VIRAL_POOL_DEFAULTS,
  VIRAL_SEED_POOL_PILLAR,
} from "./constants";
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
const RESTAURANT_PILLARS = new Set<string>(DEFAULT_CONTENT_PILLARS);

export type InstagramPopularRow = InstagramSearchPost & { queries: string[] };

export type InstagramPopularStrictRow = {
  post: InstagramPopularRow;
  score: ViralMetricsScore;
};

export type InstagramPopularDiscoveryResult = {
  adapted: AdaptedCandidate[];
  reroutedCandidates: SemanticPoolReroute[];
  semanticRejectedCandidates: SemanticPoolRejected[];
  generatedQueries: string[];
  popularCalls: number;
  popularSuccesses: number;
  popularFailures: number;
  rawPosts: number;
  uniquePosts: number;
  uniqueCreators: number;
  targetPrefilter: number;
  profileCalls: number;
  postDetailCalls: number;
  strictViral: number;
  semanticHaikuCalls: number;
  queryGenerationHaikuCalls: number;
  semanticRejected: number;
  semanticRerouted: number;
  totalScCalls: number;
  costEstimateUsd: number;
  selectedCreators: string[];
};

type RankedPrimaryRow = {
  post: InstagramPopularRow;
  verdict: SemanticPoolVerdict;
  score: number;
};

/** Short Popular phrases learned from restaurant Popular benchmarks. Prefer 2-3 words. */
export function fallbackInstagramPopularQueries(args: {
  pillar: string;
  count: number;
}): string[] {
  const count = Math.max(1, args.count);
  const byPillar: Record<string, string[]> = {
    "restaurant operations": [
      "restaurant management",
      "staff training",
      "restaurant SOP",
      "kitchen workflow",
      "restaurant inventory",
    ],
    "restaurant profitability": [
      "restaurant profit",
      "food cost",
      "menu pricing",
      "restaurant sales",
      "unit economics",
    ],
    "restaurant marketing": [
      "restaurant marketing",
      "restaurant branding",
      "restaurant loyalty",
      "restaurant promo",
      "restaurant ads",
    ],
    "kitchen buildouts": [
      "kitchen equipment",
      "kitchen layout",
      "hood system",
      "walk in cooler",
      "kitchen workflow",
    ],
    "menu engineering": [
      "menu engineering",
      "menu pricing",
      "food cost",
      "menu design",
      "menu mix",
    ],
    "hospitality leadership": [
      "hospitality leadership",
      "restaurant culture",
      "team leadership",
      "owner mindset",
      "restaurant leadership",
    ],
  };
  const stems =
    byPillar[args.pillar.trim()] ||
    [
      args.pillar.trim() || "restaurant operations",
      "restaurant tips",
      "restaurant systems",
      "restaurant training",
      "restaurant growth",
    ];
  return stems.slice(0, count);
}

export function normalizePopularQuery(raw: string): string | null {
  const clean = raw.replace(/#/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const words = clean.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 4) return null;
  return clean;
}

export function shouldUseInstagramPopularDiscovery(pillar: string): boolean {
  const clean = pillar.trim();
  return clean !== VIRAL_SEED_POOL_PILLAR && RESTAURANT_PILLARS.has(clean);
}

export function shouldRunInstagramHashtagFallback(args: {
  admittedCount: number;
  remainingBudget: number;
}): boolean {
  return (
    args.admittedCount < VIRAL_POOL_DEFAULTS.instagramPoolMinPopularAdmittedToSkipFallback &&
    args.remainingBudget >= 5
  );
}

/** Pure planner: Popular budget + leftover must never exceed maxScCalls. */
export function planInstagramAdaptiveBudgets(maxScCalls: number): {
  popularBudget: number;
  maxFallbackBudget: number;
} {
  const ceiling = Math.max(0, maxScCalls);
  const popularBudget = Math.min(
    VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularScCalls,
    ceiling
  );
  return {
    popularBudget,
    maxFallbackBudget: Math.max(0, ceiling - popularBudget),
  };
}

export function mergeInstagramPopularRows(
  rows: Array<InstagramSearchPost & { query: string }>
): InstagramPopularRow[] {
  const byId = new Map<string, InstagramPopularRow>();
  for (const row of rows) {
    const existing = byId.get(row.shortcode);
    if (!existing) {
      byId.set(row.shortcode, { ...row, queries: [row.query] });
      continue;
    }
    if (!existing.queries.includes(row.query)) existing.queries.push(row.query);
    if ((row.views ?? 0) > (existing.views ?? 0)) existing.views = row.views;
    if ((row.likes ?? 0) > (existing.likes ?? 0)) existing.likes = row.likes;
    if ((row.comments ?? 0) > (existing.comments ?? 0)) existing.comments = row.comments;
    if (!existing.ownerUsername && row.ownerUsername) existing.ownerUsername = row.ownerUsername;
  }
  return [...byId.values()];
}

export function scoreInstagramPopularPost(
  post: InstagramPopularRow
): InstagramPopularStrictRow | null {
  if (
    post.views == null ||
    post.views <= 0 ||
    post.ownerFollowerCount == null ||
    post.ownerFollowerCount <= 0
  ) {
    return null;
  }
  const scored = scoreViralMetrics({
    views: post.views,
    likes: post.likes ?? 0,
    comments: post.comments ?? 0,
    followers: post.ownerFollowerCount,
    isPrivate: post.ownerIsPrivate === true,
  });
  if (!scored) return null;
  return { post, score: scored };
}

export function rankInstagramPopularPrimaryRows(args: {
  posts: InstagramPopularRow[];
  verdicts: SemanticPoolVerdict[];
  pillar: string;
}): RankedPrimaryRow[] {
  const byVerdict = new Map(args.verdicts.map((verdict) => [verdict.sourceId, verdict]));
  return args.posts
    .map((post) => {
      const verdict = byVerdict.get(post.shortcode);
      if (
        post.views == null ||
        post.views < TIER2_MIN_VIEWS ||
        !post.ownerUsername ||
        !verdict?.domainRelevant ||
        verdict.primaryPillar !== args.pillar ||
        verdict.confidence < MIN_SEMANTIC_POOL_CONFIDENCE
      ) {
        return null;
      }
      return {
        post,
        verdict,
        score: verdict.confidence * Math.log10(1 + post.views),
      };
    })
    .filter((row): row is RankedPrimaryRow => row !== null)
    .sort((a, b) => b.score - a.score);
}

export function selectInstagramPopularCreators(args: {
  ranked: RankedPrimaryRow[];
  queries: string[];
  maxCreators: number;
}): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const query of args.queries) {
    if (selected.length >= args.maxCreators) break;
    const row = args.ranked.find((candidate) => {
      if (!candidate.post.queries.includes(query)) return false;
      const handle = candidate.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
      return Boolean(handle) && !seen.has(handle);
    });
    if (!row) continue;
    const handle = row.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
    seen.add(handle);
    selected.push(handle);
  }

  for (const row of args.ranked) {
    if (selected.length >= args.maxCreators) break;
    const handle = row.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    selected.push(handle);
  }

  return selected;
}

function prequalifiesForDetail(post: InstagramPopularRow): boolean {
  if (
    post.views == null ||
    post.views < TIER2_MIN_VIEWS ||
    post.ownerFollowerCount == null ||
    post.ownerFollowerCount <= 0 ||
    post.ownerIsPrivate === true
  ) {
    return false;
  }
  return post.views / post.ownerFollowerCount >= TIER2_MIN_REACH_MULTIPLIER;
}

export function selectInstagramPopularPostsForDetail(args: {
  posts: InstagramPopularRow[];
  verdicts: SemanticPoolVerdict[];
  pillar: string;
  maxPosts: number;
}): InstagramPopularRow[] {
  const byVerdict = new Map(args.verdicts.map((verdict) => [verdict.sourceId, verdict]));
  return args.posts
    .filter((post) => {
      const verdict = byVerdict.get(post.shortcode);
      return (
        prequalifiesForDetail(post) &&
        verdict?.domainRelevant === true &&
        verdict.primaryPillar === args.pillar &&
        verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE
      );
    })
    .sort((a, b) => {
      const va = byVerdict.get(a.shortcode)?.confidence ?? 0;
      const vb = byVerdict.get(b.shortcode)?.confidence ?? 0;
      const reachA = (a.views ?? 0) / Math.max(1, a.ownerFollowerCount ?? 1);
      const reachB = (b.views ?? 0) / Math.max(1, b.ownerFollowerCount ?? 1);
      return vb * Math.log10(1 + reachB) - va * Math.log10(1 + reachA);
    })
    .slice(0, Math.max(0, args.maxPosts));
}

export function dedupeAdaptedCandidates(
  rows: AdaptedCandidate[]
): AdaptedCandidate[] {
  const byId = new Map<string, AdaptedCandidate>();
  for (const row of rows) {
    if (!byId.has(row.sourceId)) byId.set(row.sourceId, row);
  }
  return [...byId.values()];
}

export function dedupeSemanticReroutes(
  rows: SemanticPoolReroute[]
): SemanticPoolReroute[] {
  const byId = new Map<string, SemanticPoolReroute>();
  for (const row of rows) {
    if (!byId.has(row.candidate.sourceId)) byId.set(row.candidate.sourceId, row);
  }
  return [...byId.values()];
}

function toAdapted(post: InstagramPopularRow, niche: string, pillar: string): AdaptedCandidate {
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
    relevanceLabel: "Instagram Popular discovery",
    relevanceReason: `Popular search candidate for ${niche} / ${pillar}`,
    hook: deriveHook(caption),
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: {
      source: "instagram_popular_discovery",
      queries: post.queries,
    },
  };
}

function applyProfile(
  posts: InstagramPopularRow[],
  handle: string,
  profile: Awaited<ReturnType<typeof fetchProfile>>
): void {
  const clean = handle.replace(/^@/, "").trim().toLowerCase();
  for (const post of posts) {
    if (post.ownerUsername.replace(/^@/, "").trim().toLowerCase() !== clean) continue;
    if (!post.ownerFollowerCount && profile.followerCount > 0) {
      post.ownerFollowerCount = profile.followerCount;
    }
    post.ownerIsPrivate = profile.isPrivate;
    post.ownerIsVerified = profile.isVerified;
  }
}

function mergePostDetail(post: InstagramPopularRow, detail: InstagramSearchPost): void {
  post.views = detail.views ?? post.views;
  post.likes = detail.likes ?? post.likes;
  post.comments = detail.comments ?? post.comments;
  post.publishedAt = detail.publishedAt ?? post.publishedAt;
  post.thumbnailUrl = detail.thumbnailUrl ?? post.thumbnailUrl;
  post.videoUrl = detail.videoUrl ?? post.videoUrl;
  post.ownerUsername = detail.ownerUsername || post.ownerUsername;
  post.ownerFollowerCount = detail.ownerFollowerCount ?? post.ownerFollowerCount;
  post.ownerIsPrivate = detail.ownerIsPrivate ?? post.ownerIsPrivate;
  post.ownerIsVerified = detail.ownerIsVerified ?? post.ownerIsVerified;
}

async function generatePopularQueries(args: {
  niche: string;
  pillar: string;
  count: number;
}): Promise<{ queries: string[]; haikuCalls: number }> {
  const count = Math.max(1, Math.min(5, args.count));
  const fallback = fallbackInstagramPopularQueries({ pillar: args.pillar, count });
  const siblings = DEFAULT_CONTENT_PILLARS.filter((pillar) => pillar !== args.pillar);
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
        "You write short Instagram Popular Search phrases. Prefer 2 to 3 word topic phrases. Return JSON only. Do not use em dashes.",
      messages: [
        {
          role: "user",
          content: `Generate exactly ${count} Instagram Popular search phrases for pillar "${args.pillar}" in niche "${args.niche}".

Do NOT aim at these sibling pillars: ${siblings.join(", ")}.

Rules:
1. Prefer short 2-3 word topic phrases people actually search.
2. Avoid long descriptive 4-word adjective phrases when a shorter topic phrase exists.
3. No hashtags. No sentences.
4. Aim at restaurant/hospitality OPERATOR lessons for the TARGET pillar only, not recipes or entertainment.
5. Return {"queries":["..."]}.`,
        },
      ],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as {
      queries?: unknown;
    };
    const generated = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((item): item is string => typeof item === "string")
          .map(normalizePopularQuery)
          .filter((item): item is string => Boolean(item))
      : [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const query of [...generated, ...fallback]) {
      const key = query.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(query);
      if (out.length >= count) break;
    }
    return { queries: out.slice(0, count), haikuCalls: 1 };
  } catch (error) {
    console.warn("[viralPosts.popular] instagram_query_generation_failed", {
      pillar: args.pillar,
      error: error instanceof Error ? error.message : String(error),
    });
    return { queries: fallback, haikuCalls: 0 };
  }
}

/**
 * Popular-first Instagram discovery for restaurant/hospitality Viral Posts pools.
 * Consumes from the shared maxScCalls budget via the discovery SC tracker.
 * Does not persist; callers reuse the canonical poolRefresh persistence path.
 */
export async function discoverInstagramPopularFirstCandidates(args: {
  niche: string;
  pillar: string;
  maxScCalls: number;
}): Promise<InstagramPopularDiscoveryResult> {
  const maxScCalls = Math.max(0, Math.min(
    VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularScCalls,
    args.maxScCalls
  ));
  const empty: InstagramPopularDiscoveryResult = {
    adapted: [],
    reroutedCandidates: [],
    semanticRejectedCandidates: [],
    generatedQueries: [],
    popularCalls: 0,
    popularSuccesses: 0,
    popularFailures: 0,
    rawPosts: 0,
    uniquePosts: 0,
    uniqueCreators: 0,
    targetPrefilter: 0,
    profileCalls: 0,
    postDetailCalls: 0,
    strictViral: 0,
    semanticHaikuCalls: 0,
    queryGenerationHaikuCalls: 0,
    semanticRejected: 0,
    semanticRerouted: 0,
    totalScCalls: 0,
    costEstimateUsd: 0,
    selectedCreators: [],
  };
  if (maxScCalls <= 0 || !shouldUseInstagramPopularDiscovery(args.pillar)) {
    return empty;
  }

  const queryGen = await generatePopularQueries({
    niche: args.niche,
    pillar: args.pillar,
    count: VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularQueries,
  });
  const tracker = createDiscoveryScCallTracker(maxScCalls);

  return runWithDiscoveryScCallTracker(tracker, async () => {
    const collected: Array<InstagramSearchPost & { query: string }> = [];
    let popularCalls = 0;
    let popularSuccesses = 0;
    let popularFailures = 0;
    let rawPosts = 0;

    for (const query of queryGen.queries) {
      if (tracker.count >= tracker.maxCalls) break;
      try {
        const result = await searchInstagramPopular(query);
        popularCalls += 1;
        popularSuccesses += 1;
        rawPosts += result.rawCount;
        for (const post of result.posts) collected.push({ ...post, query });
      } catch (error) {
        popularCalls += 1;
        popularFailures += 1;
        console.warn("[viralPosts.popular] instagram_popular_failed", {
          query,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const posts = mergeInstagramPopularRows(collected);
    let prefilterHaiku = 0;
    let prefilterVerdicts: SemanticPoolVerdict[] = [];
    if (posts.length > 0) {
      const classified = await classifySemanticPoolRelevance({
        niche: args.niche,
        candidates: posts.map((post) => toAdapted(post, args.niche, args.pillar)),
      });
      prefilterVerdicts = classified.verdicts;
      prefilterHaiku = classified.haikuCalls;
    }

    const ranked = rankInstagramPopularPrimaryRows({
      posts,
      verdicts: prefilterVerdicts,
      pillar: args.pillar,
    });
    const selectedCreators = selectInstagramPopularCreators({
      ranked,
      queries: queryGen.queries,
      maxCreators: Math.min(
        VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularProfileCalls,
        Math.max(0, tracker.maxCalls - tracker.count)
      ),
    });

    let profileCalls = 0;
    for (const handle of selectedCreators) {
      if (tracker.count >= tracker.maxCalls) break;
      try {
        const profile = await fetchProfile(handle);
        profileCalls += 1;
        applyProfile(posts, handle, profile);
      } catch (error) {
        profileCalls += 1;
        console.warn("[viralPosts.popular] instagram_profile_failed", {
          handle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const detailSelected = selectInstagramPopularPostsForDetail({
      posts,
      verdicts: prefilterVerdicts,
      pillar: args.pillar,
      maxPosts: Math.min(
        VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularPostDetailCalls,
        Math.max(0, tracker.maxCalls - tracker.count)
      ),
    });
    let postDetailCalls = 0;
    for (const post of detailSelected) {
      if (tracker.count >= tracker.maxCalls) break;
      try {
        const detail = await enrichInstagramPostByUrl(post.sourceUrl);
        postDetailCalls += 1;
        if (detail) mergePostDetail(post, detail);
      } catch (error) {
        postDetailCalls += 1;
        console.warn("[viralPosts.popular] instagram_post_detail_failed", {
          shortcode: post.shortcode,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const byVerdict = new Map(prefilterVerdicts.map((verdict) => [verdict.sourceId, verdict]));
    const strictRows: InstagramPopularStrictRow[] = [];
    for (const post of posts) {
      const verdict = byVerdict.get(post.shortcode);
      if (
        !verdict?.domainRelevant ||
        verdict.primaryPillar !== args.pillar ||
        verdict.confidence < MIN_SEMANTIC_POOL_CONFIDENCE
      ) {
        continue;
      }
      const scored = scoreInstagramPopularPost(post);
      if (scored) strictRows.push(scored);
    }

    let finalHaiku = 0;
    let routed = {
      currentPool: [] as AdaptedCandidate[],
      rerouted: [] as SemanticPoolReroute[],
      rejected: [] as SemanticPoolRejected[],
    };
    if (strictRows.length > 0) {
      const finalCandidates = strictRows.map((row) => {
        const candidate = toAdapted(row.post, args.niche, args.pillar);
        candidate.creatorFollowers = row.post.ownerFollowerCount;
        candidate.views = row.post.views;
        candidate.likes = row.post.likes;
        candidate.comments = row.post.comments;
        candidate.reachMultiplier = row.score.reachMultiplier;
        candidate.engagementRate = row.score.engagementRate;
        return candidate;
      });
      const finalSemantic = await classifySemanticPoolRelevance({
        niche: args.niche,
        candidates: finalCandidates,
      });
      finalHaiku = finalSemantic.haikuCalls;
      routed = routeSemanticPoolCandidates({
        sourcePillar: args.pillar,
        candidates: finalCandidates,
        verdicts: finalSemantic.verdicts,
      });
    }

    const totalScCalls = tracker.count;
    const usdPerCredit =
      Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || DEFAULT_SC_USD_PER_CREDIT;

    console.info("[viralPosts.popular] instagram_popular_first", {
      pillar: args.pillar,
      niche: args.niche,
      queries: queryGen.queries,
      popularCalls,
      popularSuccesses,
      popularFailures,
      profileCalls,
      postDetailCalls,
      totalScCalls,
      uniquePosts: posts.length,
      targetPrefilter: ranked.length,
      strictViral: strictRows.length,
      currentPoolAdmitted: routed.currentPool.length,
      semanticRejected: routed.rejected.length,
      semanticRerouted: routed.rerouted.length,
    });

    return {
      adapted: routed.currentPool,
      reroutedCandidates: routed.rerouted,
      semanticRejectedCandidates: routed.rejected,
      generatedQueries: queryGen.queries,
      popularCalls,
      popularSuccesses,
      popularFailures,
      rawPosts,
      uniquePosts: posts.length,
      uniqueCreators: new Set(
        posts.map((post) => post.ownerUsername.replace(/^@/, "").trim().toLowerCase()).filter(Boolean)
      ).size,
      targetPrefilter: ranked.length,
      profileCalls,
      postDetailCalls,
      strictViral: strictRows.length,
      semanticHaikuCalls: prefilterHaiku + finalHaiku,
      queryGenerationHaikuCalls: queryGen.haikuCalls,
      semanticRejected: routed.rejected.length,
      semanticRerouted: routed.rerouted.length,
      totalScCalls,
      costEstimateUsd: totalScCalls * usdPerCredit,
      selectedCreators,
    };
  });
}
