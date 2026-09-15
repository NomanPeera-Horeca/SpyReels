import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { discoverYouTubePoolCandidates } from "../server/viralPosts/youtubePoolDiscovery";

type BenchmarkCase = {
  niche: string;
  pillar: string;
};

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

const MAX_SC_CALLS_PER_CASE = 2;
const SAMPLE_LIMIT = 5;

function requireSecret(name: string): void {
  if (!process.env[name]?.trim()) {
    throw new Error(`${name} is required for the live YouTube benchmark`);
  }
}

function compactText(value: string | null | undefined, max = 220): string {
  return (value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function main(): Promise<void> {
  requireSecret("SCRAPECREATORS_API_KEY");
  requireSecret("ANTHROPIC_API_KEY");

  const startedAt = new Date();
  const results: Array<Record<string, unknown>> = [];

  for (const testCase of CASES) {
    console.info("[youtube.benchmark] case_start", testCase);
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
      hook: compactText(candidate.hook),
      caption: compactText(candidate.caption),
      semanticPillar: candidate.contentPillar,
      semanticConfidence: candidate.pillarConfidence ?? null,
      semanticReason: compactText(candidate.relevanceReason),
    }));

    const row = {
      niche: testCase.niche,
      pillar: testCase.pillar,
      queries: result.generatedQueries,
      searchCalls: result.searchCalls,
      searchSuccesses: result.searchSuccesses,
      searchFailures: result.searchFailures,
      rawShorts: result.rawShorts,
      uniqueShorts: result.uniqueShorts,
      prequalifiedShorts: result.prequalifiedShorts,
      semanticRejected: result.semanticRejected,
      acceptedShorts: result.adapted.length,
      semanticHaikuCalls: result.semanticHaikuCalls,
      estimatedProviderCostUsd: Number(result.costEstimateUsd.toFixed(4)),
      samples,
    };
    results.push(row);
    console.info("[youtube.benchmark] case_done", JSON.stringify(row));
  }

  const nicheSummary = [...new Set(CASES.map((item) => item.niche))].map((niche) => {
    const rows = results.filter((row) => row.niche === niche) as Array<{
      acceptedShorts: number;
      prequalifiedShorts: number;
      searchFailures: number;
      searchCalls: number;
    }>;
    return {
      niche,
      pillarsTested: rows.length,
      acceptedShorts: rows.reduce((sum, row) => sum + row.acceptedShorts, 0),
      prequalifiedShorts: rows.reduce((sum, row) => sum + row.prequalifiedShorts, 0),
      searchFailures: rows.reduce((sum, row) => sum + row.searchFailures, 0),
      searchCalls: rows.reduce((sum, row) => sum + row.searchCalls, 0),
    };
  });

  const totalSearchCalls = results.reduce(
    (sum, row) => sum + Number(row.searchCalls || 0),
    0
  );
  const totalAccepted = results.reduce(
    (sum, row) => sum + Number(row.acceptedShorts || 0),
    0
  );
  const totalPrequalified = results.reduce(
    (sum, row) => sum + Number(row.prequalifiedShorts || 0),
    0
  );
  const totalFailures = results.reduce(
    (sum, row) => sum + Number(row.searchFailures || 0),
    0
  );

  const report = {
    benchmark: "youtube-shorts-five-niche-live-v1",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    userExposure: false,
    youtubeProductionEnabled: false,
    maxScCallsPerCase: MAX_SC_CALLS_PER_CASE,
    cases: results,
    nicheSummary,
    totals: {
      niches: nicheSummary.length,
      pillars: CASES.length,
      searchCalls: totalSearchCalls,
      searchFailures: totalFailures,
      prequalifiedShorts: totalPrequalified,
      acceptedShorts: totalAccepted,
    },
  };

  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/youtube-live-benchmark.json",
    JSON.stringify(report, null, 2),
    "utf8"
  );

  console.info("[youtube.benchmark] complete", JSON.stringify(report.totals));
}

main().catch((error) => {
  console.error("[youtube.benchmark] fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
