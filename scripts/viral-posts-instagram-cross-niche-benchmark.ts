/**
 * READ-ONLY cross-niche Instagram Popular-heavy benchmark.
 *
 * Does not change production Instagram retrieval, TikTok, YouTube,
 * Featured, Explore, Saved, Carousel, DB, or the restaurant semantic
 * classifier. Verdicts are printed only. Nothing is persisted.
 */
import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  createDiscoveryScCallTracker,
  enrichInstagramPostByUrl,
  fetchProfile,
  runWithDiscoveryScCallTracker,
  searchInstagramPopular,
  type InstagramSearchPost,
} from "../server/instagram";
import {
  TIER2_MIN_REACH_MULTIPLIER,
  TIER2_MIN_VIEWS,
  scoreViralMetrics,
  type ViralMetricsScore,
} from "../server/discovery/scoring";
import type { AdaptedCandidate } from "../server/viralPosts/candidateAdapter";
import { deriveHook } from "../server/viralPosts/candidateAdapter";

delete process.env.DATABASE_URL;

if (!process.env.ANTHROPIC_API_KEY || !process.env.SCRAPECREATORS_API_KEY) {
  throw new Error(
    "ANTHROPIC_API_KEY and SCRAPECREATORS_API_KEY are required for this read-only benchmark"
  );
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MIN_CONFIDENCE = 0.55;
const SEMANTIC_BATCH_SIZE = 12;
const DEFAULT_SC_USD_PER_CREDIT = 0.002;
const MAX_POPULAR_CALLS = 5;
const MAX_PROFILE_CALLS = 8;
const MAX_POST_DETAIL_CALLS = 5;
const MAX_TOTAL_SC_CALLS = MAX_POPULAR_CALLS + MAX_PROFILE_CALLS + MAX_POST_DETAIL_CALLS;
const MAX_SUITE_SC_CALLS = 270;
const TOP_PREFILTER_ROWS_TO_PRINT = 10;

type NicheSpec = {
  niche: string;
  pillars: [string, string, string];
};

const NICHES: NicheSpec[] = [
  {
    niche: "Fitness & Wellness",
    pillars: ["fat loss", "strength training", "healthy nutrition"],
  },
  {
    niche: "Personal Finance",
    pillars: ["budgeting and saving", "investing", "credit and debt"],
  },
  {
    niche: "Real Estate",
    pillars: ["home buying and selling", "real estate investing", "real estate agent growth"],
  },
  {
    niche: "Beauty & Skincare",
    pillars: ["skincare education", "haircare", "makeup and beauty"],
  },
  {
    niche: "AI & Entrepreneurship",
    pillars: ["AI tools", "business automation", "business growth"],
  },
];

const QUERY_FALLBACKS: Record<string, string[]> = {
  "fat loss": ["weight loss tips", "fat loss", "calorie deficit", "lose body fat", "weight loss habits"],
  "strength training": ["strength training", "gym workout", "build muscle", "lifting tips", "compound lifts"],
  "healthy nutrition": ["healthy eating", "meal prep", "high protein", "nutrition tips", "healthy meals"],
  "budgeting and saving": ["budgeting tips", "save money", "spending plan", "emergency fund", "money habits"],
  investing: ["investing tips", "index funds", "stock market", "start investing", "compound interest"],
  "credit and debt": ["credit score", "pay off debt", "credit cards", "debt payoff", "build credit"],
  "home buying and selling": ["home buying", "selling a house", "first home", "home offers", "closing costs"],
  "real estate investing": ["rental property", "real estate investing", "house hacking", "BRRRR method", "cash flow"],
  "real estate agent growth": ["real estate agent", "listing tips", "get clients", "realtor marketing", "open house"],
  "skincare education": ["skincare tips", "skin barrier", "retinol tips", "acne routine", "skincare routine"],
  haircare: ["haircare tips", "hair growth", "healthy hair", "scalp care", "hair routine"],
  "makeup and beauty": ["makeup tips", "makeup tutorial", "everyday makeup", "beauty routine", "makeup basics"],
  "AI tools": ["AI tools", "ChatGPT tips", "AI productivity", "AI for business", "best AI apps"],
  "business automation": ["business automation", "automate work", "workflow tools", "no code tools", "save time work"],
  "business growth": ["business growth", "grow a business", "customer acquisition", "startup growth", "scale a business"],
};

type PopularRow = InstagramSearchPost & { queries: string[] };
type StrictRow = { post: PopularRow; score: ViralMetricsScore };

type BenchmarkVerdict = {
  sourceId: string;
  domainRelevant: boolean;
  primaryPillar: string | null;
  secondaryPillar: string | null;
  confidence: number;
  reason: string;
};

type RankedPrimaryRow = {
  post: PopularRow;
  verdict: BenchmarkVerdict;
  score: number;
};

type WinnerRow = {
  niche: string;
  pillar: string;
  creator: string;
  shortcode: string;
  query: string;
  caption: string;
  views: number | null;
  followers: number | null;
  reach: number;
  likes: number | null;
  comments: number | null;
  tier: 1 | 2;
  viralScore: number;
  confidence: number;
  url: string;
};

type PillarReport = {
  niche: string;
  pillar: string;
  queries: string[];
  searchOk: number;
  searchFail: number;
  rawRows: number;
  uniquePosts: number;
  uniqueCreators: number;
  targetPrefilter: number;
  siblingPrefilter: number;
  rejectedPrefilter: number;
  queryHaiku: number;
  prefilterHaiku: number;
  finalHaiku: number;
  selectedCreators: string[];
  profileCalls: number;
  profileFailures: number;
  postsGainingFollowers: number;
  postDetailCalls: number;
  postDetailFailures: number;
  realLikesRecovered: number;
  wastedProfileCalls: number;
  wastedPostDetailCalls: number;
  strictViral: number;
  realEngagement: number;
  finalTarget: number;
  siblingReroutes: number;
  rejectedFinal: number;
  scCalls: number;
  actualHttpCalls: number;
  scCost: number;
  result: "STRONG" | "WEAK";
  winners: WinnerRow[];
};

function argValue(name: string): string | null {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]!.trim() : null;
}

function short(value: string | null | undefined, max = 180): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "(no caption)";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function stripCodeFences(text: string): string {
  let trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
  }
  return trimmed.trim();
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.replace(/#/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const words = clean.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 4) return null;
  return clean;
}

function fallbackQueries(pillar: string): string[] {
  return (QUERY_FALLBACKS[pillar] || [pillar, `${pillar} tips`, `${pillar} basics`, `${pillar} guide`, `${pillar} help`])
    .map((query) => normalizeQuery(query))
    .filter((query): query is string => Boolean(query))
    .slice(0, MAX_POPULAR_CALLS);
}

function fillQueries(generated: string[], pillar: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const query of [...generated, ...fallbackQueries(pillar)]) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(query);
    if (out.length >= MAX_POPULAR_CALLS) break;
  }
  return out.slice(0, MAX_POPULAR_CALLS);
}

async function generateQueries(args: {
  client: Anthropic;
  niche: string;
  pillar: string;
  siblings: string[];
}): Promise<{ queries: string[]; haikuCalls: number }> {
  try {
    const response = await args.client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 400,
      temperature: 0.2,
      system:
        "You generate short Instagram Popular Search phrases. Return ONLY valid JSON. Do not use em dashes.",
      messages: [
        {
          role: "user",
          content: `Niche: ${args.niche}
Target pillar: ${args.pillar}
Sibling pillars to avoid aiming at: ${args.siblings.join(", ")}

Return ONLY this JSON:
{"queries":["phrase one","phrase two","phrase three","phrase four","phrase five"]}

Rules:
1. Exactly 5 phrases.
2. Each phrase is 2 to 4 words.
3. Natural phrases people actually type into Instagram search.
4. No hashtags, no sentences, no punctuation besides apostrophes.
5. Do not stuff niche + pillar + adjectives together.
6. Avoid repeating obvious synonyms five times.
7. Do not use restaurant or hospitality terminology.
8. Aim at the target pillar meaning, not the sibling pillars.`,
        },
      ],
    });
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("query generation returned no text");
    }
    const parsed = JSON.parse(stripCodeFences(textBlock.text)) as { queries?: unknown };
    const generated = Array.isArray(parsed.queries)
      ? parsed.queries.map(normalizeQuery).filter((query): query is string => Boolean(query))
      : [];
    return { queries: fillQueries(generated, args.pillar), haikuCalls: 1 };
  } catch (error) {
    console.warn("[cross-niche] query_generation_failed", {
      niche: args.niche,
      pillar: args.pillar,
      error: error instanceof Error ? error.message : String(error),
    });
    return { queries: fillQueries([], args.pillar), haikuCalls: 1 };
  }
}

function normalizeVerdict(row: unknown, allowed: Set<string>): BenchmarkVerdict | null {
  if (!row || typeof row !== "object") return null;
  const raw = row as Record<string, unknown>;
  const sourceId = String(raw.sourceId ?? "").trim();
  if (!sourceId) return null;
  const domainRelevant = raw.domainRelevant === true;
  const confidenceRaw = Number(raw.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
  const primaryRaw = typeof raw.primaryPillar === "string" ? raw.primaryPillar.trim() : "";
  const secondaryRaw = typeof raw.secondaryPillar === "string" ? raw.secondaryPillar.trim() : "";
  const primaryPillar = domainRelevant && allowed.has(primaryRaw) ? primaryRaw : null;
  const secondaryPillar =
    domainRelevant && allowed.has(secondaryRaw) && secondaryRaw !== primaryPillar ? secondaryRaw : null;
  return {
    sourceId,
    domainRelevant: domainRelevant && primaryPillar !== null,
    primaryPillar,
    secondaryPillar,
    confidence,
    reason: String(raw.reason ?? "").trim().slice(0, 300),
  };
}

async function classifyBatch(args: {
  client: Anthropic;
  niche: string;
  pillars: string[];
  candidates: AdaptedCandidate[];
}): Promise<BenchmarkVerdict[]> {
  const allowed = new Set(args.pillars);
  const candidateLines = args.candidates
    .map((candidate) => {
      const caption = (candidate.caption || "").replace(/\s+/g, " ").trim().slice(0, 520);
      const hook = (candidate.hook || "").replace(/\s+/g, " ").trim().slice(0, 180);
      return `- sourceId: ${candidate.sourceId}\n  creator: ${candidate.creatorHandle || candidate.creatorName}\n  hook: ${hook || "(none)"}\n  caption: ${caption || "(none)"}`;
    })
    .join("\n\n");

  const response = await args.client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1800,
    temperature: 0.05,
    system: `You classify already-viral Instagram Reels for a SpyReels RESEARCH benchmark. This judge is benchmark-only and is not a production classifier.

Your job is semantic relevance, not virality. Decide what the video is actually ABOUT.

Return ONLY valid JSON in this exact shape:
{
  "reels": [
    {
      "sourceId": "AbC123",
      "domainRelevant": true,
      "primaryPillar": "${args.pillars[0]}",
      "secondaryPillar": null,
      "confidence": 0.88,
      "reason": "Short reason"
    }
  ]
}

Allowed pillars for niche "${args.niche}", exact strings only:
${args.pillars.map((pillar) => `- ${pillar}`).join("\n")}

RULES:
1. Judge actual meaning, not keyword match, hashtags, or format.
2. domainRelevant=true only when the video teaches something useful to a person in this niche and maps to one allowed pillar.
3. Generic entertainment, dances, memes, thirst traps, house tours, GRWM, luxury flex, AI art dumps, or lifestyle filler are domainRelevant=false even if a keyword appears.
4. primaryPillar must be exactly one allowed pillar when domainRelevant=true.
5. secondaryPillar is optional metadata only.
6. confidence is 0 to 1 and measures semantic confidence, not virality.
7. If domainRelevant=false, primaryPillar and secondaryPillar must be null.
8. Preserve the exact sourceId values. Return exactly one entry per input.
9. Do not use em dashes.
10. Return ONLY the JSON object, no preamble or code fences.`,
    messages: [
      {
        role: "user",
        content: `Niche: ${args.niche}\nAllowed pillars: ${args.pillars.join(" | ")}\n\nReels to classify:\n${candidateLines}\n\nReturn semantic classification JSON for every sourceId.`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("benchmark semantic judge returned no text");
  }
  const parsed = JSON.parse(stripCodeFences(textBlock.text)) as { reels?: unknown[] };
  if (!Array.isArray(parsed.reels)) {
    throw new Error("benchmark semantic judge missing reels array");
  }
  return parsed.reels
    .map((row) => normalizeVerdict(row, allowed))
    .filter((row): row is BenchmarkVerdict => row !== null);
}

async function classifyPosts(args: {
  client: Anthropic;
  niche: string;
  pillars: string[];
  candidates: AdaptedCandidate[];
}): Promise<{ verdicts: BenchmarkVerdict[]; haikuCalls: number }> {
  if (args.candidates.length === 0) return { verdicts: [], haikuCalls: 0 };
  const verdicts: BenchmarkVerdict[] = [];
  let haikuCalls = 0;
  for (const batch of chunkArray(args.candidates, SEMANTIC_BATCH_SIZE)) {
    const batchVerdicts = await classifyBatch({
      client: args.client,
      niche: args.niche,
      pillars: args.pillars,
      candidates: batch,
    });
    haikuCalls += 1;
    verdicts.push(...batchVerdicts);
  }
  return { verdicts, haikuCalls };
}

function mergePopularRows(rows: Array<InstagramSearchPost & { query: string }>): PopularRow[] {
  const byId = new Map<string, PopularRow>();
  for (const row of rows) {
    const existing = byId.get(row.shortcode);
    if (!existing) {
      byId.set(row.shortcode, { ...row, queries: [row.query] });
      continue;
    }
    if (!existing.queries.includes(row.query)) existing.queries.push(row.query);
    if ((row.views ?? 0) > (existing.views ?? 0)) existing.views = row.views;
    if ((row.likes ?? 0) > (existing.likes ?? 0)) existing.likes = row.likes;
    if ((row.comments ?? 0) > (existing.comments ?? 0)) existing.comments = row.comments;
    if (!existing.ownerUsername && row.ownerUsername) existing.ownerUsername = row.ownerUsername;
  }
  return [...byId.values()];
}

function toAdapted(post: PopularRow, niche: string, pillar: string): AdaptedCandidate {
  const caption = post.caption || "";
  return {
    platform: "instagram",
    sourceId: post.shortcode,
    sourceUrl: post.sourceUrl,
    creatorId: post.ownerUsername || null,
    creatorName: post.ownerUsername || "Instagram creator",
    creatorHandle: post.ownerUsername ? `@${post.ownerUsername}` : null,
    creatorAvatarUrl: null,
    creatorFollowers: post.ownerFollowerCount,
    thumbnailUrl: post.thumbnailUrl,
    videoUrl: post.videoUrl,
    caption,
    transcript: null,
    hashtags: [],
    publishedAt: post.publishedAt,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    shares: null,
    saves: null,
    reachMultiplier: null,
    engagementRate: null,
    viewsPerHour: null,
    trendStatus: "proven-format",
    relevanceHint: 50,
    contentPillar: null,
    relevanceLabel: "Instagram Popular cross-niche benchmark",
    relevanceReason: `Popular search candidate for ${niche} / ${pillar}`,
    hook: deriveHook(caption),
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: {
      source: "instagram_popular_cross_niche_benchmark",
      queries: post.queries,
    },
  };
}

function verdictMap(verdicts: BenchmarkVerdict[]): Map<string, BenchmarkVerdict> {
  return new Map(verdicts.map((verdict) => [verdict.sourceId, verdict]));
}

function rankPrimaryRows(args: {
  posts: PopularRow[];
  verdicts: BenchmarkVerdict[];
  pillar: string;
}): RankedPrimaryRow[] {
  const byVerdict = verdictMap(args.verdicts);
  return args.posts
    .map((post) => {
      const verdict = byVerdict.get(post.shortcode);
      if (
        post.views == null ||
        post.views < TIER2_MIN_VIEWS ||
        !post.ownerUsername ||
        !verdict?.domainRelevant ||
        verdict.primaryPillar !== args.pillar ||
        verdict.confidence < MIN_CONFIDENCE
      ) {
        return null;
      }
      const score = verdict.confidence * Math.log10(1 + post.views);
      return { post, verdict, score };
    })
    .filter((row): row is RankedPrimaryRow => row !== null)
    .sort((a, b) => b.score - a.score);
}

function selectDiversifiedCreators(args: {
  ranked: RankedPrimaryRow[];
  queries: string[];
  maxCreators: number;
}): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const query of args.queries) {
    if (selected.length >= args.maxCreators) break;
    const row = args.ranked.find((candidate) => {
      if (!candidate.post.queries.includes(query)) return false;
      const handle = candidate.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
      return handle && !seen.has(handle);
    });
    if (!row) continue;
    const handle = row.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
    seen.add(handle);
    selected.push(handle);
  }

  for (const row of args.ranked) {
    if (selected.length >= args.maxCreators) break;
    const handle = row.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    selected.push(handle);
  }

  return selected;
}

function applyProfile(
  posts: PopularRow[],
  handle: string,
  profile: Awaited<ReturnType<typeof fetchProfile>>
): number {
  const clean = handle.replace(/^@/, "").trim().toLowerCase();
  let touched = 0;
  for (const post of posts) {
    if (post.ownerUsername.replace(/^@/, "").trim().toLowerCase() !== clean) continue;
    if (!post.ownerFollowerCount && profile.followerCount > 0) {
      post.ownerFollowerCount = profile.followerCount;
      touched++;
    }
    post.ownerIsPrivate = profile.isPrivate;
    post.ownerIsVerified = profile.isVerified;
  }
  return touched;
}

function prequalifiesForDetail(post: PopularRow): boolean {
  if (
    post.views == null ||
    post.views < TIER2_MIN_VIEWS ||
    post.ownerFollowerCount == null ||
    post.ownerFollowerCount <= 0 ||
    post.ownerIsPrivate === true
  ) {
    return false;
  }
  return post.views / post.ownerFollowerCount >= TIER2_MIN_REACH_MULTIPLIER;
}

function selectPostsForDetail(args: {
  posts: PopularRow[];
  verdicts: BenchmarkVerdict[];
  pillar: string;
  maxPosts: number;
}): PopularRow[] {
  const byVerdict = verdictMap(args.verdicts);
  return args.posts
    .filter((post) => {
      const verdict = byVerdict.get(post.shortcode);
      return (
        prequalifiesForDetail(post) &&
        verdict?.domainRelevant === true &&
        verdict.primaryPillar === args.pillar &&
        verdict.confidence >= MIN_CONFIDENCE
      );
    })
    .sort((a, b) => {
      const va = byVerdict.get(a.shortcode)?.confidence ?? 0;
      const vb = byVerdict.get(b.shortcode)?.confidence ?? 0;
      const reachA = (a.views ?? 0) / Math.max(1, a.ownerFollowerCount ?? 1);
      const reachB = (b.views ?? 0) / Math.max(1, b.ownerFollowerCount ?? 1);
      return vb * Math.log10(1 + reachB) - va * Math.log10(1 + reachA);
    })
    .slice(0, Math.max(0, args.maxPosts));
}

function mergePostDetail(post: PopularRow, detail: InstagramSearchPost): void {
  post.views = detail.views ?? post.views;
  post.likes = detail.likes ?? post.likes;
  post.comments = detail.comments ?? post.comments;
  post.publishedAt = detail.publishedAt ?? post.publishedAt;
  post.thumbnailUrl = detail.thumbnailUrl ?? post.thumbnailUrl;
  post.videoUrl = detail.videoUrl ?? post.videoUrl;
  post.ownerUsername = detail.ownerUsername || post.ownerUsername;
  post.ownerFollowerCount = detail.ownerFollowerCount ?? post.ownerFollowerCount;
  post.ownerIsPrivate = detail.ownerIsPrivate ?? post.ownerIsPrivate;
  post.ownerIsVerified = detail.ownerIsVerified ?? post.ownerIsVerified;
}

function strictScore(post: PopularRow): ViralMetricsScore | null {
  if (
    post.views == null ||
    post.views <= 0 ||
    post.ownerFollowerCount == null ||
    post.ownerFollowerCount <= 0
  ) {
    return null;
  }
  return scoreViralMetrics({
    views: post.views,
    likes: post.likes ?? 0,
    comments: post.comments ?? 0,
    followers: post.ownerFollowerCount,
    isPrivate: post.ownerIsPrivate === true,
  });
}

function selectedTests(): Array<{ niche: string; pillar: string; siblings: string[] }> {
  const onlyNiche = argValue("--niche");
  const onlyPillar = argValue("--pillar");
  const out: Array<{ niche: string; pillar: string; siblings: string[] }> = [];
  for (const spec of NICHES) {
    if (onlyNiche && spec.niche.toLowerCase() !== onlyNiche.toLowerCase()) continue;
    for (const pillar of spec.pillars) {
      if (onlyPillar && pillar.toLowerCase() !== onlyPillar.toLowerCase()) continue;
      out.push({
        niche: spec.niche,
        pillar,
        siblings: spec.pillars.filter((item) => item !== pillar),
      });
    }
  }
  return out;
}

async function runPillar(args: {
  client: Anthropic;
  niche: string;
  pillar: string;
  siblings: string[];
  suiteScUsed: number;
}): Promise<PillarReport> {
  const pillars = [args.pillar, ...args.siblings];
  const queryGen = await generateQueries({
    client: args.client,
    niche: args.niche,
    pillar: args.pillar,
    siblings: args.siblings,
  });
  const queries = queryGen.queries;
  console.log(`\nGENERATED QUERIES for ${args.niche} / ${args.pillar}`);
  for (const query of queries) console.log(`- ${query}`);

  const remainingSuite = MAX_SUITE_SC_CALLS - args.suiteScUsed;
  const pillarBudget = Math.min(MAX_TOTAL_SC_CALLS, remainingSuite);
  const tracker = createDiscoveryScCallTracker(pillarBudget);

  return runWithDiscoveryScCallTracker(tracker, async () => {
    const collected: Array<InstagramSearchPost & { query: string }> = [];
    const perQuery = new Map<string, { ok: boolean; raw: number; error?: string }>();
    let popularCalls = 0;

    for (const query of queries) {
      if (tracker.count >= pillarBudget) break;
      try {
        const result = await searchInstagramPopular(query);
        popularCalls += 1;
        perQuery.set(query, { ok: true, raw: result.rawCount });
        for (const post of result.posts) collected.push({ ...post, query });
      } catch (error) {
        popularCalls += 1;
        const message = error instanceof Error ? error.message : String(error);
        perQuery.set(query, { ok: false, raw: 0, error: message });
        console.warn("[cross-niche] popular_failed", { query, error: message });
      }
    }

    const posts = mergePopularRows(collected);
    const prefilter = await classifyPosts({
      client: args.client,
      niche: args.niche,
      pillars,
      candidates: posts.map((post) => toAdapted(post, args.niche, args.pillar)),
    });
    const rankedPrimary = rankPrimaryRows({
      posts,
      verdicts: prefilter.verdicts,
      pillar: args.pillar,
    });

    console.log("\nTOP TARGET-PILLAR CANDIDATES BEFORE ENRICHMENT");
    for (const row of rankedPrimary.slice(0, TOP_PREFILTER_ROWS_TO_PRINT)) {
      console.log(
        `${row.post.ownerUsername} | ${row.post.shortcode} | query=${row.post.queries.join("+")} | views=${row.post.views ?? "n/a"} | conf=${row.verdict.confidence.toFixed(2)} | ${short(row.post.caption, 120)}`
      );
    }

    const selectedCreators = selectDiversifiedCreators({
      ranked: rankedPrimary,
      queries,
      maxCreators: MAX_PROFILE_CALLS,
    });
    console.log(`SELECTED CREATORS: ${selectedCreators.join(", ") || "(none)"}`);

    let profileCalls = 0;
    let profileFailures = 0;
    const profileTouchCounts = new Map<string, number>();
    for (const handle of selectedCreators) {
      if (tracker.count >= pillarBudget) break;
      try {
        const profile = await fetchProfile(handle);
        profileCalls += 1;
        profileTouchCounts.set(handle, applyProfile(posts, handle, profile));
      } catch (error) {
        profileCalls += 1;
        profileFailures += 1;
        profileTouchCounts.set(handle, 0);
        console.warn("[cross-niche] profile_failed", {
          handle,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const detailSelected = selectPostsForDetail({
      posts,
      verdicts: prefilter.verdicts,
      pillar: args.pillar,
      maxPosts: MAX_POST_DETAIL_CALLS,
    });

    let postDetailCalls = 0;
    let postDetailFailures = 0;
    for (const post of detailSelected) {
      if (tracker.count >= pillarBudget) break;
      try {
        const detail = await enrichInstagramPostByUrl(post.sourceUrl);
        postDetailCalls += 1;
        if (!detail) {
          postDetailFailures += 1;
          continue;
        }
        mergePostDetail(post, detail);
      } catch (error) {
        postDetailCalls += 1;
        postDetailFailures += 1;
        console.warn("[cross-niche] post_detail_failed", {
          shortcode: post.shortcode,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const prefilterById = verdictMap(prefilter.verdicts);
    const strictRows: StrictRow[] = [];
    for (const post of posts) {
      const verdict = prefilterById.get(post.shortcode);
      if (
        !verdict?.domainRelevant ||
        verdict.primaryPillar !== args.pillar ||
        verdict.confidence < MIN_CONFIDENCE
      ) {
        continue;
      }
      const score = strictScore(post);
      if (score) strictRows.push({ post, score });
    }

    const finalSemantic = await classifyPosts({
      client: args.client,
      niche: args.niche,
      pillars,
      candidates: strictRows.map((row) => {
        const candidate = toAdapted(row.post, args.niche, args.pillar);
        candidate.creatorFollowers = row.post.ownerFollowerCount;
        candidate.views = row.post.views;
        candidate.likes = row.post.likes;
        candidate.comments = row.post.comments;
        candidate.reachMultiplier = row.score.reachMultiplier;
        candidate.engagementRate = row.score.engagementRate;
        return candidate;
      }),
    });

    const finalById = verdictMap(finalSemantic.verdicts);
    let finalTarget = 0;
    let siblingReroutes = 0;
    let rejectedFinal = 0;
    const winners: WinnerRow[] = [];
    for (const row of strictRows) {
      const verdict = finalById.get(row.post.shortcode);
      if (!verdict?.domainRelevant || !verdict.primaryPillar || verdict.confidence < MIN_CONFIDENCE) {
        rejectedFinal += 1;
        continue;
      }
      if (verdict.primaryPillar === args.pillar) {
        finalTarget += 1;
        winners.push({
          niche: args.niche,
          pillar: args.pillar,
          creator: row.post.ownerUsername || "(unknown)",
          shortcode: row.post.shortcode,
          query: row.post.queries.join("+"),
          caption: short(row.post.caption),
          views: row.post.views,
          followers: row.post.ownerFollowerCount,
          reach: row.score.reachMultiplier,
          likes: row.post.likes,
          comments: row.post.comments,
          tier: row.score.tier,
          viralScore: row.score.viralScore,
          confidence: verdict.confidence,
          url: row.post.sourceUrl,
        });
        continue;
      }
      if (args.siblings.includes(verdict.primaryPillar)) {
        siblingReroutes += 1;
        continue;
      }
      rejectedFinal += 1;
    }

    const primaryPrefilter = rankedPrimary.length;
    const siblingPrefilter = prefilter.verdicts.filter(
      (verdict) =>
        verdict.domainRelevant &&
        verdict.primaryPillar &&
        verdict.primaryPillar !== args.pillar &&
        verdict.confidence >= MIN_CONFIDENCE
    ).length;
    const rejectedPrefilter = posts.length - primaryPrefilter - siblingPrefilter;
    const strictIds = new Set(strictRows.map((row) => row.post.shortcode));
    const strictCreators = new Set(
      strictRows.map((row) => row.post.ownerUsername.replace(/^@/, "").trim().toLowerCase())
    );
    const wastedProfileCalls = selectedCreators.filter((handle) => !strictCreators.has(handle)).length;
    const wastedPostDetailCalls = detailSelected.filter((post) => !strictIds.has(post.shortcode)).length;
    const realEngagement = strictRows.filter(
      (row) => row.post.likes != null || row.post.comments != null
    ).length;
    const postsGainingFollowers = [...profileTouchCounts.values()].reduce((sum, n) => sum + n, 0);
    const realLikesRecovered = posts.filter((post) => post.likes != null || post.comments != null).length;
    const scCalls = popularCalls + profileCalls + postDetailCalls;
    const searchOk = queries.filter((query) => perQuery.get(query)?.ok).length;
    const searchFail = queries.length - searchOk;
    const rawRows = [...perQuery.values()].reduce((sum, row) => sum + row.raw, 0);
    const winnerRealEngagement = winners.filter(
      (row) => row.likes != null || row.comments != null
    ).length;
    const result: "STRONG" | "WEAK" =
      finalTarget >= 3 &&
      winners.length >= 3 &&
      winners.every((row) => (row.followers ?? 0) > 0) &&
      winnerRealEngagement >= 2 &&
      scCalls <= MAX_TOTAL_SC_CALLS
        ? "STRONG"
        : "WEAK";

    console.log("\n============================================================");
    console.log("SPYREELS READ-ONLY INSTAGRAM CROSS-NICHE POPULAR BENCHMARK");
    console.log("============================================================");
    console.log(`niche: ${args.niche}`);
    console.log(`pillar: ${args.pillar}`);
    console.log(`queries: ${queries.join(" | ")}`);
    console.log("NO DB WRITES. NO POOL REFRESH. NO PRODUCTION WIRING.");
    console.log("BENCHMARK-ONLY semantic judge. Production restaurant classifier unused.");

    console.log("\nSEARCH");
    for (const query of queries) {
      const row = perQuery.get(query);
      console.log(`${query}: ${row?.ok ? "OK" : "FAIL"} raw=${row?.raw ?? 0}${row?.error ? ` ${row.error}` : ""}`);
    }
    console.log(`successful calls: ${searchOk}`);
    console.log(`404/error calls: ${searchFail}`);
    console.log(`raw rows: ${rawRows}`);
    console.log(`unique posts: ${posts.length}`);
    console.log(
      `unique creators: ${new Set(posts.map((post) => post.ownerUsername.toLowerCase()).filter(Boolean)).size}`
    );

    console.log("\nPREFILTER");
    console.log(`target primary: ${primaryPrefilter}`);
    console.log(`sibling primary: ${siblingPrefilter}`);
    console.log(`rejected: ${rejectedPrefilter}`);
    console.log(`Haiku calls: ${prefilter.haikuCalls}`);

    console.log("\nENRICHMENT");
    console.log(`selected creators: ${selectedCreators.join(", ") || "(none)"}`);
    console.log(`profile calls: ${profileCalls}/${MAX_PROFILE_CALLS}`);
    console.log(`profile failures: ${profileFailures}`);
    for (const handle of selectedCreators) {
      console.log(`  @${handle}: follower data attached to ${profileTouchCounts.get(handle) ?? 0} post(s)`);
    }
    console.log(`posts gaining follower counts: ${postsGainingFollowers}`);
    console.log(`post-detail calls: ${postDetailCalls}/${MAX_POST_DETAIL_CALLS}`);
    console.log(`post-detail failures: ${postDetailFailures}`);
    console.log(`real likes/comments recovered: ${realLikesRecovered}`);
    console.log(`wasted profile calls: ${wastedProfileCalls}`);
    console.log(`wasted post-detail calls: ${wastedPostDetailCalls}`);

    console.log("\nSTRICT");
    console.log(`strict viral total: ${strictRows.length}`);
    console.log(`strict with real engagement: ${realEngagement}`);
    console.log(`final target-pillar admitted: ${finalTarget}`);
    console.log(`sibling rerouted: ${siblingReroutes}`);
    console.log(`rejected: ${rejectedFinal}`);

    console.log("\nCOST");
    console.log(`actual logical SC calls: ${scCalls}/${MAX_TOTAL_SC_CALLS}`);
    console.log(`actual HTTP SC calls: ${tracker.count}`);
    console.log(`estimated SC cost: $${(scCalls * DEFAULT_SC_USD_PER_CREDIT).toFixed(4)}`);
    console.log(`query-generation Haiku: ${queryGen.haikuCalls}`);
    console.log(`semantic Haiku: ${prefilter.haikuCalls + finalSemantic.haikuCalls}`);

    console.log("\nFINAL TARGET-PILLAR STRICT WINNERS");
    if (winners.length === 0) console.log("(none)");
    for (const winner of winners.sort((a, b) => b.reach - a.reach)) {
      console.log(
        `${winner.niche} | ${winner.pillar} | ${winner.creator} | ${winner.shortcode} | query=${winner.query} | views=${winner.views ?? "n/a"} | followers=${winner.followers ?? "n/a"} | reach=${winner.reach.toFixed(2)}x | likes=${winner.likes ?? "n/a"} | comments=${winner.comments ?? "n/a"} | tier=${winner.tier} | viralScore=${winner.viralScore.toFixed(2)} | conf=${winner.confidence.toFixed(2)}`
      );
      console.log(`  caption: ${winner.caption}`);
      console.log(`  ${winner.url}`);
    }
    console.log(`PILLAR RESULT: ${result}`);
    console.log("============================================================\n");

    return {
      niche: args.niche,
      pillar: args.pillar,
      queries,
      searchOk,
      searchFail,
      rawRows,
      uniquePosts: posts.length,
      uniqueCreators: new Set(posts.map((post) => post.ownerUsername.toLowerCase()).filter(Boolean)).size,
      targetPrefilter: primaryPrefilter,
      siblingPrefilter,
      rejectedPrefilter,
      queryHaiku: queryGen.haikuCalls,
      prefilterHaiku: prefilter.haikuCalls,
      finalHaiku: finalSemantic.haikuCalls,
      selectedCreators,
      profileCalls,
      profileFailures,
      postsGainingFollowers,
      postDetailCalls,
      postDetailFailures,
      realLikesRecovered,
      wastedProfileCalls,
      wastedPostDetailCalls,
      strictViral: strictRows.length,
      realEngagement,
      finalTarget,
      siblingReroutes,
      rejectedFinal,
      scCalls,
      actualHttpCalls: tracker.count,
      scCost: scCalls * DEFAULT_SC_USD_PER_CREDIT,
      result,
      winners,
    };
  });
}

function nichePassed(reports: PillarReport[], niche: string): boolean {
  return reports.filter((row) => row.niche === niche && row.result === "STRONG").length >= 2;
}

async function main(): Promise<void> {
  const tests = selectedTests();
  if (tests.length === 0) {
    throw new Error("No matching niche/pillar tests. Check --niche and --pillar.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const reports: PillarReport[] = [];
  let suiteScUsed = 0;
  let suiteHttpUsed = 0;

  console.log("SPYREELS READ-ONLY INSTAGRAM CROSS-NICHE SUITE");
  console.log(`tests: ${tests.length}`);
  console.log(`hard max SC per pillar: ${MAX_TOTAL_SC_CALLS}`);
  console.log(`hard max SC across suite: ${MAX_SUITE_SC_CALLS}`);
  console.log("Production restaurant classifier is NOT used.");
  console.log("NO DATABASE_URL. NO POOL REFRESH. NO PRODUCTION WIRING.");

  for (const test of tests) {
    if (suiteScUsed >= MAX_SUITE_SC_CALLS) {
      console.warn("[cross-niche] suite SC cap reached, stopping remaining pillars");
      break;
    }
    const report = await runPillar({
      client,
      niche: test.niche,
      pillar: test.pillar,
      siblings: test.siblings,
      suiteScUsed,
    });
    reports.push(report);
    suiteScUsed += report.scCalls;
    suiteHttpUsed += report.actualHttpCalls;
    console.log(
      `SUITE PROGRESS logical SC=${suiteScUsed}/${MAX_SUITE_SC_CALLS} http SC=${suiteHttpUsed} last=${report.niche} / ${report.pillar} ${report.result}`
    );
  }

  console.log("\n============================================================");
  console.log("FINAL COMPARISON TABLE");
  console.log("============================================================");
  console.log(
    "niche | pillar | SC | search OK | unique | target prefilter | strict | real eng | final target | siblings | result"
  );
  for (const row of reports) {
    console.log(
      `${row.niche} | ${row.pillar} | ${row.scCalls} | ${row.searchOk}/5 | ${row.uniquePosts} | ${row.targetPrefilter} | ${row.strictViral} | ${row.realEngagement} | ${row.finalTarget} | ${row.siblingReroutes} | ${row.result}`
    );
  }

  console.log("\nNICHE SUMMARY");
  for (const spec of NICHES) {
    const rows = reports.filter((row) => row.niche === spec.niche);
    if (rows.length === 0) {
      console.log(`${spec.niche}: NOT RUN`);
      continue;
    }
    console.log(`${spec.niche}: ${nichePassed(reports, spec.niche) ? "PASS" : "FAIL"}`);
  }
  const nichesRun = NICHES.filter((spec) => reports.some((row) => row.niche === spec.niche));
  const nichesPassed = nichesRun.filter((spec) => nichePassed(reports, spec.niche)).length;
  console.log(`\nOVERALL: ${nichesPassed} / ${nichesRun.length} niches passed.`);
  console.log(`TOTAL LOGICAL SC CALLS: ${suiteScUsed}`);
  console.log(`TOTAL HTTP SC CALLS: ${suiteHttpUsed}`);
  console.log(`ESTIMATED SC COST: $${(suiteScUsed * DEFAULT_SC_USD_PER_CREDIT).toFixed(4)}`);
  console.log(
    `TOTAL HAIKU CALLS: ${reports.reduce((sum, row) => sum + row.queryHaiku + row.prefilterHaiku + row.finalHaiku, 0)}`
  );
  console.log("============================================================\n");
}

main().catch((error) => {
  console.error("[viral-posts-instagram-cross-niche-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
