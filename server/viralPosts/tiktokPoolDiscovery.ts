import Anthropic from "@anthropic-ai/sdk";
import { reportDirectAnthropicUsage } from "../_core/llmMeasured";
import {
  searchTikTokKeyword,
  searchTikTokTop,
  type TikTokVideoData,
} from "../tiktok";
import { scoreViralMetrics } from "../discovery/scoring";
import { adaptTikTokVideos } from "./platformAdapters";
import type { AdaptedCandidate } from "./candidateAdapter";
import {
  DEFAULT_CONTENT_PILLARS,
  VIRAL_POOL_DEFAULTS,
  VIRAL_SEED_POOL_PILLAR,
} from "./constants";
import {
  classifySemanticPoolRelevance,
  routeSemanticPoolCandidates,
  SEMANTIC_POOL_MODEL,
  type SemanticPoolRejected,
  type SemanticPoolReroute,
} from "./semanticPoolRelevance";

const DEFAULT_SC_USD_PER_CREDIT = 0.002;
const RESTAURANT_PILLARS = new Set<string>(DEFAULT_CONTENT_PILLARS);

export type TikTokPoolDiscoveryResult = {
  adapted: AdaptedCandidate[];
  reroutedCandidates: SemanticPoolReroute[];
  semanticRejectedCandidates: SemanticPoolRejected[];
  generatedQueries: string[];
  keywordQueries: string[];
  topQueries: string[];
  keywordCalls: number;
  topCalls: number;
  totalScCalls: number;
  queryGenerationHaikuCalls: number;
  semanticHaikuCalls: number;
  rawVideos: number;
  uniqueVideos: number;
  uniqueCreators: number;
  keywordTopOverlap: number;
  viewsAvailable: number;
  followersAvailable: number;
  bothMetricsAvailable: number;
  drilledViralCandidates: number;
  semanticRejected: number;
  semanticRerouted: number;
  costEstimateUsd: number;
  strictViralRows: TikTokStrictViralRow[];
};

export type TikTokStrictViralRow = {
  video: TikTokVideoData;
  lane: "keyword" | "top";
  query: string;
  tier: 1 | 2;
  viralScore: number;
  reachMultiplier: number;
};

export function fallbackTikTokSearchQueries(args: {
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

export async function generateTikTokSearchQueries(args: {
  niche: string;
  pillar: string;
  count: number;
}): Promise<{ queries: string[]; haikuCalls: number }> {
  const count = Math.max(1, Math.min(5, args.count));
  const fallback = fallbackTikTokSearchQueries({ ...args, count });
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
        "You write short TikTok search phrases for finding operator-useful short-form videos. Return JSON only. Do not use em dashes.",
      messages: [
        {
          role: "user",
          content: `Generate exactly ${count} TikTok search phrases for pillar "${args.pillar}" in niche "${args.niche}".
Each phrase should be 3 to 6 words, no hashtags, and aimed at business/operator lessons rather than recipes or entertainment.
Return {"queries":["..."]}.`,
        },
      ],
    });
    reportDirectAnthropicUsage(response, "tiktok_pool_search_query_gen");

    const textBlock = response.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "{}";
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as {
      queries?: unknown;
    };
    const queries = Array.isArray(parsed.queries)
      ? parsed.queries
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.replace(/#/g, "").replace(/\s+/g, " ").trim())
          .filter((item) => item.length >= 3)
      : [];
    if (queries.length === 0) return { queries: fallback, haikuCalls: 1 };
    return { queries: queries.slice(0, count), haikuCalls: 1 };
  } catch (error) {
    console.warn("[viralPosts.pool] tiktok_query_generation_failed", {
      pillar: args.pillar,
      error: error instanceof Error ? error.message : String(error),
    });
    return { queries: fallback, haikuCalls: 0 };
  }
}

export function dedupeTikTokVideos(videos: TikTokVideoData[]): TikTokVideoData[] {
  const byId = new Map<string, TikTokVideoData>();
  for (const video of videos) {
    const existing = byId.get(video.awemeId);
    if (!existing) {
      byId.set(video.awemeId, video);
      continue;
    }
    if ((video.viewCount || 0) > (existing.viewCount || 0)) {
      byId.set(video.awemeId, video);
    }
  }
  return [...byId.values()];
}

export function scoreTikTokSearchVideo(video: TikTokVideoData) {
  const followers = video.creatorFollowerCount;
  if (followers == null || followers <= 0) return null;
  if (!Number.isFinite(video.viewCount) || video.viewCount <= 0) return null;
  return scoreViralMetrics({
    views: video.viewCount,
    likes: video.likeCount,
    comments: video.commentCount,
    followers,
  });
}

/** Pillars the semantic check may assign for this pool. Pure; exported for tests. */
export function tiktokSemanticActivePillars(pillar: string): string[] | undefined {
  const clean = pillar.trim();
  return RESTAURANT_PILLARS.has(clean) ? undefined : [clean];
}

export function shouldUseTikTokSearchDiscovery(pillar: string): boolean {
  return pillar.trim() !== VIRAL_SEED_POOL_PILLAR && pillar.trim().length > 0;
}

export function shouldRunTikTokSeedFallback(args: {
  admittedCount: number;
  remainingBudget: number;
}): boolean {
  return (
    args.admittedCount < VIRAL_POOL_DEFAULTS.tiktokPoolMinSearchAdmittedToSkipSeeds &&
    args.remainingBudget >= VIRAL_POOL_DEFAULTS.seedScCallsPerHandle
  );
}

export function allocateTikTokSearchQueries(args: {
  queries: string[];
  maxScCalls: number;
}): { keywordQueries: string[]; topQueries: string[] } {
  const maxCalls = Math.max(0, Math.min(VIRAL_POOL_DEFAULTS.tiktokPoolMaxSearchCalls, args.maxScCalls));
  const keywordCount = Math.min(
    VIRAL_POOL_DEFAULTS.tiktokPoolMaxKeywordQueries,
    maxCalls,
    args.queries.length
  );
  const keywordQueries = args.queries.slice(0, keywordCount);
  const remaining = maxCalls - keywordQueries.length;
  const topCount = Math.min(
    VIRAL_POOL_DEFAULTS.tiktokPoolMaxTopQueries,
    remaining,
    args.queries.length
  );
  return {
    keywordQueries,
    topQueries: args.queries.slice(0, topCount),
  };
}

function uniqueCreatorCount(videos: TikTokVideoData[]): number {
  return new Set(
    videos
      .map((video) => video.ownerUsername.replace(/^@/, "").trim().toLowerCase())
      .filter(Boolean)
  ).size;
}

export async function discoverTikTokPoolCandidates(args: {
  niche: string;
  pillar: string;
  maxScCalls: number;
  region?: string;
}): Promise<TikTokPoolDiscoveryResult> {
  const generated = await generateTikTokSearchQueries({
    niche: args.niche,
    pillar: args.pillar,
    count: 5,
  });
  const allocated = allocateTikTokSearchQueries({
    queries: generated.queries,
    maxScCalls: args.maxScCalls,
  });

  const keywordVideos: Array<TikTokVideoData & { query: string }> = [];
  const topVideos: Array<TikTokVideoData & { query: string }> = [];
  let rawVideos = 0;
  let keywordCalls = 0;
  let topCalls = 0;

  for (const query of allocated.keywordQueries) {
    try {
      const result = await searchTikTokKeyword(query, { region: args.region });
      keywordCalls += 1;
      rawVideos += result.rawCount;
      for (const video of result.videos) {
        keywordVideos.push({ ...video, query });
      }
    } catch (error) {
      keywordCalls += 1;
      console.warn("[viralPosts.pool] tiktok_keyword_search_failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const query of allocated.topQueries) {
    try {
      const result = await searchTikTokTop(query, { region: args.region });
      topCalls += 1;
      rawVideos += result.rawCount;
      for (const video of result.videos) {
        topVideos.push({ ...video, query });
      }
    } catch (error) {
      topCalls += 1;
      console.warn("[viralPosts.pool] tiktok_top_search_failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const keywordIds = new Set(keywordVideos.map((video) => video.awemeId));
  const topIds = new Set(topVideos.map((video) => video.awemeId));
  let keywordTopOverlap = 0;
  for (const id of keywordIds) {
    if (topIds.has(id)) keywordTopOverlap++;
  }

  const uniqueVideos = dedupeTikTokVideos([...keywordVideos, ...topVideos]);
  const viewsAvailable = uniqueVideos.filter((video) => video.viewCount > 0).length;
  const followersAvailable = uniqueVideos.filter(
    (video) => (video.creatorFollowerCount ?? 0) > 0
  ).length;
  const bothMetricsAvailable = uniqueVideos.filter(
    (video) => video.viewCount > 0 && (video.creatorFollowerCount ?? 0) > 0
  ).length;

  const strictRows: TikTokStrictViralRow[] = [];
  const laneById = new Map<string, "keyword" | "top">();
  const queryById = new Map<string, string>();
  for (const video of keywordVideos) {
    laneById.set(video.awemeId, "keyword");
    queryById.set(video.awemeId, video.query);
  }
  for (const video of topVideos) {
    if (!laneById.has(video.awemeId)) laneById.set(video.awemeId, "top");
    if (!queryById.has(video.awemeId)) queryById.set(video.awemeId, video.query);
  }

  for (const video of uniqueVideos) {
    const scored = scoreTikTokSearchVideo(video);
    if (!scored) continue;
    strictRows.push({
      video,
      lane: laneById.get(video.awemeId) ?? "keyword",
      query: queryById.get(video.awemeId) ?? "",
      tier: scored.tier,
      viralScore: scored.viralScore,
      reachMultiplier: scored.reachMultiplier,
    });
  }

  const adaptedBeforeAdmission = adaptTikTokVideos(
    strictRows.map((row) => row.video),
    { niche: args.niche }
  ).map((candidate) => ({
    ...candidate,
    rawProviderPayload: {
      ...candidate.rawProviderPayload,
      source: "tiktok_pool_discovery",
      retrievalDepth: "tiktok_search",
    },
  }));

  let adapted: AdaptedCandidate[] = [];
  let reroutedCandidates: SemanticPoolReroute[] = [];
  let semanticRejectedCandidates: SemanticPoolRejected[] = [];
  let semanticHaikuCalls = 0;

  if (RESTAURANT_PILLARS.has(args.pillar) || adaptedBeforeAdmission.length > 0) {
    try {
      const classified = await classifySemanticPoolRelevance({
        niche: args.niche,
        // Restaurant pillars keep the six-pillar family (videos may move
        // between them). Any other pool is judged against its own topic only,
        // so videos are never pushed into restaurant pools by default.
        activePillars: tiktokSemanticActivePillars(args.pillar),
        candidates: adaptedBeforeAdmission,
      });
      semanticHaikuCalls = classified.haikuCalls;
      const routed = routeSemanticPoolCandidates({
        sourcePillar: args.pillar,
        candidates: adaptedBeforeAdmission,
        verdicts: classified.verdicts,
      });
      adapted = routed.currentPool;
      reroutedCandidates = routed.rerouted;
      semanticRejectedCandidates = routed.rejected;
    } catch (error) {
      console.error("[viralPosts.pool] tiktok_semantic_classification_failed", {
        pillar: args.pillar,
        niche: args.niche,
        candidateCount: adaptedBeforeAdmission.length,
        error: error instanceof Error ? error.message : String(error),
      });
      semanticRejectedCandidates = adaptedBeforeAdmission.map((candidate) => ({
        candidate,
        verdict: null,
        reason: "missing_verdict" as const,
      }));
    }
  }

  const totalScCalls = keywordCalls + topCalls;
  const usdPerCredit =
    Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || DEFAULT_SC_USD_PER_CREDIT;

  console.info("[viralPosts.pool] tiktok_retrieval_search", {
    pillar: args.pillar,
    niche: args.niche,
    generatedQueries: generated.queries,
    keywordQueries: allocated.keywordQueries,
    topQueries: allocated.topQueries,
    keywordCalls,
    topCalls,
    totalScCalls,
    rawVideos,
    uniqueVideos: uniqueVideos.length,
    keywordTopOverlap,
    drilledViralCandidates: strictRows.length,
    currentPoolAdmitted: adapted.length,
    semanticRejected: semanticRejectedCandidates.length,
    semanticRerouted: reroutedCandidates.length,
  });

  return {
    adapted,
    reroutedCandidates,
    semanticRejectedCandidates,
    generatedQueries: generated.queries,
    keywordQueries: allocated.keywordQueries,
    topQueries: allocated.topQueries,
    keywordCalls,
    topCalls,
    totalScCalls,
    queryGenerationHaikuCalls: generated.haikuCalls,
    semanticHaikuCalls,
    rawVideos,
    uniqueVideos: uniqueVideos.length,
    uniqueCreators: uniqueCreatorCount(uniqueVideos),
    keywordTopOverlap,
    viewsAvailable,
    followersAvailable,
    bothMetricsAvailable,
    drilledViralCandidates: strictRows.length,
    semanticRejected: semanticRejectedCandidates.length,
    semanticRerouted: reroutedCandidates.length,
    costEstimateUsd: totalScCalls * usdPerCredit,
    strictViralRows: strictRows,
  };
}
