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
const SAMPLE_LIMIT = 4;
const TIMEOUT_MS = 25_000;
const BENCHMARK_THRESHOLD = 0.5;
const PRODUCTION_REFERENCE_THRESHOLD = 0.55;

function compact(value: string | null | undefined, max = 180): string {
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

  const runId = process.env.YOUTUBE_SEMANTIC_BENCHMARK_RUN_ID?.trim() || `manual-${Date.now()}`;
  const startedAt = Date.now();
  const rows: Array<{
    niche: string;
    pillar: string;
    prequalified: number;
    accepted50: number;
    accepted55: number;
    rejectedOffDomain: number;
    rejectedLowConfidence: number;
    missingVerdict: number;
    haikuCalls: number;
  }> = [];

  console.info("[youtube.semanticBenchmark] benchmark_start", {
    runId,
    cases: CASES.length,
    maxCallsPerCase: MAX_CALLS_PER_CASE,
    sortBy: "relevance",
    uploadDate: "none",
    benchmarkThreshold: BENCHMARK_THRESHOLD,
    productionReferenceThreshold: PRODUCTION_REFERENCE_THRESHOLD,
    userExposure: false,
    youtubeFeedEnabled: false,
  });

  for (const testCase of CASES) {
    const queries = buildYouTubeQueryFallback({
      niche: testCase.niche,
      pillar: testCase.pillar,
      limit: MAX_CALLS_PER_CASE,
    });
    const byId = new Map<string, YouTubeVideoData>();
    let searchFailures = 0;
    let rawShorts = 0;

    for (const query of queries) {
      try {
        const videos = await search(query);
        rawShorts += videos.length;
        for (const video of videos) if (!byId.has(video.videoId)) byId.set(video.videoId, video);
      } catch (error) {
        searchFailures++;
        console.warn("[youtube.semanticBenchmark] search_failed", {
          runId,
          ...testCase,
          query,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const prequalified = prequalifyYouTubeSearchShorts([...byId.values()]);
    const candidates = adaptYouTubeShorts(prequalified, {
      niche: testCase.niche,
      creatorFollowers: 0,
      creatorAvatarUrl: "",
    });

    const classified = await classifySemanticPoolRelevance({
      niche: testCase.niche,
      activePillars: [testCase.pillar],
      candidates,
    });
    const verdictBySource = new Map(classified.verdicts.map((v) => [v.sourceId, v]));

    let accepted50 = 0;
    let accepted55 = 0;
    let rejectedOffDomain = 0;
    let rejectedLowConfidence = 0;
    let missingVerdict = 0;
    const acceptedSamples: Array<Record<string, unknown>> = [];
    const rejectedSamples: Array<Record<string, unknown>> = [];

    for (const candidate of candidates) {
      const verdict = verdictBySource.get(candidate.sourceId);
      if (!verdict) {
        missingVerdict++;
        continue;
      }
      const pillarMatch = verdict.domainRelevant && verdict.primaryPillar === testCase.pillar;
      if (!pillarMatch) {
        rejectedOffDomain++;
        if (rejectedSamples.length < SAMPLE_LIMIT) {
          rejectedSamples.push({
            title: compact(candidate.hook || candidate.caption),
            views: candidate.views,
            confidence: verdict.confidence,
            reason: compact(verdict.reason),
          });
        }
        continue;
      }
      if (verdict.confidence >= BENCHMARK_THRESHOLD) {
        accepted50++;
        if (acceptedSamples.length < SAMPLE_LIMIT) {
          acceptedSamples.push({
            title: compact(candidate.hook || candidate.caption),
            views: candidate.views,
            confidence: verdict.confidence,
            reason: compact(verdict.reason),
          });
        }
      } else {
        rejectedLowConfidence++;
      }
      if (verdict.confidence >= PRODUCTION_REFERENCE_THRESHOLD) accepted55++;
    }

    rows.push({
      niche: testCase.niche,
      pillar: testCase.pillar,
      prequalified: candidates.length,
      accepted50,
      accepted55,
      rejectedOffDomain,
      rejectedLowConfidence,
      missingVerdict,
      haikuCalls: classified.haikuCalls,
    });

    console.info("[youtube.semanticBenchmark] case_done", JSON.stringify({
      runId,
      ...testCase,
      queries,
      searchFailures,
      rawShorts,
      uniqueShorts: byId.size,
      prequalified: candidates.length,
      accepted50,
      accepted55,
      rejectedOffDomain,
      rejectedLowConfidence,
      missingVerdict,
      haikuCalls: classified.haikuCalls,
      acceptedSamples,
      rejectedSamples,
    }));
  }

  const summaryByNiche = [...new Set(rows.map((r) => r.niche))].map((niche) => {
    const nicheRows = rows.filter((r) => r.niche === niche);
    return {
      niche,
      prequalified: nicheRows.reduce((s, r) => s + r.prequalified, 0),
      accepted50: nicheRows.reduce((s, r) => s + r.accepted50, 0),
      accepted55: nicheRows.reduce((s, r) => s + r.accepted55, 0),
      rejectedOffDomain: nicheRows.reduce((s, r) => s + r.rejectedOffDomain, 0),
      rejectedLowConfidence: nicheRows.reduce((s, r) => s + r.rejectedLowConfidence, 0),
      missingVerdict: nicheRows.reduce((s, r) => s + r.missingVerdict, 0),
    };
  });

  console.info("[youtube.semanticBenchmark] benchmark_complete", JSON.stringify({
    runId,
    durationMs: Date.now() - startedAt,
    casesCompleted: rows.length,
    prequalified: rows.reduce((s, r) => s + r.prequalified, 0),
    accepted50: rows.reduce((s, r) => s + r.accepted50, 0),
    accepted55: rows.reduce((s, r) => s + r.accepted55, 0),
    rejectedOffDomain: rows.reduce((s, r) => s + r.rejectedOffDomain, 0),
    rejectedLowConfidence: rows.reduce((s, r) => s + r.rejectedLowConfidence, 0),
    missingVerdict: rows.reduce((s, r) => s + r.missingVerdict, 0),
    haikuCalls: rows.reduce((s, r) => s + r.haikuCalls, 0),
    benchmarkThreshold: BENCHMARK_THRESHOLD,
    productionReferenceThreshold: PRODUCTION_REFERENCE_THRESHOLD,
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
