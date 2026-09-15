import type { YouTubeVideoData } from "../youtube";
import type { AdaptedCandidate } from "./candidateAdapter";
import { adaptYouTubeShorts } from "./platformAdapters";
import {
  classifySemanticPoolRelevance,
  routeSemanticPoolCandidates,
  type SemanticPoolRejected,
} from "./semanticPoolRelevance";
import { generateYouTubeShortsSearchQueries } from "./youtubeQueryGeneration";

const SCRAPECREATORS_API_BASE = "https://api.scrapecreators.com";
const DEFAULT_SC_USD_PER_CREDIT = 0.002;
const YOUTUBE_SEARCH_TIMEOUT_MS = 25_000;
export const YOUTUBE_POOL_MAX_SEARCH_QUERIES = 3;
export const YOUTUBE_POOL_MIN_VIEWS = 1_000;

export type YouTubePoolDiscoveryResult = {
  adapted: AdaptedCandidate[];
  semanticRejectedCandidates: SemanticPoolRejected[];
  generatedQueries: string[];
  searchCalls: number;
  searchSuccesses: number;
  searchFailures: number;
  rawShorts: number;
  uniqueShorts: number;
  prequalifiedShorts: number;
  semanticHaikuCalls: number;
  semanticRejected: number;
  totalScCalls: number;
  costEstimateUsd: number;
};

type YouTubeSearchResponse = {
  success?: boolean;
  shorts?: unknown[];
  videos?: unknown[];
};

function toFiniteNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanHandle(value: unknown): string {
  return cleanText(value).replace(/^@/, "");
}

function uniqueNonEmpty(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const clean = value.replace(/\s+/g, " ").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/**
 * Deterministic fallback used when AI query generation is unavailable.
 * Live discovery now prefers creator-language queries from youtubeQueryGeneration.
 */
export function buildYouTubeShortsSearchQueries(args: {
  niche: string;
  pillar: string;
  limit?: number;
}): string[] {
  const niche = args.niche.trim();
  const pillar = args.pillar.trim();
  const limit = Math.max(
    1,
    Math.min(args.limit ?? YOUTUBE_POOL_MAX_SEARCH_QUERIES, YOUTUBE_POOL_MAX_SEARCH_QUERIES)
  );

  return uniqueNonEmpty([
    pillar,
    niche && pillar ? `${niche} ${pillar}` : "",
    niche,
  ]).slice(0, limit);
}

/** Parse the fields we need from either the Search API's `shorts` or `videos` array. */
export function parseYouTubeSearchShort(row: unknown): YouTubeVideoData | null {
  if (!row || typeof row !== "object") return null;
  const raw = row as Record<string, unknown>;
  const type = cleanText(raw.type).toLowerCase();
  if (type && type !== "short") return null;

  const videoId = cleanText(raw.id ?? raw.videoId);
  if (!videoId) return null;

  const publishedRaw = cleanText(raw.publishDate ?? raw.publishedAt ?? raw.publishedTime);
  const postedAt = publishedRaw ? new Date(publishedRaw) : null;
  if (!postedAt || Number.isNaN(postedAt.getTime())) return null;

  const channel =
    raw.channel && typeof raw.channel === "object"
      ? (raw.channel as Record<string, unknown>)
      : {};
  const ownerHandle =
    cleanHandle(channel.handle ?? raw.channelHandle ?? raw.ownerHandle) ||
    cleanText(channel.title ?? raw.channelTitle) ||
    "youtube";

  const viewCount = toFiniteNumber(raw.viewCountInt ?? raw.viewCount ?? raw.views);
  const likeCount = toFiniteNumber(raw.likeCountInt ?? raw.likeCount ?? raw.likes);
  const commentCount = toFiniteNumber(
    raw.commentCountInt ?? raw.commentCount ?? raw.comments
  );

  return {
    videoId,
    title: cleanText(raw.title),
    description: cleanText(raw.description),
    viewCount,
    likeCount,
    commentCount,
    thumbnailUrl: cleanText(raw.thumbnail ?? raw.thumbnailUrl),
    videoPageUrl:
      cleanText(raw.url ?? raw.videoPageUrl) ||
      `https://www.youtube.com/shorts/${videoId}`,
    durationSec: toFiniteNumber(raw.durationSec),
    postedAt,
    ownerHandle,
  };
}

export function extractYouTubeSearchShorts(data: unknown): YouTubeVideoData[] {
  if (!data || typeof data !== "object") return [];
  const root = data as YouTubeSearchResponse;
  const rows = [
    ...(Array.isArray(root.shorts) ? root.shorts : []),
    ...(Array.isArray(root.videos) ? root.videos : []),
  ];

  const byId = new Map<string, YouTubeVideoData>();
  for (const row of rows) {
    const parsed = parseYouTubeSearchShort(row);
    if (!parsed || byId.has(parsed.videoId)) continue;
    byId.set(parsed.videoId, parsed);
  }
  return [...byId.values()];
}

export function prequalifyYouTubeSearchShorts(
  shorts: YouTubeVideoData[]
): YouTubeVideoData[] {
  return shorts.filter(
    (short) =>
      Number.isFinite(short.viewCount) && short.viewCount >= YOUTUBE_POOL_MIN_VIEWS
  );
}

async function searchYouTubeShorts(args: {
  query: string;
  region?: string;
}): Promise<YouTubeVideoData[]> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPECREATORS_API_KEY is not configured");

  const url = new URL(`${SCRAPECREATORS_API_BASE}/v1/youtube/search`);
  url.searchParams.set("query", args.query);
  url.searchParams.set("type", "shorts");
  url.searchParams.set("sortBy", "popular");
  url.searchParams.set("uploadDate", "this_month");
  url.searchParams.set("includeExtras", "true");
  if (args.region?.trim()) url.searchParams.set("region", args.region.trim());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), YOUTUBE_SEARCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) {
      throw new Error(`YouTube Shorts search failed: HTTP ${response.status}`);
    }
    if (data && typeof data === "object" && (data as YouTubeSearchResponse).success === false) {
      throw new Error("YouTube Shorts search provider returned success=false");
    }
    return extractYouTubeSearchShorts(data);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Search-first YouTube Shorts supply for one niche/pillar pool.
 * This module does not create pools, change ranking, or enable YouTube in production.
 */
export async function discoverYouTubePoolCandidates(args: {
  niche: string;
  pillar: string;
  maxScCalls: number;
  region?: string;
}): Promise<YouTubePoolDiscoveryResult> {
  const maxScCalls = Math.max(0, Math.floor(args.maxScCalls));
  const queryGeneration = await generateYouTubeShortsSearchQueries({
    niche: args.niche,
    pillar: args.pillar,
    limit: Math.min(YOUTUBE_POOL_MAX_SEARCH_QUERIES, maxScCalls || 1),
  });
  const queries = queryGeneration.queries;

  const allShorts = new Map<string, YouTubeVideoData>();
  let searchCalls = 0;
  let searchSuccesses = 0;
  let searchFailures = 0;
  let rawShorts = 0;

  for (const query of queries) {
    if (searchCalls >= maxScCalls) break;
    searchCalls++;
    try {
      const shorts = await searchYouTubeShorts({ query, region: args.region });
      searchSuccesses++;
      rawShorts += shorts.length;
      for (const short of shorts) {
        if (!allShorts.has(short.videoId)) allShorts.set(short.videoId, short);
      }
    } catch (error) {
      searchFailures++;
      console.warn("[viralPosts.youtube] search_failed", {
        niche: args.niche,
        pillar: args.pillar,
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const uniqueShorts = [...allShorts.values()];
  const prequalified = prequalifyYouTubeSearchShorts(uniqueShorts);
  const beforeSemantic = adaptYouTubeShorts(prequalified, {
    niche: args.niche,
    creatorFollowers: 0,
    creatorAvatarUrl: "",
  }).map((candidate) => ({
    ...candidate,
    rawProviderPayload: {
      ...candidate.rawProviderPayload,
      source: "youtube_pool_discovery",
      discoveryNiche: args.niche,
      discoveryPillar: args.pillar,
    },
  }));

  let adapted: AdaptedCandidate[] = [];
  let semanticRejectedCandidates: SemanticPoolRejected[] = [];
  let semanticHaikuCalls = 0;

  if (beforeSemantic.length > 0) {
    const classified = await classifySemanticPoolRelevance({
      niche: args.niche,
      activePillars: [args.pillar],
      candidates: beforeSemantic,
    });
    semanticHaikuCalls = classified.haikuCalls;
    const routed = routeSemanticPoolCandidates({
      sourcePillar: args.pillar,
      candidates: beforeSemantic,
      verdicts: classified.verdicts,
    });
    adapted = routed.currentPool;
    semanticRejectedCandidates = [
      ...routed.rejected,
      ...routed.rerouted.map((row) => ({
        candidate: row.candidate,
        verdict: row.verdict,
        reason: "off_domain" as const,
      })),
    ];
  }

  const usdPerCredit =
    Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || DEFAULT_SC_USD_PER_CREDIT;

  console.info("[viralPosts.youtube] supply_mix", {
    niche: args.niche,
    pillar: args.pillar,
    queries,
    queryGenerationAi: queryGeneration.aiGenerated,
    searchCalls,
    searchSuccesses,
    searchFailures,
    rawShorts,
    uniqueShorts: uniqueShorts.length,
    prequalifiedShorts: prequalified.length,
    semanticHaikuCalls,
    semanticRejected: semanticRejectedCandidates.length,
    currentPoolAdmitted: adapted.length,
  });

  return {
    adapted,
    semanticRejectedCandidates,
    generatedQueries: queries,
    searchCalls,
    searchSuccesses,
    searchFailures,
    rawShorts,
    uniqueShorts: uniqueShorts.length,
    prequalifiedShorts: prequalified.length,
    semanticHaikuCalls,
    semanticRejected: semanticRejectedCandidates.length,
    totalScCalls: searchCalls,
    costEstimateUsd: searchCalls * usdPerCredit,
  };
}
