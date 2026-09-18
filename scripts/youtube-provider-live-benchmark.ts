import "dotenv/config";
import {
  extractYouTubeSearchShorts,
  prequalifyYouTubeSearchShorts,
} from "../server/viralPosts/youtubePoolDiscovery";
import { buildYouTubeQueryFallback } from "../server/viralPosts/youtubeQueryGeneration";
import { adaptYouTubeShorts } from "../server/viralPosts/platformAdapters";
import { classifySemanticPoolRelevance } from "../server/viralPosts/semanticPoolRelevance";
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
const SEMANTIC_TEST_THRESHOLD = 0.5;

function compact(value: string | null | undefined, max = 220): string {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function search(query: string): Promise<YouTubeVideoData[]> {
  const apiKey = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!apiKey) throw new Error("SCRAPECREATORS_API_KEY is required");

  const url = new URL(API_BASE);
  url.searchParams.set("query", query);
  url.searchParams.set("type", "shorts");
  url.searchParams.set("sortBy", "relevance");
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
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is required for semantic benchmark");
  }

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
    semanticEvaluated: number;
    semanticAcceptedAt05: number;
    semanticRejectedAt05: number;
    semanticCalls: number;
  }> = [];

  console.info("[youtube.semanticBenchmark] benchmark_start", {
    runId,
    cases: CASES.length,
    maxCallsPerCase: MAX_CALLS_PER_CASE,
    queryStrategy: "same_fallback_queries_as_broad_relevance_run",
    sortBy: "relevance",
    uploadDate: "none",
    semanticThreshold: SEMANTIC_TEST_THRESHOLD,
    productionThresholdChanged: false,
    userExposure: false,
    youtubeFeedEnabled: false,
  });

  for (const testCase of CASES) {
    // Use the same deterministic fallback query shape that produced the 570
    // prequalified Shorts in the prior broad-relevance benchmark.
    const queries = buildYouTubeQueryFallback({
      niche: testCase.niche,
      pillar: testCase.pillar,
      limit: MAX_CALLS_PER_CASE,
    });

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
        console.warn("[youtube.semanticBenchmark] search_failed", {
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

    const candidates = adaptYouTubeShorts(prequalified, {
      niche: testCase.niche,
      creatorFollowers: 0,
      creatorAvatarUrl: "",
    });

    const semantic = await classifySemanticPoolRelevance({
      niche: testCase.niche,
      activePillars: [testCase.pillar],
      candidates,
    });
    const verdictBySource = new Map(semantic.verdicts.map((row) => [row.sourceId, row]));

    const accepted = candidates.filter((candidate) => {
      const verdict = verdictBySource.get(candidate.sourceId);
      return Boolean(
        verdict &&
          verdict.domainRelevant &&
          verdict.primaryPillar === testCase.pillar &&
          verdict.confidence >= SEMANTIC_TEST_THRESHOLD
      );
    });
    const rejected = candidates.filter((candidate) => !accepted.some((row) => row.sourceId === candidate.sourceId));

    const acceptedSamples = accepted.slice(0, SAMPLE_LIMIT).map((candidate) => {
      const verdict = verdictBySource.get(candidate.sourceId);
      return {
        sourceId: candidate.sourceId,
        sourceUrl: candidate.sourceUrl,
        views: candidate.views,
        hook: compact(candidate.hook, 180),
        confidence: verdict?.confidence ?? null,
        reason: compact(verdict?.reason, 220),
      };
    });
    const rejectedSamples = rejected.slice(0, SAMPLE_LIMIT).map((candidate) => {
      const verdict = verdictBySource.get(candidate.sourceId);
      return {
        sourceId: candidate.sourceId,
        sourceUrl: candidate.sourceUrl,
        views: candidate.views,
        hook: compact(candidate.hook, 180),
        confidence: verdict?.confidence ?? null,
        domainRelevant: verdict?.domainRelevant ?? null,
        reason: compact(verdict?.reason, 220),
      };
    });

    const row = {
      niche: testCase.niche,
      pillar: testCase.pillar,
      queries,
      searchCalls,
      searchFailures,
      rawShorts,
      uniqueShorts: unique.length,
      prequalifiedShorts: prequalified.length,
      semanticEvaluated: candidates.length,
      semanticAcceptedAt05: accepted.length,
      semanticRejectedAt05: rejected.length,
      semanticCalls: semantic.haikuCalls,
      acceptedSamples,
      rejectedSamples,
    };

    summaryRows.push({
      niche: testCase.niche,
      pillar: testCase.pillar,
      searchCalls,
      searchFailures,
      rawShorts,
      uniqueShorts: unique.length,
      prequalifiedShorts: prequalified.length,
      semanticEvaluated: candidates.length,
      semanticAcceptedAt05: accepted.length,
      semanticRejectedAt05: rejected.length,
      semanticCalls: semantic.haikuCalls,
    });
    console.info("[youtube.semanticBenchmark] case_done", JSON.stringify({ runId, ...row }));
  }

  const summaryByNiche = [...new Set(CASES.map((row) => row.niche))].map((niche) => {
    const rows = summaryRows.filter((row) => row.niche === niche);
    return {
      niche,
      pillarsCompleted: rows.length,
      prequalifiedShorts: rows.reduce((sum, row) => sum + row.prequalifiedShorts, 0),
      semanticEvaluated: rows.reduce((sum, row) => sum + row.semanticEvaluated, 0),
      semanticAcceptedAt05: rows.reduce((sum, row) => sum + row.semanticAcceptedAt05, 0),
      semanticRejectedAt05: rows.reduce((sum, row) => sum + row.semanticRejectedAt05, 0),
      semanticCalls: rows.reduce((sum, row) => sum + row.semanticCalls, 0),
    };
  });

  const searchCalls = summaryRows.reduce((sum, row) => sum + row.searchCalls, 0);
  const semanticEvaluated = summaryRows.reduce((sum, row) => sum + row.semanticEvaluated, 0);
  const semanticAcceptedAt05 = summaryRows.reduce((sum, row) => sum + row.semanticAcceptedAt05, 0);
  const semanticRejectedAt05 = summaryRows.reduce((sum, row) => sum + row.semanticRejectedAt05, 0);

  console.info("[youtube.semanticBenchmark] benchmark_complete", JSON.stringify({
    runId,
    durationMs: Date.now() - startedAt,
    casesPlanned: CASES.length,
    casesCompleted: summaryRows.length,
    searchCalls,
    searchFailures: summaryRows.reduce((sum, row) => sum + row.searchFailures, 0),
    rawShorts: summaryRows.reduce((sum, row) => sum + row.rawShorts, 0),
    uniqueShorts: summaryRows.reduce((sum, row) => sum + row.uniqueShorts, 0),
    prequalifiedShorts: summaryRows.reduce((sum, row) => sum + row.prequalifiedShorts, 0),
    semanticEvaluated,
    semanticAcceptedAt05,
    semanticRejectedAt05,
    acceptanceRate: semanticEvaluated > 0 ? Number((semanticAcceptedAt05 / semanticEvaluated).toFixed(4)) : 0,
    semanticCalls: summaryRows.reduce((sum, row) => sum + row.semanticCalls, 0),
    providerCostEstimateUsd: Number((searchCalls * usdPerCredit).toFixed(4)),
    semanticThreshold: SEMANTIC_TEST_THRESHOLD,
    productionThresholdChanged: false,
    summaryByNiche,
    userExposure: false,
    youtubeFeedEnabled: false,
  }));
}

main().catch((error) => {
  console.error("[youtube.semanticBenchmark] fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
