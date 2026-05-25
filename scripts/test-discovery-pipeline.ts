/**
 * SpyReels Creator Radar discovery pipeline validation script (Phase A).
 *
 * Combined discovery: hashtag scrape (3A) + semantic bio keyword search (3B),
 * merge/dedupe, enrich hashtag-only profiles, bio-match filter, AI scoring.
 *
 * Run:
 *   pnpm tsx scripts/test-discovery-pipeline.ts
 *   pnpm tsx scripts/test-discovery-pipeline.ts --case=pet-character-content
 *   pnpm tsx scripts/test-discovery-pipeline.ts --from-cache
 *
 * Requires ANTHROPIC_API_KEY and APIFY_API_TOKEN in .env (APIFY not needed with --from-cache).
 * Output: scripts/discovery-pipeline-results.json
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import "dotenv/config";
import {
  profileFromEnrichedCacheItem,
  runDiscoveryPipeline,
  type DiscoveryPipelineResult,
  type DiscoveryProfile,
  type FilterStats,
  type MergeStats,
  type ScoredCandidateRaw,
} from "../server/discovery/pipeline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OUTPUT_PATH = join(__dirname, "discovery-pipeline-results.json");
const CACHE_PATH = join(__dirname, "last-enriched-profiles.json");

interface BusinessTestCase {
  id: string;
  businessDescription: string;
}

interface CachedTestCase extends BusinessTestCase {
  audienceKeywords: string[];
  bioMatchTerms: string[];
}

const FROM_CACHE_TEST_CASE: CachedTestCase = {
  id: "pet-character-content",
  businessDescription:
    "I run a golden retriever character account where my dog Bruno does daily routines with captions written in his voice. I want to grow my audience of dog lovers.",
  audienceKeywords: [
    "dog lovers",
    "pet owners",
    "golden retriever fans",
    "animal content fans",
    "casual scrollers",
  ],
  bioMatchTerms: [
    "dog lovers",
    "pet owners",
    "golden retriever fans",
    "animal content fans",
    "casual scrollers",
    "golden retriever",
    "dog mom",
    "pet character account",
    "doggy life",
    "retriever life",
  ],
};

/** Phase A + precision eval cases */
const BUSINESS_TEST_CASES: BusinessTestCase[] = [
  {
    id: "pet-character-content",
    businessDescription:
      "I run a golden retriever character account where my dog Bruno does daily routines with captions written in his voice. I want to grow my audience of dog lovers.",
  },
  {
    id: "restaurant-equipment",
    businessDescription:
      "I sell commercial kitchen equipment to independent restaurant owners and operators running 1 to 5 locations in the US.",
  },
  {
    id: "perimenopause-supplements",
    businessDescription:
      "I sell pre-workout supplements for women over 40 with hormonal weight loss goals. My customers are perimenopausal and menopausal women who lift weights.",
  },
  {
    id: "precision-30-restaurant-owner-personal-brand",
    businessDescription:
      "I own a restaurant and I am trying to grow my Instagram to build a personal brand. I want to share what it is like running a restaurant, lessons learned, and behind the scenes content for other restaurant owners and aspiring ones.",
  },
  {
    id: "precision-32-hr-software-small-business",
    businessDescription:
      "I sell HR software to small business owners with 5 to 25 employees. My customers handle hiring, payroll, onboarding, and time tracking themselves and want to stop using spreadsheets.",
  },
  {
    id: "precision-34-women-over-40-supplements",
    businessDescription:
      "I sell pre-workout supplements designed for women over 40 with hormonal weight loss goals. My customers are perimenopausal and menopausal women who lift weights and want to manage weight gain caused by hormonal changes.",
  },
  {
    id: "precision-40-ugc-creator-for-brands",
    businessDescription:
      "I create UGC-style product reviews and demos for DTC brands, mostly beauty and home products.",
  },
  {
    id: "precision-43-personal-finance-beginners-20s",
    businessDescription:
      "I teach personal finance basics like budgeting, saving, and credit to people in their 20s starting out.",
  },
  {
    id: "precision-12-fencing-landscaping-local",
    businessDescription:
      "I run a fencing and landscaping company in a small county. My customers are local homeowners and small businesses in my area who need fencing installed or landscaping done. I want to grow beyond my immediate area.",
  },
  {
    id: "ugc-creator-clarified",
    businessDescription:
      "I am a UGC creator who films product review and demo videos for beauty and home brands. My content shows me using products, doing unboxings, and creating short-form review clips. I want to study other UGC creators who make this same content format so I can understand what makes their videos perform well.",
  },
  {
    id: "horeca-supplier-to-restaurants",
    businessDescription:
      "I sell commercial restaurant equipment, kitchen tools, and hospitality supplies to restaurant owners, cafe operators, hotel F&B managers, and food business entrepreneurs in the US and UAE. My customers are people running food and hospitality businesses who need reliable suppliers. I want to find creators whose audience is restaurant owners and hospitality operators so I can study how to market to them.",
  },
];

interface NicheRoutingStep {
  niche: string;
  audienceKeywords: string[];
  confidence: number;
}

interface CaseCost {
  apifyHashtagUsd: number;
  apifyKeywordUsd: number;
  apifyEnrichmentUsd: number;
  claudeUsd: number;
  totalUsd: number;
}

interface PipelineCaseResult {
  testCaseId: string;
  businessDescription: string;
  step1: NicheRoutingStep;
  step2AHashtags: string[];
  step2BPhrases: string[];
  step3AHashtagCandidates: number;
  step3BKeywordCandidates: number;
  step3CMerge: MergeStats;
  step4ProfilesEnriched: number;
  step5Filter: FilterStats;
  step6ScoredCount: number;
  top10: ScoredCandidateRaw[];
  sharpCount: number;
  tangentialCount: number;
  cost: CaseCost;
}

interface RunOutput {
  runTimestamp: string;
  results: PipelineCaseResult[];
  totalCostUsd: number;
}

function loadCachedProfiles(): DiscoveryProfile[] {
  if (!existsSync(CACHE_PATH)) {
    throw new Error(
      `Cache file not found: ${CACHE_PATH}\nRun the full pipeline first to generate it.`
    );
  }

  const raw = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as unknown;
  const items = Array.isArray(raw) ? raw : [];

  const profiles: DiscoveryProfile[] = [];
  for (const item of items) {
    if (item && typeof item === "object") {
      const profile = profileFromEnrichedCacheItem(item as Record<string, unknown>);
      if (profile) profiles.push(profile);
    }
  }

  return profiles;
}

function mapPipelineResultToCaseResult(
  testCase: BusinessTestCase,
  result: DiscoveryPipelineResult
): PipelineCaseResult {
  const d = result.diagnostics;
  const cost: CaseCost = {
    apifyHashtagUsd: d.apifyHashtagUsd,
    apifyKeywordUsd: d.apifyKeywordUsd,
    apifyEnrichmentUsd: d.apifyEnrichmentUsd,
    claudeUsd: result.costs.claudeUsd,
    totalUsd: result.costs.apifyUsd + result.costs.claudeUsd,
  };

  return {
    testCaseId: testCase.id,
    businessDescription: testCase.businessDescription,
    step1: {
      niche: result.routedNiche,
      audienceKeywords: d.audienceKeywords,
      confidence: result.routingConfidence,
    },
    step2AHashtags: d.step2AHashtags,
    step2BPhrases: d.step2BPhrases,
    step3AHashtagCandidates: d.step3AHashtagCandidates,
    step3BKeywordCandidates: d.step3BKeywordCandidates,
    step3CMerge: d.step3CMerge,
    step4ProfilesEnriched: d.step4ProfilesEnriched,
    step5Filter: d.step5Filter,
    step6ScoredCount: d.step6ScoredCount,
    top10: d.top10Raw,
    sharpCount: d.sharpCount,
    tangentialCount: d.tangentialCount,
    cost,
  };
}

function formatFollowers(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K`;
  return String(count);
}

function printTop10(top10: ScoredCandidateRaw[]): void {
  console.log("TOP 10 AI-SCORED:");
  for (let i = 0; i < top10.length; i++) {
    const c = top10[i];
    console.log(
      ` ${String(i + 1).padStart(2, " ")}. @${c.username} [followers: ${formatFollowers(c.followerCount)}] [source: ${c.source}] [score: ${c.score.toFixed(2)}] (${c.match_type}) - ${c.reasoning}`
    );
  }
}

function printCaseCost(cost: CaseCost): void {
  console.log(
    `Cost: $${cost.totalUsd.toFixed(2)} (Apify hashtag $${cost.apifyHashtagUsd.toFixed(2)} + Apify keyword $${cost.apifyKeywordUsd.toFixed(2)} + Apify enrichment $${cost.apifyEnrichmentUsd.toFixed(2)} + Claude $${cost.claudeUsd.toFixed(2)})`
  );
}

async function runFromCache(): Promise<PipelineCaseResult> {
  const testCase = FROM_CACHE_TEST_CASE;

  console.log("================================================================");
  console.log(`TEST CASE: ${testCase.id} (--from-cache)`);
  console.log("================================================================");
  console.log(`Description: ${testCase.businessDescription}`);
  console.log("");
  console.log("Skipping Steps 1-4. Loading cached profiles...");
  console.log(`Cache: ${CACHE_PATH}`);

  const cachedProfiles = loadCachedProfiles();
  console.log(`Loaded ${cachedProfiles.length} cached profiles`);
  console.log("");

  const result = await runDiscoveryPipeline({
    description: testCase.businessDescription,
    fromCache: {
      audienceKeywords: testCase.audienceKeywords,
      bioMatchTerms: testCase.bioMatchTerms,
      enrichedProfiles: cachedProfiles,
    },
  });

  const caseResult = mapPipelineResultToCaseResult(testCase, result);
  console.log("");
  printTop10(caseResult.top10);
  console.log("");
  printCaseCost(caseResult.cost);
  console.log("");

  return caseResult;
}

async function runPipelineCase(
  testCase: BusinessTestCase
): Promise<PipelineCaseResult> {
  console.log("================================================================");
  console.log(`TEST CASE: ${testCase.id}`);
  console.log("================================================================");
  console.log(`Description: ${testCase.businessDescription}`);
  console.log("");

  const result = await runDiscoveryPipeline({
    description: testCase.businessDescription,
  });

  const caseResult = mapPipelineResultToCaseResult(testCase, result);
  console.log("");
  printTop10(caseResult.top10);
  console.log("");
  printCaseCost(caseResult.cost);
  console.log("");

  return caseResult;
}

function printSummaryTable(results: PipelineCaseResult[]): void {
  console.log("SUMMARY");
  console.log(
    "Niche".padEnd(28) +
      "| Candidates | Filtered | Sharp | Tangential | Cost"
  );
  console.log("-".repeat(78));

  let totalCost = 0;
  for (const r of results) {
    totalCost += r.cost.totalUsd;
    console.log(
      r.testCaseId.padEnd(28) +
        `| ${String(r.step3CMerge.totalUnique).padStart(10)} | ${String(r.step5Filter.passed).padStart(8)} | ${String(r.sharpCount).padStart(5)} | ${String(r.tangentialCount).padStart(10)} | $${r.cost.totalUsd.toFixed(2)}`
    );
  }

  console.log("-".repeat(78));
  console.log(`TOTAL: $${totalCost.toFixed(2)}`);
}

async function main(): Promise<void> {
  const fromCache = process.argv.includes("--from-cache");

  if (fromCache) {
    const result = await runFromCache();

    const output: RunOutput = {
      runTimestamp: new Date().toISOString(),
      results: [result],
      totalCostUsd: result.cost.totalUsd,
    };

    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

    console.log("");
    printSummaryTable([result]);
    console.log("");
    console.log(`Full results saved to: ${OUTPUT_PATH}`);
    return;
  }

  const caseArg = process.argv.find((arg) => arg.startsWith("--case="));
  const caseId = caseArg?.split("=")[1];
  const casesToRun = caseId
    ? BUSINESS_TEST_CASES.filter((c) => c.id === caseId)
    : BUSINESS_TEST_CASES;

  if (casesToRun.length === 0) {
    console.error(`ERROR: No test case found for id "${caseId}"`);
    process.exit(1);
  }

  const results: PipelineCaseResult[] = [];

  for (const testCase of casesToRun) {
    try {
      const result = await runPipelineCase(testCase);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Pipeline failed for ${testCase.id}: ${message}`);
    }
  }

  const output: RunOutput = {
    runTimestamp: new Date().toISOString(),
    results,
    totalCostUsd: results.reduce((sum, r) => sum + r.cost.totalUsd, 0),
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.log("");
  printSummaryTable(results);
  console.log("");
  console.log(`Full results saved to: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
