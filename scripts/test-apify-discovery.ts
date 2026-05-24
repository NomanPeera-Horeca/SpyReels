/**
 * Standalone research script: compare two Apify actors for Instagram creator discovery
 * using audience hashtags and keywords from niche routing eval cases.
 *
 * Requires APIFY_API_TOKEN in .env (via dotenv).
 *
 * Run:
 *   npx tsx scripts/test-apify-discovery.ts
 *
 * Output: scripts/apify-test-results.json
 */

import * as dotenv from "dotenv";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const APIFY_TOKEN = process.env.APIFY_API_TOKEN?.trim();
const OUTPUT_PATH = join(__dirname, "apify-test-results.json");
const REQUEST_TIMEOUT_MS = 120_000;

const ACTOR_A_ID = "apify~instagram-hashtag-scraper";
const ACTOR_B_ID = "apidojo~instagram-user-scraper";

/** ~$0.08 per test case at $2.60/1000 results with resultsLimit 30 */
const ACTOR_A_COST_PER_CASE_USD = 0.08;

interface TestCase {
  id: string;
  label: string;
  hashtags: string[];
  keywords: string[];
}

const TEST_CASES: TestCase[] = [
  {
    id: "bjj-mouthguards",
    label: "BJJ competitors at brown and black belt level",
    hashtags: ["bjjcompetitor", "nogi"],
    keywords: ["bjj competitor", "no gi grappler"],
  },
  {
    id: "women-over-40-supplements",
    label: "Perimenopausal women lifting weights",
    hashtags: ["perimenopause", "womenover40"],
    keywords: ["perimenopause fitness", "women over 40 weightlifting"],
  },
  {
    id: "b2b-makeup-brushes",
    label: "Beauty brand owners sourcing wholesale",
    hashtags: ["beautybrandowner", "privatelabelbeauty"],
    keywords: ["beauty brand founder", "private label cosmetics"],
  },
  {
    id: "daycare-houston",
    label: "Houston parents looking for childcare",
    hashtags: ["houstonmom", "houstonparents"],
    keywords: ["houston mom", "houston parent"],
  },
  {
    id: "pet-character-format",
    label: "Golden retriever character format audience",
    hashtags: ["goldenretriever", "dogsofinstagram"],
    keywords: ["golden retriever owner", "dog dad"],
  },
  {
    id: "restaurant-owners",
    label: "Independent restaurant owners and operators",
    hashtags: ["restaurantowner", "restaurantbusiness"],
    keywords: ["restaurant owner", "restaurant operator"],
  },
];

interface HashtagPostItem {
  ownerUsername?: string;
  ownerFullName?: string;
  caption?: string;
  hashtags?: string[];
  url?: string;
  timestamp?: string;
  likesCount?: number;
  [key: string]: unknown;
}

interface UserScraperItem {
  username?: string;
  fullName?: string;
  biography?: string;
  followersCount?: number;
  followingCount?: number;
  isPrivate?: boolean;
  isVerified?: boolean;
  category?: string;
  postsCount?: number;
  [key: string]: unknown;
}

interface ActorHashtagResult {
  success: boolean;
  durationMs: number;
  resultsCount: number;
  topCandidates: Array<{
    ownerUsername: string;
    ownerFullName: string;
    caption: string;
    hashtags: string[];
    likesCount: number | null;
  }>;
  error: string | null;
}

interface ActorUserResult {
  success: boolean;
  durationMs: number;
  resultsCount: number;
  topCandidates: Array<{
    username: string;
    fullName: string;
    biography: string;
    followersCount: number | null;
    category: string;
    isVerified: boolean;
  }>;
  error: string | null;
}

interface TestCaseResult {
  testCase: TestCase;
  actorA_hashtagScraper: ActorHashtagResult;
  actorB_userScraper: ActorUserResult;
}

interface RunOutput {
  runTimestamp: string;
  totalCostEstimate: number;
  results: TestCaseResult[];
}

async function runApifyActor<T>(
  actorId: string,
  input: Record<string, unknown>
): Promise<{ items: T[]; durationMs: number }> {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(APIFY_TOKEN ?? "")}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    const durationMs = Date.now() - startedAt;

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    const items = (await response.json()) as T[];
    if (!Array.isArray(items)) {
      throw new Error("Expected array response from Apify dataset items endpoint");
    }

    return { items, durationMs };
  } finally {
    clearTimeout(timeoutId);
  }
}

function truncateCaption(caption: string | undefined): string {
  const text = caption ?? "";
  return text.length <= 200 ? text : text.slice(0, 200);
}

function pickTopHashtagCandidates(items: HashtagPostItem[]): ActorHashtagResult["topCandidates"] {
  const seen = new Set<string>();
  const candidates: ActorHashtagResult["topCandidates"] = [];

  const sorted = [...items].sort(
    (a, b) => (Number(b.likesCount) || 0) - (Number(a.likesCount) || 0)
  );

  for (const item of sorted) {
    const handle = String(item.ownerUsername ?? "").trim();
    if (!handle || seen.has(handle.toLowerCase())) continue;
    seen.add(handle.toLowerCase());
    candidates.push({
      ownerUsername: handle,
      ownerFullName: String(item.ownerFullName ?? ""),
      caption: truncateCaption(
        typeof item.caption === "string" ? item.caption : undefined
      ),
      hashtags: Array.isArray(item.hashtags)
        ? item.hashtags.map(String)
        : [],
      likesCount:
        typeof item.likesCount === "number" ? item.likesCount : null,
    });
    if (candidates.length >= 10) break;
  }

  return candidates;
}

function pickTopUserCandidates(items: UserScraperItem[]): ActorUserResult["topCandidates"] {
  const sorted = [...items].sort(
    (a, b) => (Number(b.followersCount) || 0) - (Number(a.followersCount) || 0)
  );

  return sorted.slice(0, 10).map((item) => ({
    username: String(item.username ?? ""),
    fullName: String(item.fullName ?? ""),
    biography: String(item.biography ?? ""),
    followersCount:
      typeof item.followersCount === "number" ? item.followersCount : null,
    category: String(item.category ?? ""),
    isVerified: Boolean(item.isVerified),
  }));
}

function formatHandlesFromHashtag(items: HashtagPostItem[], limit = 5): string {
  const seen = new Set<string>();
  const handles: string[] = [];

  for (const item of items) {
    const handle = String(item.ownerUsername ?? "").trim();
    if (!handle || seen.has(handle.toLowerCase())) continue;
    seen.add(handle.toLowerCase());
    handles.push(`@${handle}`);
    if (handles.length >= limit) break;
  }

  return handles.length > 0 ? handles.join(", ") : "(none)";
}

function formatHandlesFromUsers(items: UserScraperItem[], limit = 5): string {
  const handles = items
    .map((item) => String(item.username ?? "").trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((h) => `@${h}`);

  return handles.length > 0 ? handles.join(", ") : "(none)";
}

function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

async function runActorA(testCase: TestCase): Promise<ActorHashtagResult> {
  console.log("Running Actor A (Instagram Hashtag Scraper)...");

  try {
    const { items, durationMs } = await runApifyActor<HashtagPostItem>(
      ACTOR_A_ID,
      {
        hashtags: testCase.hashtags,
        resultsLimit: 30,
        resultsType: "posts",
      }
    );

    console.log(
      `  Got ${items.length} results in ${formatSeconds(durationMs)} seconds`
    );
    console.log(
      `  Top 5 creator handles: ${formatHandlesFromHashtag(items, 5)}`
    );

    return {
      success: true,
      durationMs,
      resultsCount: items.length,
      topCandidates: pickTopHashtagCandidates(items),
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "timeout"
        : err instanceof Error
          ? err.message
          : String(err);

    console.log(`  Error: ${message}`);

    return {
      success: false,
      durationMs: REQUEST_TIMEOUT_MS,
      resultsCount: 0,
      topCandidates: [],
      error: message,
    };
  }
}

async function runActorB(testCase: TestCase): Promise<ActorUserResult> {
  console.log("Running Actor B (Instagram User Scraper)...");

  try {
    const { items, durationMs } = await runApifyActor<UserScraperItem>(
      ACTOR_B_ID,
      {
        searchTerms: testCase.keywords,
        maxItems: 20,
      }
    );

    console.log(
      `  Got ${items.length} results in ${formatSeconds(durationMs)} seconds`
    );
    console.log(`  Top 5 creator handles: ${formatHandlesFromUsers(items, 5)}`);

    return {
      success: true,
      durationMs,
      resultsCount: items.length,
      topCandidates: pickTopUserCandidates(items),
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "timeout"
        : err instanceof Error
          ? err.message
          : String(err);

    console.log(`  Error: ${message}`);

    return {
      success: false,
      durationMs: REQUEST_TIMEOUT_MS,
      resultsCount: 0,
      topCandidates: [],
      error: message,
    };
  }
}

async function main(): Promise<void> {
  if (!APIFY_TOKEN) {
    console.error("ERROR: APIFY_API_TOKEN is not set (expected via .env or shell env)");
    process.exit(1);
  }

  const runStartedAt = Date.now();
  const results: TestCaseResult[] = [];

  console.log(`Testing ${TEST_CASES.length} niche cases against two Apify actors...\n`);

  for (const testCase of TEST_CASES) {
    console.log("================================================================================");
    console.log(`TEST CASE: ${testCase.label}`);
    console.log("================================================================================");
    console.log(`Hashtags: ${testCase.hashtags.join(", ")}`);
    console.log(`Keywords: ${testCase.keywords.join(", ")}`);
    console.log("");

    const actorA_hashtagScraper = await runActorA(testCase);
    console.log("");
    const actorB_userScraper = await runActorB(testCase);
    console.log("");

    results.push({
      testCase,
      actorA_hashtagScraper,
      actorB_userScraper,
    });
  }

  const actorASuccesses = results.filter((r) => r.actorA_hashtagScraper.success).length;
  const actorBSuccesses = results.filter((r) => r.actorB_userScraper.success).length;
  const totalRuntimeMs = Date.now() - runStartedAt;
  const totalCostEstimate = TEST_CASES.length * ACTOR_A_COST_PER_CASE_USD;

  const output: RunOutput = {
    runTimestamp: new Date().toISOString(),
    totalCostEstimate,
    results,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.log("================================================================================");
  console.log("SUMMARY");
  console.log("================================================================================");
  console.log(`Total test cases: ${TEST_CASES.length}`);
  console.log(`Actor A success rate: ${actorASuccesses} of ${TEST_CASES.length}`);
  console.log(`Actor B success rate: ${actorBSuccesses} of ${TEST_CASES.length}`);
  console.log(`Total runtime: ${(totalRuntimeMs / 60_000).toFixed(1)} minutes`);
  console.log(`Estimated total cost: $${totalCostEstimate.toFixed(2)}`);
  console.log("");
  console.log(`Full results saved to: ${OUTPUT_PATH}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
