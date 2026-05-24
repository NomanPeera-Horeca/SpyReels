/**
 * Standalone research script: AI re-ranking of Apify hashtag-scraper candidates
 * (Layer 3 of the discovery pipeline).
 *
 * Requires ANTHROPIC_API_KEY in .env and scripts/apify-test-results.json on disk.
 *
 * Run:
 *   npx tsx scripts/test-discovery-scoring.ts
 *
 * Output: scripts/scoring-test-results.json
 */

import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const INPUT_PATH = join(__dirname, "apify-test-results.json");
const OUTPUT_PATH = join(__dirname, "scoring-test-results.json");
const SCORING_MODEL = "claude-haiku-4-5-20251001";

/** Haiku 4.5 list pricing (USD per million tokens) */
const HAIKU_INPUT_USD_PER_M = 1;
const HAIKU_OUTPUT_USD_PER_M = 5;

interface UserContext {
  testCaseId: string;
  userDescription: string;
  audienceKeywords: string[];
}

const USER_CONTEXTS: UserContext[] = [
  {
    testCaseId: "bjj-mouthguards",
    userDescription:
      "I sell custom mouthguards designed for BJJ brown and black belt competitors who train no-gi. My buyers are serious competitors, not hobbyists.",
    audienceKeywords: [
      "BJJ competitor",
      "no-gi practitioner",
      "brown belt",
      "black belt",
      "grappler",
    ],
  },
  {
    testCaseId: "women-over-40-supplements",
    userDescription:
      "I sell pre-workout supplements for women over 40 with hormonal weight loss goals. My customers are perimenopausal and menopausal women who lift weights.",
    audienceKeywords: [
      "perimenopausal women",
      "women over 40",
      "female weightlifters",
      "hormonal weight loss",
      "menopause fitness",
    ],
  },
  {
    testCaseId: "b2b-makeup-brushes",
    userDescription:
      "I manufacture makeup brushes wholesale in China and sell to beauty brand owners who want to private label or source for their own brand.",
    audienceKeywords: [
      "beauty brand founder",
      "private label sourcing",
      "beauty entrepreneur",
      "cosmetics brand owner",
    ],
  },
  {
    testCaseId: "daycare-houston",
    userDescription:
      "I run a daycare in Houston serving children ages 1 to 5. My buyers are local Houston parents looking for safe, trustworthy childcare.",
    audienceKeywords: [
      "Houston mom",
      "Houston parent",
      "working parent",
      "toddler parent",
      "childcare seeker",
    ],
  },
  {
    testCaseId: "pet-character-format",
    userDescription:
      "I run a golden retriever character account where my dog Bruno does daily routines with captions written in his voice. I want to grow my audience of dog lovers.",
    audienceKeywords: [
      "dog lover",
      "golden retriever owner",
      "pet humor",
      "pet content viewer",
    ],
  },
  {
    testCaseId: "restaurant-owners",
    userDescription:
      "I sell commercial kitchen equipment to independent restaurant owners and operators running 1 to 5 locations in the US.",
    audienceKeywords: [
      "restaurant owner",
      "restaurant operator",
      "independent restaurateur",
      "food service operator",
    ],
  },
];

const SCORING_SYSTEM_PROMPT = `You are evaluating whether an Instagram creator is a good match for a user's business audience. The user is trying to find creators whose content patterns they can learn from and adapt. The match must be based on CONSISTENT audience targeting visible in the creator's bio and captions, not on a single hashtag mention.

You will receive:
1. The user's business description and target audience keywords
2. One candidate creator's Instagram bio, username, recent caption, and post metadata

You must return ONLY a JSON object in this exact shape:

{
  "score": 0.0 to 1.0,
  "relevance_type": "sharp_match" | "tangential" | "noise",
  "is_creator_or_brand": "creator" | "brand" | "service" | "supplier" | "aggregator" | "unknown",
  "reasoning": "one short sentence explaining your score"
}

SCORING RULES:

0.85 to 1.0 (sharp_match): The creator's bio AND caption clearly indicate they consistently create content for the user's exact audience. The buyer would find this creator immediately valuable to study.

0.5 to 0.84 (tangential): The creator overlaps with the audience but does not target them as their primary focus. Maybe they posted once with a relevant hashtag but their main niche is adjacent.

0.0 to 0.49 (noise): The creator is in a different niche, is a supplier targeting the user's audience (wrong side of marketplace), is a one-off post, or is an aggregator/news account.

CRITICAL B2B RULE:
If the user's audience is BUSINESS OWNERS, you MUST distinguish between creators who ARE business owners versus creators who SELL TO business owners. A logo designer who targets beauty brand owners is NOT a sharp match for a brushes manufacturer selling to beauty brand owners; they are noise because they are on the same side of the marketplace as the user (supplier side).

CRITICAL FORMAT RULES:
- Score must reflect AUDIENCE FIT, not creator quality or follower count
- A small creator (300 followers) who exactly targets the audience is a sharp_match
- A large creator (500K followers) whose audience is adjacent is tangential, not sharp
- Do NOT consider engagement rate; you do not have that data
- Do NOT use em dashes anywhere
- Return ONLY the JSON object, no preamble, no code fences`;

interface ApifyHashtagCandidate {
  ownerUsername: string;
  ownerFullName: string;
  caption: string;
  hashtags: string[];
  likesCount: number | null;
}

interface ApifyTestResultEntry {
  testCase: { id: string; label: string };
  actorA_hashtagScraper: {
    success: boolean;
    topCandidates: ApifyHashtagCandidate[];
  };
}

interface ApifyTestResultsFile {
  results: ApifyTestResultEntry[];
}

interface ScoringResult {
  score: number;
  relevance_type: "sharp_match" | "tangential" | "noise";
  is_creator_or_brand: string;
  reasoning: string;
}

interface ScoredCandidate {
  rank_instagram_default: number;
  rank_ai_score: number;
  score: number;
  relevance_type: string;
  is_creator_or_brand: string;
  reasoning: string;
  username: string;
  caption: string;
}

interface TestCaseScoringResult {
  testCase: {
    testCaseId: string;
    userDescription: string;
    audienceKeywords: string[];
  };
  candidateCount: number;
  scoredCandidates: ScoredCandidate[];
  headlineMetric: {
    sharpInDefaultTop5: number;
    sharpInAIScoredTop5: number;
    improvement: string;
  };
}

interface RunOutput {
  runTimestamp: string;
  totalCostEstimateUSD: number;
  results: TestCaseScoringResult[];
}

function truncateCaption(caption: string, maxLen = 200): string {
  return caption.length <= maxLen ? caption : caption.slice(0, maxLen);
}

function stripCodeFences(text: string): string {
  let trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/, "");
  }
  return trimmed.trim();
}

function buildUserMessage(
  context: UserContext,
  candidate: ApifyHashtagCandidate
): string {
  return `User business description: ${context.userDescription}
User audience keywords: ${context.audienceKeywords.join(", ")}

Candidate creator:
Username: @${candidate.ownerUsername}
Bio: not available
Recent caption: ${candidate.caption || "(empty)"}`;
}

function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_M +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_M
  );
}

async function scoreCandidate(
  client: Anthropic,
  context: UserContext,
  candidate: ApifyHashtagCandidate
): Promise<{ scoring: ScoringResult; costUsd: number }> {
  const userMessage = buildUserMessage(context, candidate);

  const response = await client.messages.create({
    model: SCORING_MODEL,
    max_tokens: 300,
    temperature: 0.1,
    system: SCORING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd = estimateCostUsd(inputTokens, outputTokens);

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in Anthropic response");
  }

  const raw = stripCodeFences(textBlock.text);
  const parsed = JSON.parse(raw) as ScoringResult;

  return {
    scoring: {
      score: Number(parsed.score) || 0,
      relevance_type: parsed.relevance_type ?? "noise",
      is_creator_or_brand: parsed.is_creator_or_brand ?? "unknown",
      reasoning: parsed.reasoning ?? "",
    },
    costUsd,
  };
}

function countSharpInTop5(
  ordered: Array<{ relevance_type: string }>
): number {
  return ordered
    .slice(0, 5)
    .filter((c) => c.relevance_type === "sharp_match").length;
}

function formatImprovement(defaultSharp: number, aiSharp: number): string {
  const delta = aiSharp - defaultSharp;
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return String(delta);
  return "0";
}

async function scoreTestCase(
  client: Anthropic,
  context: UserContext,
  apifyEntry: ApifyTestResultEntry
): Promise<{ result: TestCaseScoringResult; costUsd: number }> {
  const candidates = apifyEntry.actorA_hashtagScraper.topCandidates ?? [];
  let caseCostUsd = 0;

  console.log(`Scoring ${candidates.length} candidates...`);

  const scoredRaw: Array<{
    candidate: ApifyHashtagCandidate;
    instagramRank: number;
    scoring: ScoringResult;
  }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    process.stdout.write(`  [${i + 1}/${candidates.length}] @${candidate.ownerUsername}... `);

    try {
      const { scoring, costUsd } = await scoreCandidate(
        client,
        context,
        candidate
      );
      caseCostUsd += costUsd;
      scoredRaw.push({
        candidate,
        instagramRank: i + 1,
        scoring,
      });
      console.log(`${scoring.score.toFixed(2)} (${scoring.relevance_type})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`failed (${message})`);
      scoredRaw.push({
        candidate,
        instagramRank: i + 1,
        scoring: {
          score: 0,
          relevance_type: "noise",
          is_creator_or_brand: "unknown",
          reasoning: "scoring failed",
        },
      });
    }
  }

  const instagramDefaultOrder = [...scoredRaw];

  const aiSorted = [...scoredRaw].sort(
    (a, b) => b.scoring.score - a.scoring.score
  );

  const scoredCandidates: ScoredCandidate[] = aiSorted.map((item, aiIndex) => ({
    rank_instagram_default: item.instagramRank,
    rank_ai_score: aiIndex + 1,
    score: item.scoring.score,
    relevance_type: item.scoring.relevance_type,
    is_creator_or_brand: item.scoring.is_creator_or_brand,
    reasoning: item.scoring.reasoning,
    username: item.candidate.ownerUsername,
    caption: truncateCaption(item.candidate.caption),
  }));

  const sharpInDefaultTop5 = countSharpInTop5(
    instagramDefaultOrder.map((x) => x.scoring)
  );
  const sharpInAIScoredTop5 = countSharpInTop5(
    aiSorted.map((x) => x.scoring)
  );
  const improvement = formatImprovement(sharpInDefaultTop5, sharpInAIScoredTop5);

  console.log("");
  console.log("INSTAGRAM DEFAULT TOP 5:");
  for (let i = 0; i < Math.min(5, instagramDefaultOrder.length); i++) {
    const item = instagramDefaultOrder[i];
    console.log(
      `  ${i + 1}. @${item.candidate.ownerUsername} [score ${item.scoring.score.toFixed(2)}] (${item.scoring.relevance_type})`
    );
  }

  console.log("");
  console.log("AI SCORED TOP 5:");
  for (let i = 0; i < Math.min(5, aiSorted.length); i++) {
    const item = aiSorted[i];
    console.log(
      `  ${i + 1}. @${item.candidate.ownerUsername} [score ${item.scoring.score.toFixed(2)}] (${item.scoring.relevance_type}) - ${item.scoring.reasoning}`
    );
  }

  console.log("");
  console.log(
    `HEADLINE: ${sharpInDefaultTop5} sharp in default top 5 vs ${sharpInAIScoredTop5} sharp in AI top 5 (improvement: ${improvement})`
  );

  return {
    result: {
      testCase: {
        testCaseId: context.testCaseId,
        userDescription: context.userDescription,
        audienceKeywords: context.audienceKeywords,
      },
      candidateCount: candidates.length,
      scoredCandidates,
      headlineMetric: {
        sharpInDefaultTop5,
        sharpInAIScoredTop5,
        improvement,
      },
    },
    costUsd: caseCostUsd,
  };
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      "ERROR: ANTHROPIC_API_KEY is not set (expected via .env or shell env)"
    );
    process.exit(1);
  }

  if (!existsSync(INPUT_PATH)) {
    console.error(
      `ERROR: Input file not found: ${INPUT_PATH}\n` +
        "Run scripts/test-apify-discovery.ts first to generate apify-test-results.json."
    );
    process.exit(1);
  }

  const apifyData = JSON.parse(
    readFileSync(INPUT_PATH, "utf-8")
  ) as ApifyTestResultsFile;

  const client = new Anthropic({ apiKey });
  const runStartedAt = Date.now();
  const results: TestCaseScoringResult[] = [];
  let totalCostUsd = 0;
  let totalCandidatesScored = 0;

  console.log(`Scoring Apify candidates for ${USER_CONTEXTS.length} test cases...\n`);

  for (const context of USER_CONTEXTS) {
    console.log(
      "================================================================================"
    );
    console.log(`TEST CASE: ${context.testCaseId}`);
    console.log(
      "================================================================================"
    );
    console.log(`User description: ${context.userDescription}`);
    console.log(`Audience keywords: ${context.audienceKeywords.join(", ")}`);
    console.log("");

    const apifyEntry = apifyData.results.find(
      (r) => r.testCase.id === context.testCaseId
    );

    if (!apifyEntry) {
      console.error(`  Skipping: no Apify result for testCaseId ${context.testCaseId}`);
      console.log("");
      continue;
    }

    if (!apifyEntry.actorA_hashtagScraper.success) {
      console.error(
        `  Skipping: Actor A failed for ${context.testCaseId} (no candidates to score)`
      );
      console.log("");
      continue;
    }

    const { result, costUsd } = await scoreTestCase(client, context, apifyEntry);
    results.push(result);
    totalCostUsd += costUsd;
    totalCandidatesScored += result.candidateCount;
    console.log("");
  }

  const avgDefaultSharp =
    results.length > 0
      ? results.reduce((s, r) => s + r.headlineMetric.sharpInDefaultTop5, 0) /
        results.length
      : 0;
  const avgAiSharp =
    results.length > 0
      ? results.reduce((s, r) => s + r.headlineMetric.sharpInAIScoredTop5, 0) /
        results.length
      : 0;
  const avgImprovement = avgAiSharp - avgDefaultSharp;
  const avgImprovementStr =
    avgImprovement > 0
      ? `+${avgImprovement.toFixed(1)}`
      : avgImprovement.toFixed(1);

  const output: RunOutput = {
    runTimestamp: new Date().toISOString(),
    totalCostEstimateUSD: totalCostUsd,
    results,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  const totalRuntimeMs = Date.now() - runStartedAt;

  console.log(
    "================================================================================"
  );
  console.log("FINAL SUMMARY");
  console.log(
    "================================================================================"
  );
  console.log(`Total test cases: ${results.length}`);
  console.log(`Total candidates scored: ${totalCandidatesScored}`);
  console.log(`Total runtime: ${(totalRuntimeMs / 60_000).toFixed(1)} minutes`);
  console.log(`Estimated cost: $${totalCostUsd.toFixed(4)} (Haiku is cheap)`);
  console.log("");
  console.log(
    `Average sharp candidates in Instagram default top 5: ${avgDefaultSharp.toFixed(1)}`
  );
  console.log(
    `Average sharp candidates in AI scored top 5: ${avgAiSharp.toFixed(1)}`
  );
  console.log(`Average improvement: ${avgImprovementStr}`);
  console.log("");
  console.log(`Full results saved to: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
