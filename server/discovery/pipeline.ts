/**
 * Discovery V1 production pipeline.
 * Lifted from scripts/test-discovery-pipeline.ts (validated cb4b7e7).
 * Stage boundaries kept explicit for future PostHog instrumentation.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ApifyClient } from "apify-client";
import { routeNiche } from "../ai/prompts/niche-routing";

export interface DiscoveryPipelineInput {
  description: string;
  routedNiche?: string;
  clarification?: "peers" | "audience";
  fromCache?: {
    audienceKeywords: string[];
    bioMatchTerms: string[];
    enrichedProfiles: DiscoveryProfile[];
  };
}

export interface ScoredCreator {
  rankPosition: number;
  instagramHandle: string;
  followerCount: number;
  engagementRate: number;
  nicheFitScore: number;
  whyMatchSummary: string;
}

export interface MergeStats {
  hashtagOnly: number;
  keywordOnly: number;
  both: number;
  totalUnique: number;
}

export interface FilterStats {
  passed: number;
  bioMatch: number;
  withoutBioMatch: number;
  emptyBio: number;
  sizeOutOfBand: number;
}

export interface ScoredCandidateRaw {
  username: string;
  followerCount: number;
  source: CandidateSource;
  score: number;
  match_type: string;
  reasoning: string;
  bio: string;
}

export interface DiscoveryPipelineDiagnostics {
  audienceKeywords: string[];
  step2AHashtags: string[];
  step2BPhrases: string[];
  step3AHashtagCandidates: number;
  step3BKeywordCandidates: number;
  step3CMerge: MergeStats;
  step4ProfilesEnriched: number;
  step5Filter: FilterStats;
  step6ScoredCount: number;
  sharpCount: number;
  tangentialCount: number;
  apifyHashtagUsd: number;
  apifyKeywordUsd: number;
  apifyEnrichmentUsd: number;
  top10Raw: ScoredCandidateRaw[];
}

export interface DiscoveryPipelineResult {
  routedNiche: string;
  routingConfidence: number;
  creators: ScoredCreator[];
  costs: { apifyUsd: number; claudeUsd: number };
  diagnostics: DiscoveryPipelineDiagnostics;
}

type CandidateSource = "hashtag" | "keyword" | "both";

export interface DiscoveryProfile {
  username: string;
  bio: string;
  followerCount: number;
  followingCount: number;
  postsCount: number;
  bioLinks: string[];
  category: string | null;
  source: CandidateSource;
  scrapeCaption: string;
  scrapeLikesScore: number;
  bioMatch?: boolean;
  keywordSearchRank?: number;
}

interface NicheRoutingStep {
  niche: string;
  audienceKeywords: string[];
  confidence: number;
}

interface HashtagPostCandidate {
  username: string;
  caption: string;
  likes: number;
  hashtag: string;
}

interface KeywordHandleCandidate {
  username: string;
  searchRank: number;
}

interface ScoredCandidate {
  username: string;
  followerCount: number;
  source: CandidateSource;
  score: number;
  match_type: string;
  reasoning: string;
  bio: string;
}

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const APIFY_WAIT_SECS = 300;
const SCORING_CONCURRENCY = 3;

const HASHTAG_ACTOR = "apify/instagram-hashtag-scraper";
const USER_SCRAPER_ACTOR = "lezdhAFfa4H5zAb2A";

const HASHTAG_RESULTS_LIMIT = 30;
const KEYWORD_SEARCH_MAX_ITEMS = 80;
const MAX_ENRICHMENT_HANDLES = 200;
const MIN_FOLLOWERS = 5_000;

/** Apify Instagram hashtag scraper: ~$2.60 per 1,000 results */
const APIFY_HASHTAG_USD_PER_RESULT = 2.6 / 1000;
/** apidojo keyword search: ~$0.02 per search */
const APIFY_KEYWORD_SEARCH_USD = 0.02;
/** apidojo profile URL lookup rough estimate */
const APIFY_ENRICHMENT_USD_PER_PROFILE = 0.008;
const HAIKU_INPUT_USD_PER_M = 1;
const HAIKU_OUTPUT_USD_PER_M = 5;

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

const PHRASE_EXPANSION_PROMPT = `You generate Instagram bio phrases for creator discovery on SpyReels.

Given a niche label and audience persona keywords, return 5 to 8 natural language BIO PHRASES (not hashtags) that a creator would write in their Instagram bio to describe themselves or their audience.

Return ONLY valid JSON in this exact shape:
{
  "phrases": ["phrase one", "phrase two", "phrase three"]
}

RULES:
- Each phrase is 1 to 3 words, natural language (no hashtag formatting, no # prefix)
- Phrases should reflect how someone would describe themselves or their audience in a bio
- Mix sharp audience-specific phrases and broader niche identity phrases
- Avoid generic single words like "business", "fitness", "love"
- Phrases must be plausible as substring matches inside real Instagram bios

EXAMPLES:
Niche: Restaurants & Cafes
Keywords: restaurant owner, restaurateur
Good output: ["restaurant owner", "restaurateur", "restaurant marketing", "menu development", "restaurant business", "hospitality consultant"]

Niche: Pets & Animals
Keywords: dog lovers, golden retriever fans
Good output: ["golden retriever", "dog mom", "pet character account", "doggy life", "retriever life"]

Do not use em dashes anywhere.
Return ONLY the JSON object, no preamble, no code fences.`;

const SCORING_SYSTEM_PROMPT = `You are scoring whether a creator is worth studying for a SpyReels user.

The user's goal: Find creators whose content reaches the SAME AUDIENCE the user is trying to reach. The user wants to study viral content patterns that work on this audience.

You will receive the creator's bio, bio links, Instagram category, discovery source, and optionally one recent caption from a hashtag-scraped post. Use all available signals to judge audience fit.

Score from 0 to 1:
- 1.0 = SHARP MATCH. Creator's content clearly reaches the user's target audience. Could be: another creator in the niche, a business/service targeting the same audience, an educator teaching the same audience. Even if they sell something different, they reach the SAME PEOPLE.
- 0.6 = TANGENTIAL. Audience partially overlaps. Some content reaches the right people but not consistently.
- 0.2 = NOISE. Creator targets a fundamentally different audience.

IMPORTANT EDGE CASES:
- A creator who SELLS THE SAME PRODUCT to the user's target audience IS a sharp match (same audience). Example: another mouthguard brand targeting BJJ competitors = sharp match for a mouthguard brand.
- A creator whose AUDIENCE happens to overlap with the target IS a sharp match even if the creator's content is about a different topic. Example: a perimenopause emotional health creator IS a sharp match for a perimenopause supplement brand because their audiences are the same women.
- Suppliers/B2B services targeting the same buyer audience as the user ARE sharp matches. Example: a restaurant marketing consultant IS a sharp match for a restaurant equipment seller.
- Pure consumers of the target audience's products are NOT a match unless they create content about it consistently.

Return JSON:
{
  "score": 0.0 to 1.0,
  "match_type": "sharp_match" | "tangential" | "noise",
  "reasoning": "1-2 sentences"
}

Do not use em dashes anywhere.
Return ONLY the JSON object, no preamble, no code fences.`;

const SCORING_SYSTEM_PROMPT_BIO_ONLY = `You are scoring whether a creator is worth studying for a SpyReels user.

The user's goal: Find creators whose content reaches the SAME AUDIENCE the user is trying to reach. The user wants to study viral content patterns that work on this audience.

You will receive the creator's bio only (no post captions available). Use the bio text to judge audience fit.

Score from 0 to 1:
- 1.0 = SHARP MATCH. Creator's content clearly reaches the user's target audience.
- 0.6 = TANGENTIAL. Audience partially overlaps but not consistently.
- 0.2 = NOISE. Creator targets a fundamentally different audience.

Return JSON:
{
  "score": 0.0 to 1.0,
  "match_type": "sharp_match" | "tangential" | "noise",
  "reasoning": "1-2 sentences"
}

Do not use em dashes anywhere.
Return ONLY the JSON object, no preamble, no code fences.`;

function getApifyClient(): ApifyClient {
  const apifyToken = process.env.APIFY_API_TOKEN?.trim();
  if (!apifyToken) {
    throw new Error("APIFY_API_TOKEN is not set");
  }
  return new ApifyClient({ token: apifyToken });
}

function getAnthropicClient(): Anthropic {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!anthropicKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey: anthropicKey });
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

function estimateClaudeCostUsd(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * HAIKU_INPUT_USD_PER_M +
    (outputTokens / 1_000_000) * HAIKU_OUTPUT_USD_PER_M
  );
}

async function listAllDatasetItems(
  client: ApifyClient,
  datasetId: string
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const page = await client.dataset(datasetId).listItems({ limit, offset });
    items.push(...(page.items as Record<string, unknown>[]));
    if (page.items.length < limit) break;
    offset += limit;
  }

  return items;
}

async function runApifyActor(
  client: ApifyClient,
  actorId: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const run = await client.actor(actorId).call(input, { waitSecs: APIFY_WAIT_SECS });
  if (!run.defaultDatasetId) {
    throw new Error(`Actor ${actorId} finished without a default dataset`);
  }
  return listAllDatasetItems(client, run.defaultDatasetId);
}

async function callHaikuJson<T>(
  client: Anthropic,
  system: string,
  userMessage: string,
  maxTokens: number
): Promise<{ data: T; costUsd: number }> {
  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: maxTokens,
    temperature: 0.1,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const costUsd = estimateClaudeCostUsd(inputTokens, outputTokens);

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in Anthropic response");
  }

  const data = JSON.parse(stripCodeFences(textBlock.text)) as T;
  return { data, costUsd };
}

async function step1NicheRouting(
  businessDescription: string
): Promise<NicheRoutingStep> {
  const raw = await routeNiche({ businessDescription });
  return {
    niche: raw.primary_niche,
    audienceKeywords: raw.audience.audience_persona_keywords,
    confidence: raw.confidence,
  };
}

async function expandToHashtags(
  client: Anthropic,
  niche: string,
  audienceKeywords: string[]
): Promise<{ hashtags: string[]; costUsd: number }> {
  const userMessage = `Niche: ${niche}
Audience keywords: ${audienceKeywords.join(", ")}

Return 5 to 8 Instagram-native hashtags as JSON.`;

  const { data, costUsd } = await callHaikuJson<{ hashtags: string[] }>(
    client,
    HASHTAG_EXPANSION_PROMPT,
    userMessage,
    500
  );

  const hashtags = (data.hashtags ?? [])
    .map((tag) => tag.replace(/^#/, "").trim().toLowerCase().replace(/\s+/g, ""))
    .filter((tag) => tag.length > 0 && tag.length <= 25)
    .slice(0, 8);

  return { hashtags, costUsd };
}

async function expandToPhrases(
  client: Anthropic,
  niche: string,
  audienceKeywords: string[]
): Promise<{ phrases: string[]; costUsd: number }> {
  const userMessage = `Niche: ${niche}
Audience keywords: ${audienceKeywords.join(", ")}

Return 5 to 8 Instagram bio phrases as JSON.`;

  const { data, costUsd } = await callHaikuJson<{ phrases: string[] }>(
    client,
    PHRASE_EXPANSION_PROMPT,
    userMessage,
    500
  );

  const phrases = (data.phrases ?? [])
    .map((phrase) => phrase.trim().toLowerCase())
    .filter((phrase) => phrase.length > 0 && phrase.length <= 40)
    .slice(0, 8);

  return { phrases, costUsd };
}

async function step3AHashtagScrape(
  client: ApifyClient,
  hashtags: string[]
): Promise<{ candidates: HashtagPostCandidate[]; apifyUsd: number }> {
  const byUsername = new Map<string, HashtagPostCandidate>();
  let totalResults = 0;

  for (const hashtag of hashtags) {
    process.stdout.write(`  [3A] Scraping #${hashtag}... `);
    try {
      const items = await runApifyActor(client, HASHTAG_ACTOR, {
        hashtags: [hashtag],
        resultsLimit: HASHTAG_RESULTS_LIMIT,
        resultsType: "posts",
      });
      totalResults += items.length;
      console.log(`${items.length} posts`);

      for (const item of items) {
        const username = String(
          item.ownerUsername ?? item.username ?? ""
        ).trim();
        if (!username) continue;

        const likes = Number(item.likesCount ?? item.likes ?? 0) || 0;
        const caption = typeof item.caption === "string" ? item.caption : "";
        const key = username.toLowerCase();
        const existing = byUsername.get(key);

        if (!existing || likes > existing.likes) {
          byUsername.set(key, { username, caption, likes, hashtag });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`failed (${message})`);
    }
  }

  const candidates = [...byUsername.values()].sort((a, b) => b.likes - a.likes);
  const apifyUsd = totalResults * APIFY_HASHTAG_USD_PER_RESULT;

  return { candidates, apifyUsd };
}

function extractBioLinks(item: Record<string, unknown>): string[] {
  const links: string[] = [];

  const bioLinksRaw = item.bioLinks;
  if (Array.isArray(bioLinksRaw)) {
    for (const link of bioLinksRaw) {
      if (link && typeof link === "object") {
        const url = (link as Record<string, unknown>).url;
        if (typeof url === "string" && url.trim()) {
          links.push(url.trim());
        }
      }
    }
  }

  const website = item.website;
  if (typeof website === "string" && website.trim()) {
    links.push(website.trim());
  }

  return [...new Set(links)];
}

function profileFromApidojoItem(
  item: Record<string, unknown>,
  source: CandidateSource,
  scrapeCaption: string,
  scrapeLikesScore: number
): DiscoveryProfile | null {
  const username = String(item.username ?? item.ownerUsername ?? "").trim();
  if (!username) return null;

  const categoryRaw = item.category ?? item.businessCategoryName;
  const category =
    typeof categoryRaw === "string" && categoryRaw.trim()
      ? categoryRaw.trim()
      : null;

  return {
    username,
    bio: String(item.biography ?? item.bio ?? ""),
    followerCount: Number(
      item.followerCount ?? item.followersCount ?? item.followers ?? 0
    ),
    followingCount: Number(
      item.followingCount ?? item.followsCount ?? item.following ?? 0
    ),
    postsCount: Number(item.postCount ?? item.postsCount ?? item.posts ?? 0),
    bioLinks: extractBioLinks(item),
    category,
    source,
    scrapeCaption,
    scrapeLikesScore,
  };
}

export function profileFromEnrichedCacheItem(
  item: Record<string, unknown>
): DiscoveryProfile | null {
  return profileFromApidojoItem(item, "keyword", "", 0);
}

async function step3BKeywordSearch(
  client: ApifyClient,
  phrases: string[]
): Promise<{ handles: KeywordHandleCandidate[]; apifyUsd: number }> {
  const handles: KeywordHandleCandidate[] = [];
  const seen = new Set<string>();
  let searchRank = 0;
  let searchCount = 0;

  for (const phrase of phrases) {
    process.stdout.write(`  [3B] Searching "${phrase}"... `);
    try {
      const items = await runApifyActor(client, USER_SCRAPER_ACTOR, {
        keywords: [phrase],
        getFollowers: false,
        getFollowings: false,
        maxItems: KEYWORD_SEARCH_MAX_ITEMS,
      });
      searchCount += 1;
      console.log(`${items.length} handles`);

      for (const item of items) {
        const username = String(item.username ?? item.ownerUsername ?? "").trim();
        if (!username) continue;

        const key = username.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          handles.push({ username, searchRank: searchRank++ });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`failed (${message})`);
    }
  }

  const apifyUsd = searchCount * APIFY_KEYWORD_SEARCH_USD;

  return { handles, apifyUsd };
}

function step3CMergeAndDedupe(
  hashtagCandidates: HashtagPostCandidate[],
  keywordHandles: KeywordHandleCandidate[]
): { profiles: DiscoveryProfile[]; stats: MergeStats } {
  const hashtagByUser = new Map(
    hashtagCandidates.map((c) => [c.username.toLowerCase(), c])
  );
  const keywordByUser = new Map(
    keywordHandles.map((h) => [h.username.toLowerCase(), h])
  );

  const allKeys = new Set([...hashtagByUser.keys(), ...keywordByUser.keys()]);
  const profiles: DiscoveryProfile[] = [];
  let hashtagOnly = 0;
  let keywordOnly = 0;
  let both = 0;

  for (const key of allKeys) {
    const hashtag = hashtagByUser.get(key);
    const keyword = keywordByUser.get(key);

    if (hashtag && keyword) {
      both += 1;
      profiles.push({
        username: hashtag.username,
        bio: "",
        followerCount: 0,
        followingCount: 0,
        postsCount: 0,
        bioLinks: [],
        category: null,
        source: "both",
        scrapeCaption: hashtag.caption,
        scrapeLikesScore: hashtag.likes,
      });
    } else if (hashtag) {
      hashtagOnly += 1;
      profiles.push({
        username: hashtag.username,
        bio: "",
        followerCount: 0,
        followingCount: 0,
        postsCount: 0,
        bioLinks: [],
        category: null,
        source: "hashtag",
        scrapeCaption: hashtag.caption,
        scrapeLikesScore: hashtag.likes,
      });
    } else if (keyword) {
      keywordOnly += 1;
      profiles.push({
        username: keyword.username,
        bio: "",
        followerCount: 0,
        followingCount: 0,
        postsCount: 0,
        bioLinks: [],
        category: null,
        source: "keyword",
        scrapeCaption: "",
        scrapeLikesScore: 0,
        keywordSearchRank: keyword.searchRank,
      });
    }
  }

  return {
    profiles,
    stats: {
      hashtagOnly,
      keywordOnly,
      both,
      totalUnique: profiles.length,
    },
  };
}

function selectForEnrichment(profiles: DiscoveryProfile[]): DiscoveryProfile[] {
  const both = profiles
    .filter((p) => p.source === "both")
    .sort((a, b) => b.scrapeLikesScore - a.scrapeLikesScore);

  const keyword = profiles
    .filter((p) => p.source === "keyword")
    .sort(
      (a, b) => (a.keywordSearchRank ?? 0) - (b.keywordSearchRank ?? 0)
    );

  const hashtag = profiles
    .filter((p) => p.source === "hashtag")
    .sort((a, b) => b.scrapeLikesScore - a.scrapeLikesScore);

  return [...both, ...keyword, ...hashtag].slice(0, MAX_ENRICHMENT_HANDLES);
}

async function step4EnrichAllHandles(
  client: ApifyClient,
  mergedProfiles: DiscoveryProfile[]
): Promise<{
  profiles: DiscoveryProfile[];
  apifyUsd: number;
  attempted: number;
  succeeded: number;
  notFound: number;
}> {
  const toEnrich = selectForEnrichment(mergedProfiles);

  if (toEnrich.length === 0) {
    return { profiles: [], apifyUsd: 0, attempted: 0, succeeded: 0, notFound: 0 };
  }

  const skippedByCap = mergedProfiles.length - toEnrich.length;
  if (skippedByCap > 0) {
    console.log(
      `  Capped enrichment at ${MAX_ENRICHMENT_HANDLES} handles (${skippedByCap} skipped by priority cap)`
    );
  }

  const startUrls = toEnrich.map(
    (p) => `https://www.instagram.com/${p.username}/`
  );

  const items = await runApifyActor(client, USER_SCRAPER_ACTOR, {
    startUrls,
    getFollowers: false,
    getFollowings: false,
    maxItems: 500,
  });

  const enrichedByUser = new Map<string, DiscoveryProfile>();
  for (const item of items) {
    const key = String(item.username ?? item.ownerUsername ?? "")
      .trim()
      .toLowerCase();
    const original = toEnrich.find((p) => p.username.toLowerCase() === key);
    if (!original) continue;

    const enriched = profileFromApidojoItem(
      item,
      original.source,
      original.scrapeCaption,
      original.scrapeLikesScore
    );
    if (enriched) {
      enrichedByUser.set(key, enriched);
    }
  }

  const profiles: DiscoveryProfile[] = [];
  for (const original of toEnrich) {
    const key = original.username.toLowerCase();
    const enriched = enrichedByUser.get(key);
    if (enriched) profiles.push(enriched);
  }

  const succeeded = profiles.length;
  const notFound = toEnrich.length - succeeded;

  const apifyUsd = startUrls.length * APIFY_ENRICHMENT_USD_PER_PROFILE;
  return {
    profiles,
    apifyUsd,
    attempted: toEnrich.length,
    succeeded,
    notFound,
  };
}

function buildBioMatchTerms(
  audienceKeywords: string[],
  phrases: string[]
): string[] {
  const terms = new Set<string>();
  for (const kw of audienceKeywords) {
    const t = kw.trim().toLowerCase();
    if (t) terms.add(t);
  }
  for (const phrase of phrases) {
    const t = phrase.trim().toLowerCase();
    if (t) terms.add(t);
  }
  return [...terms];
}

function bioContainsRelevantTerm(bio: string, terms: string[]): boolean {
  const lowerBio = bio.toLowerCase();
  return terms.some((term) => term.length > 0 && lowerBio.includes(term));
}

function step5HardFilter(
  profiles: DiscoveryProfile[],
  bioMatchTerms: string[]
): { filtered: DiscoveryProfile[]; stats: FilterStats } {
  const filtered: DiscoveryProfile[] = [];
  let bioMatchCount = 0;
  let withoutBioMatchCount = 0;
  let emptyBio = 0;
  let sizeOutOfBand = 0;

  for (const profile of profiles) {
    if (profile.followerCount < MIN_FOLLOWERS) {
      sizeOutOfBand += 1;
      continue;
    }

    if (!profile.bio.trim()) {
      emptyBio += 1;
      continue;
    }

    const matches = bioContainsRelevantTerm(profile.bio, bioMatchTerms);
    const kept: DiscoveryProfile = { ...profile, bioMatch: matches };
    if (matches) {
      bioMatchCount += 1;
    } else {
      withoutBioMatchCount += 1;
    }
    filtered.push(kept);
  }

  console.log(
    `Step 5: ${filtered.length} candidates pass follower band (${bioMatchCount} with bio match, ${withoutBioMatchCount} without)`
  );

  return {
    filtered,
    stats: {
      passed: filtered.length,
      bioMatch: bioMatchCount,
      withoutBioMatch: withoutBioMatchCount,
      emptyBio,
      sizeOutOfBand,
    },
  };
}

function formatBioLinksSummary(links: string[]): string {
  if (links.length === 0) return "none";
  return links
    .map((url) => {
      try {
        const host = new URL(url).hostname.replace(/^www\./, "");
        const path = new URL(url).pathname.replace(/\/$/, "");
        return path && path !== "/" ? `${host}${path}` : host;
      } catch {
        return url;
      }
    })
    .join(", ");
}

function buildScoringUserMessage(
  businessDescription: string,
  audienceKeywords: string[],
  profile: DiscoveryProfile,
  bioOnly = false
): string {
  if (bioOnly) {
    return `User's business description: ${businessDescription}
Target audience keywords: ${audienceKeywords.join(", ")}

Creator profile:
- Handle: @${profile.username}
- Followers: ${profile.followerCount.toLocaleString()}
- Bio: ${profile.bio}
- Bio matches niche keywords: ${profile.bioMatch ? "yes" : "no"}`;
  }

  const recentCaption = profile.scrapeCaption.trim() || "n/a";

  return `User's business description: ${businessDescription}
Target audience keywords: ${audienceKeywords.join(", ")}

Creator profile:
- Handle: @${profile.username}
- Followers: ${profile.followerCount.toLocaleString()}
- Discovered via: ${profile.source}
- Bio: ${profile.bio}
- Bio matches niche keywords: ${profile.bioMatch ? "yes" : "no"}
- Bio links: ${formatBioLinksSummary(profile.bioLinks)}
- Instagram category: ${profile.category ?? "not set"}
- Recent caption (from hashtag-scraped post, if applicable): ${recentCaption.slice(0, 500)}`;
}

async function scoreOneCandidate(
  client: Anthropic,
  businessDescription: string,
  audienceKeywords: string[],
  profile: DiscoveryProfile,
  bioOnly = false
): Promise<{ scored: ScoredCandidate; costUsd: number }> {
  const userMessage = buildScoringUserMessage(
    businessDescription,
    audienceKeywords,
    profile,
    bioOnly
  );
  const systemPrompt = bioOnly
    ? SCORING_SYSTEM_PROMPT_BIO_ONLY
    : SCORING_SYSTEM_PROMPT;

  try {
    const { data, costUsd } = await callHaikuJson<{
      score: number;
      match_type: string;
      reasoning: string;
    }>(client, systemPrompt, userMessage, 300);

    return {
      scored: {
        username: profile.username,
        followerCount: profile.followerCount,
        source: profile.source,
        score: Number(data.score) || 0,
        match_type: data.match_type ?? "noise",
        reasoning: data.reasoning ?? "",
        bio: profile.bio,
      },
      costUsd,
    };
  } catch {
    return {
      scored: {
        username: profile.username,
        followerCount: profile.followerCount,
        source: profile.source,
        score: 0,
        match_type: "noise",
        reasoning: "scoring failed",
        bio: profile.bio,
      },
      costUsd: 0,
    };
  }
}

function sortScoredByTierAndFollowers(
  scored: ScoredCandidate[]
): ScoredCandidate[] {
  const byFollowersDesc = (a: ScoredCandidate, b: ScoredCandidate) =>
    b.followerCount - a.followerCount;

  const tierHigh = scored
    .filter((c) => c.score >= 0.7)
    .sort(byFollowersDesc);
  const tierMid = scored
    .filter((c) => c.score >= 0.6 && c.score < 0.7)
    .sort(byFollowersDesc);
  const tierLow = scored
    .filter((c) => c.score < 0.6)
    .sort((a, b) => b.score - a.score);

  return [...tierHigh, ...tierMid, ...tierLow];
}

async function step6Scoring(
  client: Anthropic,
  businessDescription: string,
  audienceKeywords: string[],
  profiles: DiscoveryProfile[],
  bioOnly = false
): Promise<{ scored: ScoredCandidate[]; costUsd: number }> {
  const scored: ScoredCandidate[] = [];
  let costUsd = 0;

  for (let i = 0; i < profiles.length; i += SCORING_CONCURRENCY) {
    const batch = profiles.slice(i, i + SCORING_CONCURRENCY);
    process.stdout.write(
      `  Scoring ${i + 1}-${Math.min(i + batch.length, profiles.length)} of ${profiles.length}... `
    );

    const batchResults = await Promise.all(
      batch.map((profile) =>
        scoreOneCandidate(
          client,
          businessDescription,
          audienceKeywords,
          profile,
          bioOnly
        )
      )
    );

    for (const result of batchResults) {
      scored.push(result.scored);
      costUsd += result.costUsd;
    }

    console.log("done");
  }

  return { scored: sortScoredByTierAndFollowers(scored), costUsd };
}

function countMatchType(scored: ScoredCandidate[], type: string): number {
  return scored.filter((c) => c.match_type === type).length;
}

function toScoredCreators(scored: ScoredCandidate[]): ScoredCreator[] {
  return scored.slice(0, 10).map((c, index) => ({
    rankPosition: index + 1,
    instagramHandle: c.username,
    followerCount: c.followerCount,
    engagementRate: 0,
    nicheFitScore: c.score,
    whyMatchSummary: c.reasoning,
  }));
}

function toScoredCandidateRaw(scored: ScoredCandidate[]): ScoredCandidateRaw[] {
  return scored.slice(0, 10).map((c) => ({
    username: c.username,
    followerCount: c.followerCount,
    source: c.source,
    score: c.score,
    match_type: c.match_type,
    reasoning: c.reasoning,
    bio: c.bio,
  }));
}

function buildDiagnostics(
  scored: ScoredCandidate[],
  partial: Omit<
    DiscoveryPipelineDiagnostics,
  | "step6ScoredCount"
  | "sharpCount"
  | "tangentialCount"
  | "top10Raw"
  >
): DiscoveryPipelineDiagnostics {
  return {
    ...partial,
    step6ScoredCount: scored.length,
    sharpCount: countMatchType(scored, "sharp_match"),
    tangentialCount: countMatchType(scored, "tangential"),
    top10Raw: toScoredCandidateRaw(scored),
  };
}

export async function runDiscoveryPipeline(
  input: DiscoveryPipelineInput
): Promise<DiscoveryPipelineResult> {
  void input.routedNiche;
  void input.clarification;

  const anthropicClient = getAnthropicClient();

  if (input.fromCache) {
    const { audienceKeywords, bioMatchTerms, enrichedProfiles } = input.fromCache;

    console.log("Step 5: Filtering on follower band...");
    const { filtered, stats: filterStats } = step5HardFilter(
      enrichedProfiles,
      bioMatchTerms
    );

    console.log("Step 6: AI scoring (bio only)...");
    const step6 = await step6Scoring(
      anthropicClient,
      input.description,
      audienceKeywords,
      filtered,
      true
    );
    console.log(`Step 6: ${step6.scored.length} candidates scored`);

    return {
      routedNiche: "(from-cache)",
      routingConfidence: 1,
      creators: toScoredCreators(step6.scored),
      costs: { apifyUsd: 0, claudeUsd: step6.costUsd },
      diagnostics: buildDiagnostics(step6.scored, {
        audienceKeywords,
        step2AHashtags: [],
        step2BPhrases: [],
        step3AHashtagCandidates: 0,
        step3BKeywordCandidates: enrichedProfiles.length,
        step3CMerge: {
          hashtagOnly: 0,
          keywordOnly: enrichedProfiles.length,
          both: 0,
          totalUnique: enrichedProfiles.length,
        },
        step4ProfilesEnriched: 0,
        step5Filter: filterStats,
        apifyHashtagUsd: 0,
        apifyKeywordUsd: 0,
        apifyEnrichmentUsd: 0,
      }),
    };
  }

  const apifyClient = getApifyClient();
  let apifyHashtagUsd = 0;
  let apifyKeywordUsd = 0;
  let apifyEnrichmentUsd = 0;
  let claudeUsd = 0;

  const step1 = await step1NicheRouting(input.description);
  console.log(
    `Step 1: Niche=${step1.niche}, Keywords=[${step1.audienceKeywords.join(", ")}]`
  );

  const step2A = await expandToHashtags(
    anthropicClient,
    step1.niche,
    step1.audienceKeywords
  );
  claudeUsd += step2A.costUsd;
  console.log(`Step 2A Hashtags: [${step2A.hashtags.join(", ")}]`);

  const step2B = await expandToPhrases(
    anthropicClient,
    step1.niche,
    step1.audienceKeywords
  );
  claudeUsd += step2B.costUsd;
  console.log(`Step 2B Phrases: [${step2B.phrases.join(", ")}]`);

  console.log("Step 3A: Hashtag scrape...");
  const step3A = await step3AHashtagScrape(apifyClient, step2A.hashtags);
  apifyHashtagUsd += step3A.apifyUsd;
  console.log(
    `Step 3A: ${step3A.candidates.length} candidates from ${step2A.hashtags.length} hashtags`
  );

  console.log("Step 3B: Keyword bio search...");
  const step3B = await step3BKeywordSearch(apifyClient, step2B.phrases);
  apifyKeywordUsd += step3B.apifyUsd;
  console.log(
    `Step 3B: ${step3B.handles.length} candidates from ${step2B.phrases.length} keyword searches (handles only)`
  );

  const { profiles: merged, stats: mergeStats } = step3CMergeAndDedupe(
    step3A.candidates,
    step3B.handles
  );
  console.log(
    `Step 3C merged: ${mergeStats.hashtagOnly} hashtag-only + ${mergeStats.keywordOnly} keyword-only + ${mergeStats.both} both = ${mergeStats.totalUnique} unique handles`
  );

  console.log("Step 4: Profile enrichment...");
  const step4 = await step4EnrichAllHandles(apifyClient, merged);
  apifyEnrichmentUsd += step4.apifyUsd;
  console.log(
    `Step 4: Enriching all ${step4.attempted} handles (apidojo startUrls)... ${step4.succeeded} succeeded, ${step4.notFound} not found`
  );

  const bioMatchTerms = buildBioMatchTerms(
    step1.audienceKeywords,
    step2B.phrases
  );

  console.log("Step 5: Filtering on follower band...");
  const { filtered, stats: filterStats } = step5HardFilter(
    step4.profiles,
    bioMatchTerms
  );

  console.log(`Step 6: AI scoring ${filtered.length} candidates...`);
  const step6 = await step6Scoring(
    anthropicClient,
    input.description,
    step1.audienceKeywords,
    filtered
  );
  claudeUsd += step6.costUsd;
  console.log(`Step 6: ${step6.scored.length} candidates scored`);

  const apifyUsd = apifyHashtagUsd + apifyKeywordUsd + apifyEnrichmentUsd;

  return {
    routedNiche: step1.niche,
    routingConfidence: step1.confidence,
    creators: toScoredCreators(step6.scored),
    costs: { apifyUsd, claudeUsd },
    diagnostics: buildDiagnostics(step6.scored, {
      audienceKeywords: step1.audienceKeywords,
      step2AHashtags: step2A.hashtags,
      step2BPhrases: step2B.phrases,
      step3AHashtagCandidates: step3A.candidates.length,
      step3BKeywordCandidates: step3B.handles.length,
      step3CMerge: mergeStats,
      step4ProfilesEnriched: step4.succeeded,
      step5Filter: filterStats,
      apifyHashtagUsd,
      apifyKeywordUsd,
      apifyEnrichmentUsd,
    }),
  };
}
