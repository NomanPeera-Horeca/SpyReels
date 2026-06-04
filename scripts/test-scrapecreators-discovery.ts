/**
 * Compare ScrapeCreators /v1/instagram/search/hashtag vs Apify discovery baseline.
 *
 * Flow per niche: niche routing (Claude) -> hashtag expansion (Haiku) -> SC hashtag API.
 *
 * Run:
 *   ANTHROPIC_API_KEY=... SCRAPECREATORS_API_KEY=... npx tsx scripts/test-scrapecreators-discovery.ts
 *
 * Output:
 *   scripts/output/scrapecreators-test-{timestamp}.json
 *   scripts/output/scrapecreators-grades-{timestamp}.md
 */

import Anthropic from "@anthropic-ai/sdk";
import * as dotenv from "dotenv";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { routeNiche } from "../server/ai/prompts/niche-routing";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const API_BASE = "https://api.scrapecreators.com";
const HASHTAG_PATH = "/v1/instagram/search/hashtag";
const FETCH_TIMEOUT_MS = 60_000;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MIN_FOLLOWERS = 5_000;
const MAX_FOLLOWERS = 500_000;
const TOP_N = 10;
/** Default USD per ScrapeCreators credit (override with SCRAPECREATORS_USD_PER_CREDIT). */
const DEFAULT_USD_PER_CREDIT = 0.002;

const OUTPUT_DIR = join(__dirname, "output");

/** Same prompt as server/discovery/pipeline.ts HASHTAG_EXPANSION_PROMPT */
const HASHTAG_EXPANSION_PROMPT = `You generate Instagram-native hashtags for creator discovery on SpyReels.

Given a niche label and audience persona keywords, return 5 to 8 hashtags that real creators and their target audience actually use on Instagram Reels and posts.

Return ONLY valid JSON in this exact shape:
{
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

RULES:
- Lowercase only, no # prefix, no spaces, no punctuation except letters and numbers
- Tags must look like real Instagram hashtags creators would actually tag (not invented jargon)
- Mix sharp audience-specific tags and broader niche tags
- Avoid generic hashtags like sport, fitness, business, love, instagood
- Avoid overly long hashtags (keep under 25 characters)
- Prefer tags that surface creators who CONSISTENTLY post for the target audience

EXAMPLE:
Niche: Sports & Athletes
Keywords: BJJ competitor, no-gi practitioner
Good output: ["bjjcompetitor", "nogi", "bjjathlete", "ibjjf", "jiujitsulifestyle"]

Do not use em dashes anywhere.
Return ONLY the JSON object, no preamble, no code fences.`;

interface EvalTestCase {
  id: string;
  label: string;
  apifyGrade: string;
  businessDescription: string;
}

const TEST_CASES: EvalTestCase[] = [
  {
    id: "pet-character-content",
    label: "Pet character format",
    apifyGrade: "10/10",
    businessDescription:
      "I run a golden retriever character account where my dog Bruno does daily routines with captions written in his voice. I want to grow my audience of dog lovers.",
  },
  {
    id: "women-over-40-supplements",
    label: "Women 40+ supplements",
    apifyGrade: "10/10",
    businessDescription:
      "I sell pre-workout supplements designed for women over 40 with hormonal weight loss goals. My customers are perimenopausal and menopausal women who lift weights and want to manage weight gain caused by hormonal changes.",
  },
  {
    id: "personal-finance-20s",
    label: "Personal finance 20s",
    apifyGrade: "9/10",
    businessDescription:
      "I teach personal finance basics like budgeting, saving, and credit to people in their 20s starting out.",
  },
  {
    id: "fencing-landscaping-local",
    label: "Fencing landscaping local",
    apifyGrade: "5/10",
    businessDescription:
      "I run a fencing and landscaping company in a small county. My customers are local homeowners and small businesses in my area who need fencing installed or landscaping done. I want to grow beyond my immediate area.",
  },
  {
    id: "ugc-creator-clarified",
    label: "UGC creator",
    apifyGrade: "3-4/10",
    businessDescription:
      "I am a UGC creator who films product review and demo videos for beauty and home brands. My content shows me using products, doing unboxings, and creating short-form review clips. I want to study other UGC creators who make this same content format so I can understand what makes their videos perform well.",
  },
  {
    id: "hr-software-b2b",
    label: "HR software B2B",
    apifyGrade: "1/10",
    businessDescription:
      "I sell HR software to small business owners with 5 to 25 employees. My customers handle hiring, payroll, onboarding, and time tracking themselves and want to stop using spreadsheets.",
  },
];

interface NicheRoutingStep {
  primaryNiche: string;
  secondaryNiches: string[];
  audienceKeywords: string[];
  confidence: number;
  explanation: string;
}

interface HashtagSearchResult {
  hashtag: string;
  success: boolean;
  httpStatus: number | null;
  postCount: number;
  uniqueCreatorsAfterDedupe: number;
  error: string | null;
  rawResponse: unknown;
}

interface CreatorOwner {
  username: string;
  fullName: string;
  bio: string;
  followerCount: number;
  isPrivate: boolean;
  isVerified: boolean;
  sourceHashtags: string[];
}

interface NicheRunResult {
  testCase: EvalTestCase;
  routing: NicheRoutingStep | null;
  routingError: string | null;
  hashtags: string[];
  hashtagExpansionError: string | null;
  hashtagSearches: HashtagSearchResult[];
  allOwnersBeforeFilter: number;
  afterFollowerFilter: number;
  topOwners: CreatorOwner[];
}

interface RunOutput {
  runTimestamp: string;
  estimatedHashtagSearches: number;
  estimatedCostUsd: number;
  usdPerCredit: number;
  niches: NicheRunResult[];
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

function requireApiKey(): string {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) {
    throw new Error("SCRAPECREATORS_API_KEY is not set");
  }
  return key;
}

function requireAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return key;
}

async function expandToHashtags(
  client: Anthropic,
  niche: string,
  audienceKeywords: string[]
): Promise<string[]> {
  const userMessage = `Niche: ${niche}
Audience keywords: ${audienceKeywords.join(", ")}

Return 5 to 8 Instagram-native hashtags as JSON.`;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 500,
    temperature: 0.1,
    system: HASHTAG_EXPANSION_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in hashtag expansion response");
  }

  const parsed = JSON.parse(stripCodeFences(textBlock.text)) as {
    hashtags?: string[];
  };

  return (parsed.hashtags ?? [])
    .map((tag) => tag.replace(/^#/, "").trim().toLowerCase().replace(/\s+/g, ""))
    .filter((tag) => tag.length > 0 && tag.length <= 25)
    .slice(0, 8);
}

async function runNicheRouting(
  businessDescription: string
): Promise<NicheRoutingStep> {
  const raw = await routeNiche({ businessDescription });
  return {
    primaryNiche: raw.primary_niche,
    secondaryNiches: raw.secondary_niches,
    audienceKeywords: raw.audience.audience_persona_keywords,
    confidence: raw.confidence,
    explanation: raw.explanation,
  };
}

function readFollowerCount(owner: Record<string, unknown>): number {
  const direct =
    owner.follower_count ??
    owner.followersCount ??
    owner.followerCount ??
    owner.followers;
  if (typeof direct === "number" && Number.isFinite(direct)) {
    return direct;
  }
  const edge = owner.edge_followed_by;
  if (edge && typeof edge === "object") {
    const count = (edge as Record<string, unknown>).count;
    if (typeof count === "number") return count;
  }
  return 0;
}

function readIsPrivate(owner: Record<string, unknown>): boolean {
  if (typeof owner.is_private === "boolean") return owner.is_private;
  if (typeof owner.isPrivate === "boolean") return owner.isPrivate;
  return false;
}

function readIsVerified(owner: Record<string, unknown>): boolean {
  if (typeof owner.is_verified === "boolean") return owner.is_verified;
  if (typeof owner.isVerified === "boolean") return owner.isVerified;
  return false;
}

function extractPosts(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  if (Array.isArray(root.reels)) return root.reels;
  if (Array.isArray(root.posts)) return root.posts;
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.results)) return root.results;
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (Array.isArray(nested.reels)) return nested.reels;
    if (Array.isArray(nested.posts)) return nested.posts;
    if (Array.isArray(nested.items)) return nested.items;
  }
  return [];
}

function ownerFromPost(item: unknown): CreatorOwner | null {
  if (!item || typeof item !== "object") return null;
  const post = item as Record<string, unknown>;
  const ownerRaw = (post.owner ?? post.user ?? post) as Record<string, unknown>;

  const username = String(
    ownerRaw.username ?? ownerRaw.user_name ?? post.ownerUsername ?? ""
  ).trim();
  if (!username) return null;

  const bio = String(
    ownerRaw.biography ?? ownerRaw.bio ?? ownerRaw.full_name ?? ownerRaw.fullName ?? ""
  ).trim();

  return {
    username,
    fullName: String(ownerRaw.full_name ?? ownerRaw.fullName ?? "").trim(),
    bio,
    followerCount: readFollowerCount(ownerRaw),
    isPrivate: readIsPrivate(ownerRaw),
    isVerified: readIsVerified(ownerRaw),
    sourceHashtags: [],
  };
}

function passesHardFilter(owner: CreatorOwner): boolean {
  if (owner.isPrivate) return false;
  if (owner.followerCount < MIN_FOLLOWERS) return false;
  if (owner.followerCount > MAX_FOLLOWERS) return false;
  return true;
}

async function searchHashtag(hashtag: string): Promise<HashtagSearchResult> {
  const cleanTag = hashtag.replace(/^#/, "").trim();
  const url = new URL(`${API_BASE}${HASHTAG_PATH}`);
  url.searchParams.set("hashtag", cleanTag);
  url.searchParams.set("media_type", "reels");
  url.searchParams.set("date_posted", "last-month");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": requireApiKey() },
      signal: controller.signal,
    });

    const text = await res.text();
    let data: unknown = null;
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { rawText: text.slice(0, 500) };
      }
    }

    if (!res.ok) {
      return {
        hashtag: cleanTag,
        success: false,
        httpStatus: res.status,
        postCount: 0,
        uniqueCreatorsAfterDedupe: 0,
        error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
        rawResponse: data,
      };
    }

    const posts = extractPosts(data);
    const seen = new Set<string>();
    for (const post of posts) {
      const owner = ownerFromPost(post);
      if (owner) seen.add(owner.username.toLowerCase());
    }

    return {
      hashtag: cleanTag,
      success: true,
      httpStatus: res.status,
      postCount: posts.length,
      uniqueCreatorsAfterDedupe: seen.size,
      error: null,
      rawResponse: data,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "request timeout"
        : err instanceof Error
          ? err.message
          : String(err);
    return {
      hashtag: cleanTag,
      success: false,
      httpStatus: null,
      postCount: 0,
      uniqueCreatorsAfterDedupe: 0,
      error: message,
      rawResponse: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function mergeOwnersFromSearch(
  byUsername: Map<string, CreatorOwner>,
  search: HashtagSearchResult
): void {
  if (!search.success || !search.rawResponse) return;
  const posts = extractPosts(search.rawResponse);

  for (const post of posts) {
    const owner = ownerFromPost(post);
    if (!owner) continue;

    const key = owner.username.toLowerCase();
    const existing = byUsername.get(key);
    if (!existing) {
      owner.sourceHashtags = [search.hashtag];
      byUsername.set(key, owner);
      continue;
    }

    if (!existing.sourceHashtags.includes(search.hashtag)) {
      existing.sourceHashtags.push(search.hashtag);
    }
    if (owner.followerCount > existing.followerCount) {
      existing.followerCount = owner.followerCount;
    }
    if (!existing.bio && owner.bio) existing.bio = owner.bio;
    if (!existing.fullName && owner.fullName) existing.fullName = owner.fullName;
    existing.isPrivate = existing.isPrivate || owner.isPrivate;
    existing.isVerified = existing.isVerified || owner.isVerified;
  }
}

function formatMarkdownSummary(output: RunOutput): string {
  const lines: string[] = [
    "# ScrapeCreators hashtag discovery grades",
    "",
    `Run: ${output.runTimestamp}`,
    `Estimated cost: $${output.estimatedCostUsd.toFixed(2)} (${output.estimatedHashtagSearches} hashtag searches at 1 credit each, $${output.usdPerCredit} per credit)`,
    "",
    "Compare against Apify pipeline grades on feat/ai-prompts-eval.",
    "",
  ];

  for (const niche of output.niches) {
    lines.push(`## ${niche.testCase.label} (Apify baseline: ${niche.testCase.apifyGrade})`);
    lines.push("");
    lines.push(`**Business:** ${niche.testCase.businessDescription}`);
    lines.push("");
    if (niche.routingError) {
      lines.push(`**Routing error:** ${niche.routingError}`);
    } else if (niche.routing) {
      lines.push(
        `**Routed niche:** ${niche.routing.primaryNiche} (confidence ${niche.routing.confidence})`
      );
      lines.push(`**Audience keywords:** ${niche.routing.audienceKeywords.join(", ")}`);
    }
    if (niche.hashtagExpansionError) {
      lines.push(`**Hashtag expansion error:** ${niche.hashtagExpansionError}`);
    }
    lines.push(`**Hashtags searched:** ${niche.hashtags.map((h) => `#${h}`).join(", ") || "(none)"}`);
    lines.push(
      `**Creators:** ${niche.allOwnersBeforeFilter} unique owners from posts, ${niche.afterFollowerFilter} after filter (${MIN_FOLLOWERS.toLocaleString()}-${MAX_FOLLOWERS.toLocaleString()} followers, public only)`
    );
    lines.push("");
    lines.push("| Rank | Handle | Followers | Verified | Bio |");
    lines.push("| --- | --- | ---: | --- | --- |");

    niche.topOwners.forEach((owner, idx) => {
      const bio = owner.bio.replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 120);
      lines.push(
        `| ${idx + 1} | @${owner.username} | ${owner.followerCount.toLocaleString()} | ${owner.isVerified ? "yes" : "no"} | ${bio || "(none)"} |`
      );
    });

    if (niche.topOwners.length === 0) {
      lines.push("| - | (no owners passed filter) | - | - | - |");
    }

    lines.push("");
    lines.push("**Hashtag search log:**");
    for (const search of niche.hashtagSearches) {
      if (search.success) {
        lines.push(
          `- #${search.hashtag}: ${search.postCount} posts, ${search.uniqueCreatorsAfterDedupe} unique creators`
        );
      } else {
        lines.push(`- #${search.hashtag}: FAILED (${search.error})`);
      }
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

async function runNicheCase(
  testCase: EvalTestCase,
  anthropic: Anthropic
): Promise<NicheRunResult> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`NICHE: ${testCase.label} (Apify baseline ${testCase.apifyGrade})`);
  console.log(`${"=".repeat(80)}`);

  let routing: NicheRoutingStep | null = null;
  let routingError: string | null = null;
  let hashtags: string[] = [];
  let hashtagExpansionError: string | null = null;

  console.log("Step 1: Niche routing...");
  try {
    routing = await runNicheRouting(testCase.businessDescription);
    console.log(
      `  primary=${routing.primaryNiche}, confidence=${routing.confidence}, keywords=[${routing.audienceKeywords.join(", ")}]`
    );
  } catch (err) {
    routingError =
      err instanceof Error ? err.message : String(err);
    console.log(`  routing FAILED: ${routingError}`);
  }

  if (routing) {
    console.log("Step 2: Hashtag expansion...");
    try {
      hashtags = await expandToHashtags(
        anthropic,
        routing.primaryNiche,
        routing.audienceKeywords
      );
      console.log(`  hashtags: ${hashtags.map((h) => `#${h}`).join(", ")}`);
    } catch (err) {
      hashtagExpansionError =
        err instanceof Error ? err.message : String(err);
      console.log(`  hashtag expansion FAILED: ${hashtagExpansionError}`);
    }
  }

  const hashtagSearches: HashtagSearchResult[] = [];
  const byUsername = new Map<string, CreatorOwner>();

  if (hashtags.length === 0) {
    console.log("  skipping ScrapeCreators searches (no hashtags)");
  }

  for (const hashtag of hashtags) {
    const result = await searchHashtag(hashtag);
    hashtagSearches.push(result);
    mergeOwnersFromSearch(byUsername, result);

    if (result.success) {
      console.log(
        `[discovery] hashtag #${hashtag} returned ${result.postCount} posts, ${result.uniqueCreatorsAfterDedupe} unique creators after dedupe`
      );
    } else {
      console.log(`[discovery] hashtag #${hashtag} FAILED: ${result.error}`);
    }
  }

  const allOwners = [...byUsername.values()];
  const filtered = allOwners.filter(passesHardFilter);
  const topOwners = filtered
    .sort((a, b) => b.followerCount - a.followerCount)
    .slice(0, TOP_N);

  console.log(
    `  niche total: ${allOwners.length} unique owners, ${filtered.length} after filter, top ${topOwners.length} selected`
  );

  return {
    testCase,
    routing,
    routingError,
    hashtags,
    hashtagExpansionError,
    hashtagSearches,
    allOwnersBeforeFilter: allOwners.length,
    afterFollowerFilter: filtered.length,
    topOwners,
  };
}

async function main(): Promise<void> {
  requireAnthropicKey();
  requireApiKey();

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const usdPerCredit = Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || DEFAULT_USD_PER_CREDIT;

  const maxHashtagSearches = TEST_CASES.length * 8;
  const estimatedCostUsd = maxHashtagSearches * usdPerCredit;
  console.log(
    `Estimated cost: $${estimatedCostUsd.toFixed(2)} based on up to ${maxHashtagSearches} hashtag searches at 1 credit each ($${usdPerCredit}/credit)`
  );
  console.log(`Testing ${TEST_CASES.length} niches against ScrapeCreators ${HASHTAG_PATH}`);

  const niches: NicheRunResult[] = [];
  let actualSearches = 0;

  for (const testCase of TEST_CASES) {
    const result = await runNicheCase(testCase, anthropic);
    niches.push(result);
    actualSearches += result.hashtags.length;
  }

  const runTimestamp = new Date().toISOString();
  const timestampSlug = runTimestamp.replace(/[:.]/g, "-");

  const output: RunOutput = {
    runTimestamp,
    estimatedHashtagSearches: actualSearches,
    estimatedCostUsd: actualSearches * usdPerCredit,
    usdPerCredit,
    niches,
  };

  const jsonPath = join(OUTPUT_DIR, `scrapecreators-test-${timestampSlug}.json`);
  const mdPath = join(OUTPUT_DIR, `scrapecreators-grades-${timestampSlug}.md`);

  writeFileSync(jsonPath, JSON.stringify(output, null, 2), "utf-8");
  writeFileSync(mdPath, formatMarkdownSummary(output), "utf-8");

  console.log(`\nSaved JSON: ${jsonPath}`);
  console.log(`Saved grades: ${mdPath}`);
  console.log(
    `Actual estimated cost: $${output.estimatedCostUsd.toFixed(2)} (${actualSearches} searches)`
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
