/**
 * READ-ONLY production-shaped Adaptive Instagram dry benchmark.
 * Calls Popular-first + optional hashtag fallback with shared maxScCalls.
 * Does NOT write to DB / pools / budget tables.
 */
import "dotenv/config";
import { VIRAL_POOL_DEFAULTS } from "../server/viralPosts/constants";
import { discoverInstagramPoolCandidates } from "../server/viralPosts/instagramPoolDiscovery";
import {
  discoverInstagramPopularFirstCandidates,
  planInstagramAdaptiveBudgets,
  shouldRunInstagramHashtagFallback,
} from "../server/viralPosts/instagramPopularDiscovery";

delete process.env.DATABASE_URL;

if (!process.env.ANTHROPIC_API_KEY || !process.env.SCRAPECREATORS_API_KEY) {
  throw new Error(
    "ANTHROPIC_API_KEY and SCRAPECREATORS_API_KEY are required for this read-only dry benchmark"
  );
}

const NICHE = "Business & Entrepreneurship";
const PILLARS = [
  "restaurant operations",
  "restaurant marketing",
  "restaurant profitability",
  "kitchen buildouts",
] as const;

async function runPillar(pillar: (typeof PILLARS)[number]): Promise<void> {
  const maxScCalls = VIRAL_POOL_DEFAULTS.refreshMaxScCalls;
  const { popularBudget } = planInstagramAdaptiveBudgets(maxScCalls);

  const popular = await discoverInstagramPopularFirstCandidates({
    niche: NICHE,
    pillar,
    maxScCalls: popularBudget,
  });
  const leftover = Math.max(0, maxScCalls - popular.totalScCalls);
  const fallbackTriggered = shouldRunInstagramHashtagFallback({
    admittedCount: popular.adapted.length,
    remainingBudget: leftover,
  });

  const fallback = fallbackTriggered
    ? await discoverInstagramPoolCandidates({
        niche: NICHE,
        pillar,
        maxScCalls: leftover,
      })
    : null;

  const totalScCalls = popular.totalScCalls + (fallback?.totalScCalls ?? 0);

  console.log("\n============================================================");
  console.log(`ADAPTIVE IG DRY BENCHMARK | ${pillar}`);
  console.log("============================================================");
  console.log(`queries: ${popular.generatedQueries.join(" | ")}`);
  console.log(`Popular calls: ${popular.popularCalls}`);
  console.log(`Popular successes: ${popular.popularSuccesses}`);
  console.log(`Popular 404/errors: ${popular.popularFailures}`);
  console.log(`Popular unique posts: ${popular.uniquePosts}`);
  console.log(`Popular target prefilter: ${popular.targetPrefilter}`);
  console.log(`Popular strict candidates: ${popular.strictViral}`);
  console.log(`Popular current-pillar admitted: ${popular.adapted.length}`);
  console.log(`Popular reroutes: ${popular.semanticRerouted}`);
  console.log(`Popular rejections: ${popular.semanticRejected}`);
  console.log(`Popular SC calls: ${popular.totalScCalls}`);
  console.log(`fallback triggered: ${fallbackTriggered ? "yes" : "no"}`);
  console.log(`fallback calls: ${fallback?.totalScCalls ?? 0}`);
  console.log(`fallback current-pillar admitted: ${fallback?.adapted.length ?? 0}`);
  console.log(`fallback reroutes: ${fallback?.semanticRerouted ?? 0}`);
  console.log(`fallback rejections: ${fallback?.semanticRejected ?? 0}`);
  console.log(`TOTAL SC CALLS: ${totalScCalls}/${maxScCalls}`);
  console.log(
    `FINAL current-pillar candidates: ${
      popular.adapted.length + (fallback?.adapted.length ?? 0)
    }`
  );
  console.log(
    `FINAL reroutes: ${popular.semanticRerouted + (fallback?.semanticRerouted ?? 0)}`
  );
  console.log(
    `FINAL rejections: ${popular.semanticRejected + (fallback?.semanticRejected ?? 0)}`
  );
  console.log("NO DB WRITES.");
  console.log("============================================================\n");
}

async function main(): Promise<void> {
  console.log("SPYREELS READ-ONLY ADAPTIVE INSTAGRAM DRY BENCHMARK");
  console.log(`maxScCalls per pillar: ${VIRAL_POOL_DEFAULTS.refreshMaxScCalls}`);
  console.log("NO DATABASE_URL. NO POOL REFRESH. NO PRODUCTION WIRING BEYOND CODE PATH.");

  for (const pillar of PILLARS) {
    await runPillar(pillar);
  }
}

main().catch((error) => {
  console.error("[viral-posts-instagram-adaptive-dry-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
