import { discoverYouTubePoolCandidates } from "./youtubePoolDiscovery";

export type YouTubeShadowBenchmarkCase = {
  niche: string;
  pillar: string;
};

export const YOUTUBE_SHADOW_BENCHMARK_CASES: YouTubeShadowBenchmarkCase[] = [
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

const MAX_SC_CALLS_PER_CASE = 2;
const SAMPLE_LIMIT = 5;
const startedRunIds = new Set<string>();

function compact(value: string | null | undefined, max = 220): string {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function shouldRunYouTubeShadowBenchmark(
  runId = process.env.YOUTUBE_SHADOW_BENCHMARK_RUN_ID
): boolean {
  return Boolean(runId?.trim());
}

export async function runYouTubeShadowBenchmark(runId: string): Promise<void> {
  const cleanRunId = runId.trim();
  if (!cleanRunId || startedRunIds.has(cleanRunId)) return;
  startedRunIds.add(cleanRunId);

  const startedAt = Date.now();
  const rows: Array<{
    niche: string;
    pillar: string;
    searchCalls: number;
    searchSuccesses: number;
    searchFailures: number;
    rawShorts: number;
    uniqueShorts: number;
    prequalifiedShorts: number;
    semanticRejected: number;
    acceptedShorts: number;
    semanticHaikuCalls: number;
    costEstimateUsd: number;
  }> = [];

  console.info("[youtube.shadow] benchmark_start", {
    runId: cleanRunId,
    cases: YOUTUBE_SHADOW_BENCHMARK_CASES.length,
    maxScCallsPerCase: MAX_SC_CALLS_PER_CASE,
    userExposure: false,
    youtubeFeedEnabled: false,
  });

  for (const testCase of YOUTUBE_SHADOW_BENCHMARK_CASES) {
    try {
      const result = await discoverYouTubePoolCandidates({
        niche: testCase.niche,
        pillar: testCase.pillar,
        maxScCalls: MAX_SC_CALLS_PER_CASE,
      });

      const samples = result.adapted.slice(0, SAMPLE_LIMIT).map((candidate) => ({
        sourceId: candidate.sourceId,
        sourceUrl: candidate.sourceUrl,
        creator: candidate.creatorHandle || candidate.creatorName,
        views: candidate.views,
        publishedAt: candidate.publishedAt?.toISOString() ?? null,
        hook: compact(candidate.hook),
        caption: compact(candidate.caption),
        semanticPillar: candidate.contentPillar,
        semanticConfidence: candidate.pillarConfidence ?? null,
        semanticReason: compact(candidate.relevanceReason),
      }));

      const row = {
        niche: testCase.niche,
        pillar: testCase.pillar,
        searchCalls: result.searchCalls,
        searchSuccesses: result.searchSuccesses,
        searchFailures: result.searchFailures,
        rawShorts: result.rawShorts,
        uniqueShorts: result.uniqueShorts,
        prequalifiedShorts: result.prequalifiedShorts,
        semanticRejected: result.semanticRejected,
        acceptedShorts: result.adapted.length,
        semanticHaikuCalls: result.semanticHaikuCalls,
        costEstimateUsd: Number(result.costEstimateUsd.toFixed(4)),
      };
      rows.push(row);
      console.info("[youtube.shadow] benchmark_case", {
        runId: cleanRunId,
        ...row,
        queries: result.generatedQueries,
        samples,
      });
    } catch (error) {
      console.error("[youtube.shadow] benchmark_case_failed", {
        runId: cleanRunId,
        ...testCase,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const summaryByNiche = [...new Set(rows.map((row) => row.niche))].map((niche) => {
    const nicheRows = rows.filter((row) => row.niche === niche);
    return {
      niche,
      pillarsCompleted: nicheRows.length,
      searchCalls: nicheRows.reduce((sum, row) => sum + row.searchCalls, 0),
      searchFailures: nicheRows.reduce((sum, row) => sum + row.searchFailures, 0),
      prequalifiedShorts: nicheRows.reduce((sum, row) => sum + row.prequalifiedShorts, 0),
      acceptedShorts: nicheRows.reduce((sum, row) => sum + row.acceptedShorts, 0),
    };
  });

  console.info("[youtube.shadow] benchmark_complete", {
    runId: cleanRunId,
    durationMs: Date.now() - startedAt,
    casesPlanned: YOUTUBE_SHADOW_BENCHMARK_CASES.length,
    casesCompleted: rows.length,
    searchCalls: rows.reduce((sum, row) => sum + row.searchCalls, 0),
    searchFailures: rows.reduce((sum, row) => sum + row.searchFailures, 0),
    prequalifiedShorts: rows.reduce((sum, row) => sum + row.prequalifiedShorts, 0),
    acceptedShorts: rows.reduce((sum, row) => sum + row.acceptedShorts, 0),
    semanticHaikuCalls: rows.reduce((sum, row) => sum + row.semanticHaikuCalls, 0),
    providerCostEstimateUsd: Number(
      rows.reduce((sum, row) => sum + row.costEstimateUsd, 0).toFixed(4)
    ),
    summaryByNiche,
    userExposure: false,
    youtubeFeedEnabled: false,
  });
}

/**
 * Production-safe dark benchmark. It is disabled unless a one-time run id is
 * explicitly set. Errors are logged and never crash or block the web service.
 */
export function startYouTubeShadowBenchmarkIfEnabled(): void {
  const runId = process.env.YOUTUBE_SHADOW_BENCHMARK_RUN_ID?.trim();
  if (!runId) return;

  setTimeout(() => {
    void runYouTubeShadowBenchmark(runId).catch((error) => {
      console.error("[youtube.shadow] benchmark_fatal", {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, 5_000);
}
