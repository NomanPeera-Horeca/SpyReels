import "dotenv/config";
import {
  extractYouTubeSearchShorts,
  prequalifyYouTubeSearchShorts,
} from "../server/viralPosts/youtubePoolDiscovery";
import { generateYouTubeShortsSearchQueries } from "../server/viralPosts/youtubeQueryGeneration";
import type { YouTubeVideoData } from "../server/youtube";

type BenchmarkCase = { niche: string; pillar: string };

const CASES: BenchmarkCase[] = [
  { niche: "Restaurants & Cafes", pillar: "restaurant profitability" },
  { niche: "Restaurants & Cafes", pillar: "restaurant marketing" },
  { niche: "Restaurants & Cafes", pillar: "restaurant operations" },
  { niche: "Health & Fitness", pillar: "client growth" },
  { niche: "Health & Fitness", pillar: "content marketing" },
  { niche: "Health & Fitness", pillar: "coaching operations" },
  { niche: "Real Estate", pillar: "lead generation" },
  { niche: "Real Estate", pillar: "listing marketing" },
  { niche: "Real Estate", pillar: "agent systems" },
  { niche: "Beauty", pillar: "client acquisition" },
  { niche: "Beauty", pillar: "client retention" },
  { niche: "Beauty", pillar: "beauty business operations" },
  { niche: "Personal Finance", pillar: "budgeting" },
  { niche: "Personal Finance", pillar: "investing education" },
  { niche: "Personal Finance", pillar: "audience growth" },
];

const API_BASE = "https://api.scrapecreators.com/v1/youtube/search";
const MAX_CALLS_PER_CASE = 2;
const SAMPLE_LIMIT = 5;
const TIMEOUT_MS = 25_000;

function compact(value: string | null | undefined, max = 220): string {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function search(query: string): Promise<YouTubeVideoData[]> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPECREATORS_API_KEY is required");

  const url = new URL(API_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("type", "shorts");
  url.searchParams.set("sortBy", "popular");
  url.searchParams.set("uploadDate", "this_month");
  url.searchParams.set("includeExtras", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
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
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (data && typeof data === "object" && (data as { success?: boolean }).success === false) {
      throw new Error("provider success=false");
    }
    return extractYouTubeSearchShorts(data);
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const runId = process.env.YOUTUBE_PROVIDER_BENCHMARK_RUN_ID?.trim() || `manual-${Date.now()}`;
  const usdPerCredit = Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || 0.002;
  const startedAt = Date.now();
  const summaryRows: Array<{
    niche: string;
    pillar: string;
    searchCalls: number;
    searchFailures: number;
    rawShorts: number;
    uniqueShorts: number;
    prequalifiedShorts: number;
    queryGenerationAi: boolean;
  }> = [];

  console.info("[youtube.providerBenchmark] benchmark_start", {
    runId,
    cases: CASES.length,
    maxCallsPerCase: MAX_CALLS_PER_CASE,
    queryStrategy: "creator_language_ai_v2",
    semanticEvaluation: "not_run_provider_only",
    userExposure: false,
    youtubeFeedEnabled: false,
  });

  for (const testCase of CASES) {
    const queryGeneration = await generateYouTubeShortsSearchQueries({
      niche: testCase.niche,
      pillar: testCase.pillar,
      limit: MAX_CALLS_PER_CASE,
    });
    const queries = queryGeneration.queries;
    const byId = new Map<string, YouTubeVideoData>();
    let searchCalls = 0;
    let searchFailures = 0;
    let rawShorts = 0;

    for (const query of queries) {
      searchCalls++;
      try {
        const videos = await search(query);
        rawShorts += videos.length;
        for (const video of videos) {
          if (!byId.has(video.videoId)) byId.set(video.videoId, video);
        }
      } catch (error) {
        searchFailures++;
        console.warn("[youtube.providerBenchmark] search_failed", {
          runId,
          niche: testCase.niche,
          pillar: testCase.pillar,
          query,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const unique = [...byId.values()];
    const prequalified = prequalifyYouTubeSearchShorts(unique)
      .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
    const samples = prequalified.slice(0, SAMPLE_LIMIT).map((video) => ({
      sourceId: video.videoId,
      sourceUrl: video.videoPageUrl,
      creator: video.ownerHandle,
      views: video.viewCount,
      publishedAt: video.postedAt?.toISOString() ?? null,
      title: compact(video.title, 180),
      description: compact(video.description, 220),
    }));

    const row = {
      niche: testCase.niche,
      pillar: testCase.pillar,
      queries,
      queryGenerationAi: queryGeneration.aiGenerated,
      searchCalls,
      searchFailures,
      rawShorts,
      uniqueShorts: unique.length,
      prequalifiedShorts: prequalified.length,
      samples,
    };
    summaryRows.push({
      niche: testCase.niche,
      pillar: testCase.pillar,
      queryGenerationAi: queryGeneration.aiGenerated,
      searchCalls,
      searchFailures,
      rawShorts,
      uniqueShorts: unique.length,
      prequalifiedShorts: prequalified.length,
    });
    console.info("[youtube.providerBenchmark] case_done", JSON.stringify({ runId, ...row }));
  }

  const summaryByNiche = [...new Set(CASES.map((row) => row.niche))].map((niche) => {
    const rows = summaryRows.filter((row) => row.niche === niche);
    return {
      niche,
      pillarsCompleted: rows.length,
      searchCalls: rows.reduce((sum, row) => sum + row.searchCalls, 0),
      searchFailures: rows.reduce((sum, row) => sum + row.searchFailures, 0),
      rawShorts: rows.reduce((sum, row) => sum + row.rawShorts, 0),
      uniqueShorts: rows.reduce((sum, row) => sum + row.uniqueShorts, 0),
      prequalifiedShorts: rows.reduce((sum, row) => sum + row.prequalifiedShorts, 0),
    };
  });

  const searchCalls = summaryRows.reduce((sum, row) => sum + row.searchCalls, 0);
  console.info("[youtube.providerBenchmark] benchmark_complete", JSON.stringify({
    runId,
    durationMs: Date.now() - startedAt,
    casesPlanned: CASES.length,
    casesCompleted: summaryRows.length,
    aiQueryCases: summaryRows.filter((row) => row.queryGenerationAi).length,
    searchCalls,
    searchFailures: summaryRows.reduce((sum, row) => sum + row.searchFailures, 0),
    rawShorts: summaryRows.reduce((sum, row) => sum + row.rawShorts, 0),
    uniqueShorts: summaryRows.reduce((sum, row) => sum + row.uniqueShorts, 0),
    prequalifiedShorts: summaryRows.reduce((sum, row) => sum + row.prequalifiedShorts, 0),
    providerCostEstimateUsd: Number((searchCalls * usdPerCredit).toFixed(4)),
    queryStrategy: "creator_language_ai_v2",
    semanticEvaluation: "not_run_provider_only",
    summaryByNiche,
    userExposure: false,
    youtubeFeedEnabled: false,
  }));
}

main().catch((error) => {
  console.error("[youtube.providerBenchmark] fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
