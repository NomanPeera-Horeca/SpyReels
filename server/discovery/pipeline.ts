/**
 * Discover Creators pipeline (ScrapeCreators hashtag search).
 * Foundation: scripts/test-scrapecreators-discovery.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { routeNiche } from "../ai/prompts/niche-routing";
import {
  createDiscoveryScCallTracker,
  runWithDiscoveryScCallTracker,
  scrapeReels,
  searchHashtagReels,
  type DiscoveryScCallTracker,
  type ReelData,
} from "../instagram";
import { ensureProfilePicOnR2 } from "../profilePicR2";
import { ensureReelThumbnailOnR2 } from "../reelThumbnailR2";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const TOP_N = 100;
const DISCOVERY_MAX_SC_CALLS = 300;
const DEFAULT_USD_PER_CREDIT = 0.002;
const MIN_VIEWS = 5_000;
const MIN_REACH_MULTIPLIER = 3;
const MIN_VIRAL_SCORE = 1;
const TIER2_MIN_VIEWS = 1_000;
const TIER2_MIN_REACH_MULTIPLIER = 1.5;

/** Same prompt as scripts/test-scrapecreators-discovery.ts */
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

/** Second-round Haiku prompt: broader/adjacent tags, no overlap with round one. */
const HASHTAG_WIDEN_EXPANSION_PROMPT = `You generate Instagram-native hashtags for creator discovery on SpyReels.

Given a niche label, audience persona keywords, optional secondary niches and content angles, return 5 to 8 BROADER or ADJACENT hashtags that still surface relevant creators but cast a wider net than the first hashtag set.

Return ONLY valid JSON in this exact shape:
{
  "hashtags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

RULES:
- Lowercase only, no # prefix, no spaces, no punctuation except letters and numbers
- Tags must look like real Instagram hashtags creators would actually tag
- BROADEN the niche: adjacent subcultures, parent categories, and common community tags
- Do NOT repeat or lightly rephrase any hashtag listed in "Avoid these tags"
- Avoid generic hashtags like sport, fitness, business, love, instagood
- Avoid overly long hashtags (keep under 25 characters)

Do not use em dashes anywhere.
Return ONLY the JSON object, no preamble, no code fences.`;

export type ViralTier = "Trending" | "Healthy" | "Strong" | "Viral" | "Explosive";

/** Legacy shape for discovery DB persistence (Apify era). */
export interface ScoredCreator {
  rankPosition: number;
  instagramHandle: string;
  followerCount: number;
  engagementRate: number;
  nicheFitScore: number;
  whyMatchSummary: string;
}

export interface DiscoveryResult {
  businessDescription: string;
  routedNiche: string;
  hashtagsUsed: string[];
  hashtagFailures: string[];
  viralReels: Array<{
    shortcode: string;
    reelUrl: string;
    thumbnailUrl: string;
    videoUrl: string;
    caption: string;
    views: number;
    likes: number;
    comments: number;
    viralScore: number;
    viralTier: ViralTier;
    reachMultiplier: number;
    engagementRate: number;
    tier: 1 | 2;
    owner: {
      username: string;
      fullName: string;
      followers: number;
      isVerified: boolean;
      biography: string;
      profilePicUrl: string;
    };
  }>;
  totalCandidatesBeforeFilter: number;
  totalCandidatesAfterFilter: number;
  costEstimateUsd: number;
}

export type DiscoveryProgressUpdate = {
  phase: string;
  creatorsTotal?: number;
  creatorsDrilled?: number;
  reelsFound?: number;
  partial?: DiscoveryResult;
};

interface HashtagSearchResult {
  hashtag: string;
  success: boolean;
  httpStatus: number | null;
  postCount: number;
  uniqueCreatorsAfterDedupe: number;
  error: string | null;
  rawResponse: unknown;
}

interface ParsedReel {
  shortcode: string;
  caption: string;
  views: number;
  likes: number;
  comments: number;
  videoUrl: string;
  thumbnailUrl: string;
  owner: {
    username: string;
    fullName: string;
    followers: number;
    isVerified: boolean;
    isPrivate: boolean;
    biography: string;
    profilePicUrl: string;
  };
}

interface ScoredReel extends ParsedReel {
  viralScore: number;
  viralTier: ViralTier;
  reachMultiplier: number;
  engagementRate: number;
  reelUrl: string;
  tier: 1 | 2;
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

async function expandToHashtagsWider(
  client: Anthropic,
  niche: string,
  audienceKeywords: string[],
  avoidTags: string[],
  secondaryNiches: string[],
  contentAngles: string[]
): Promise<string[]> {
  const secondaryLine =
    secondaryNiches.length > 0
      ? `Secondary niches: ${secondaryNiches.join(", ")}\n`
      : "";
  const anglesLine =
    contentAngles.length > 0
      ? `Content angles: ${contentAngles.join("; ")}\n`
      : "";
  const userMessage = `Niche: ${niche}
Audience keywords: ${audienceKeywords.join(", ")}
${secondaryLine}${anglesLine}Avoid these tags (do not overlap): ${avoidTags.join(", ")}

Return 5 to 8 broader Instagram-native hashtags as JSON.`;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 500,
    temperature: 0.15,
    system: HASHTAG_WIDEN_EXPANSION_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text block in widen hashtag expansion response");
  }

  const parsed = JSON.parse(stripCodeFences(textBlock.text)) as {
    hashtags?: string[];
  };

  const avoid = new Set(avoidTags.map((t) => t.toLowerCase()));
  return (parsed.hashtags ?? [])
    .map((tag) => tag.replace(/^#/, "").trim().toLowerCase().replace(/\s+/g, ""))
    .filter(
      (tag) =>
        tag.length > 0 && tag.length <= 25 && !avoid.has(tag.toLowerCase())
    )
    .slice(0, 8);
}

function dedupeHashtagList(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const clean = tag.replace(/^#/, "").trim().toLowerCase().replace(/\s+/g, "");
    if (clean.length > 0 && clean.length <= 25 && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

function reelDataToParsedReel(
  reel: ReelData,
  owner: ParsedReel["owner"]
): ParsedReel {
  return {
    shortcode: reel.shortcode,
    caption: reel.caption,
    views: reel.viewCount,
    likes: reel.likeCount,
    comments: reel.commentCount,
    videoUrl: reel.videoUrl,
    thumbnailUrl: reel.thumbnailUrl,
    owner: {
      username: owner.username,
      fullName: owner.fullName,
      followers: owner.followers,
      isVerified: owner.isVerified,
      isPrivate: owner.isPrivate,
      biography: owner.biography,
      profilePicUrl: owner.profilePicUrl,
    },
  };
}

function collectUniqueCreators(
  reels: Iterable<ParsedReel>
): Map<string, ParsedReel["owner"]> {
  const byUsername = new Map<string, ParsedReel["owner"]>();
  for (const reel of reels) {
    const key = reel.owner.username.toLowerCase();
    const existing = byUsername.get(key);
    if (!existing || reel.owner.followers > existing.followers) {
      byUsername.set(key, reel.owner);
    }
  }
  return byUsername;
}

async function drillCreatorsBounded(
  creators: ParsedReel["owner"][],
  tracker: DiscoveryScCallTracker,
  onCreatorDone?: (ctx: {
    creatorsDrilled: number;
    drilledReels: ParsedReel[];
  }) => void | Promise<void>
): Promise<ParsedReel[]> {
  if (creators.length === 0) return [];

  const drilled: ParsedReel[] = [];
  let next = 0;
  let creatorsDrilled = 0;
  const concurrency = 5;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, creators.length) }, async () => {
      while (true) {
        if (tracker.count >= tracker.maxCalls) break;

        const i = next++;
        if (i >= creators.length) break;

        const creator = creators[i]!;

        try {
          const scraped = await scrapeReels(
            creator.username,
            180,
            undefined,
            { maxReels: 500, timeoutMs: 60_000 }
          );

          const owner: ParsedReel["owner"] = {
            username: creator.username,
            fullName: creator.fullName,
            followers: scraped.followerCount || creator.followers,
            isVerified: creator.isVerified,
            isPrivate: false,
            biography: creator.biography,
            profilePicUrl: scraped.profilePicUrl || creator.profilePicUrl,
          };

          for (const reel of scraped.reels) {
            drilled.push(reelDataToParsedReel(reel, owner));
          }

          console.log(
            `[discovery] drilled @${creator.username}: ${scraped.reels.length} reels (6mo window)`
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(
            `[discovery] profile drill FAILED @${creator.username}: ${message}`
          );
        }

        creatorsDrilled++;
        if (onCreatorDone) {
          try {
            await onCreatorDone({
              creatorsDrilled,
              drilledReels: [...drilled],
            });
          } catch {
            // best-effort progress reporting
          }
        }
      }
    })
  );

  return drilled;
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

function readCaption(post: Record<string, unknown>): string {
  const cap = post.caption;
  if (typeof cap === "string") return cap;
  if (cap && typeof cap === "object") {
    const text = (cap as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  return "";
}

function reelFromPost(item: unknown): ParsedReel | null {
  if (!item || typeof item !== "object") return null;
  const post = item as Record<string, unknown>;
  const ownerRaw = (post.owner ?? post.user ?? post) as Record<string, unknown>;

  const username = String(
    ownerRaw.username ?? ownerRaw.user_name ?? post.ownerUsername ?? ""
  ).trim();
  if (!username) return null;

  const shortcode = String(post.code ?? post.shortcode ?? "").trim();
  if (!shortcode) return null;

  const views = Number(
    post.video_play_count ??
      post.play_count ??
      post.view_count ??
      post.video_view_count ??
      0
  );
  const likes = Number(post.like_count ?? post.likes ?? 0);
  const comments = Number(post.comment_count ?? post.comments ?? 0);

  const imageVersions = post.image_versions2 as Record<string, unknown> | undefined;
  const candidates = imageVersions?.candidates as Array<{ url?: string }> | undefined;
  const thumbFromCandidates = candidates?.[0]?.url ?? "";

  const thumbnailUrl = String(
    post.thumbnail_url ??
      post.thumbnail_src ??
      thumbFromCandidates ??
      post.display_url ??
      ""
  ).trim();

  const videoUrl = String(
    post.video_url ??
      (post.video_versions as Array<{ url?: string }> | undefined)?.[0]?.url ??
      ""
  ).trim();

  return {
    shortcode,
    caption: readCaption(post),
    views,
    likes,
    comments,
    videoUrl,
    thumbnailUrl,
    owner: {
      username,
      fullName: String(ownerRaw.full_name ?? ownerRaw.fullName ?? "").trim(),
      followers: readFollowerCount(ownerRaw),
      isVerified: readIsVerified(ownerRaw),
      isPrivate: readIsPrivate(ownerRaw),
      biography: String(ownerRaw.biography ?? ownerRaw.bio ?? "").trim(),
      profilePicUrl: String(
        ownerRaw.profile_pic_url ?? ownerRaw.profilePicUrl ?? ""
      ).trim(),
    },
  };
}

function viralTierForScore(score: number): ViralTier {
  if (score >= 500) return "Explosive";
  if (score >= 100) return "Viral";
  if (score >= 25) return "Strong";
  if (score >= 5) return "Healthy";
  return "Trending";
}

function computeViralScore(reel: ParsedReel): number {
  const reachMultiplier = reel.views / reel.owner.followers;
  const engagementRate = (reel.likes + reel.comments) / reel.views;
  return reachMultiplier * engagementRate * 100;
}

function passesPrivacyAndFollowers(reel: ParsedReel): boolean {
  return !reel.owner.isPrivate && reel.owner.followers > 0;
}

function passesTier1Thresholds(reel: ParsedReel): boolean {
  const reach = reel.views / reel.owner.followers;
  return (
    reach >= MIN_REACH_MULTIPLIER &&
    reel.views >= MIN_VIEWS &&
    computeViralScore(reel) >= MIN_VIRAL_SCORE
  );
}

function passesTier2Thresholds(reel: ParsedReel): boolean {
  const reach = reel.views / reel.owner.followers;
  return reach >= TIER2_MIN_REACH_MULTIPLIER && reel.views >= TIER2_MIN_VIEWS;
}

function classifyTier(reel: ParsedReel): 1 | 2 | null {
  if (!passesPrivacyAndFollowers(reel)) return null;
  if (passesTier1Thresholds(reel)) return 1;
  if (passesTier2Thresholds(reel)) return 2;
  return null;
}

function scoreReel(reel: ParsedReel): ScoredReel | null {
  const tier = classifyTier(reel);
  if (tier === null) return null;

  const reachMultiplier = reel.views / reel.owner.followers;
  const engagementRate = (reel.likes + reel.comments) / reel.views;
  const viralScore = reachMultiplier * engagementRate * 100;

  return {
    ...reel,
    tier,
    reachMultiplier,
    engagementRate,
    viralScore,
    viralTier: viralTierForScore(viralScore),
    reelUrl: `https://www.instagram.com/reel/${reel.shortcode}/`,
  };
}

async function safeProgress(
  onProgress:
    | ((update: DiscoveryProgressUpdate) => void | Promise<void>)
    | undefined,
  update: DiscoveryProgressUpdate
): Promise<void> {
  if (!onProgress) return;
  try {
    await onProgress(update);
  } catch {
    // best-effort: progress failures must not break the pipeline
  }
}

function dedupeReelsByShortcode(reels: ParsedReel[]): ParsedReel[] {
  const byShortcode = new Map<string, ParsedReel>();
  for (const reel of reels) {
    const existing = byShortcode.get(reel.shortcode);
    if (!existing || reel.views > existing.views) {
      byShortcode.set(reel.shortcode, reel);
    }
  }
  return [...byShortcode.values()];
}

function selectTopScoredReels(reels: ParsedReel[]): {
  uniqueReels: ParsedReel[];
  scored: ScoredReel[];
  topReels: ScoredReel[];
} {
  const uniqueReels = dedupeReelsByShortcode(reels);
  const scored = uniqueReels
    .map(scoreReel)
    .filter((r): r is ScoredReel => r !== null);
  const tier1Reels = scored
    .filter((reel) => reel.tier === 1)
    .sort((a, b) => b.viralScore - a.viralScore);
  const tier2Reels = scored
    .filter((reel) => reel.tier === 2)
    .sort((a, b) => b.viralScore - a.viralScore);
  const topReels = [...tier1Reels, ...tier2Reels].slice(0, TOP_N);
  return { uniqueReels, scored, topReels };
}

function topReelsToViralOutput(
  topReels: ScoredReel[],
  stableThumbs?: Map<string, string>,
  stableProfilePics?: Map<string, string>
): DiscoveryResult["viralReels"] {
  return topReels.map((reel) => {
    const ownerKey = reel.owner.username.toLowerCase();
    const mirroredPic = stableProfilePics?.get(ownerKey) ?? "";
    const profilePicUrl = mirroredPic || reel.owner.profilePicUrl;
    return {
      shortcode: reel.shortcode,
      reelUrl: reel.reelUrl,
      thumbnailUrl: stableThumbs?.get(reel.shortcode) ?? reel.thumbnailUrl,
      videoUrl: reel.videoUrl,
      caption: reel.caption,
      views: reel.views,
      likes: reel.likes,
      comments: reel.comments,
      viralScore: reel.viralScore,
      viralTier: reel.viralTier,
      reachMultiplier: reel.reachMultiplier,
      engagementRate: reel.engagementRate,
      tier: reel.tier,
      owner: {
        username: reel.owner.username,
        fullName: reel.owner.fullName,
        followers: reel.owner.followers,
        isVerified: reel.owner.isVerified,
        biography: reel.owner.biography,
        profilePicUrl,
      },
    };
  });
}

function buildDiscoveryResultFromReels(params: {
  businessDescription: string;
  routedNiche: string;
  hashtagsUsed: string[];
  hashtagFailures: string[];
  combinedReels: ParsedReel[];
  scCallCount: number;
  usdPerCredit: number;
  stableThumbs?: Map<string, string>;
  stableProfilePics?: Map<string, string>;
}): DiscoveryResult {
  const { uniqueReels, scored, topReels } = selectTopScoredReels(
    params.combinedReels
  );
  return {
    businessDescription: params.businessDescription,
    routedNiche: params.routedNiche,
    hashtagsUsed: params.hashtagsUsed,
    hashtagFailures: params.hashtagFailures,
    viralReels: topReelsToViralOutput(
      topReels,
      params.stableThumbs,
      params.stableProfilePics
    ),
    totalCandidatesBeforeFilter: params.combinedReels.length,
    totalCandidatesAfterFilter: scored.length,
    costEstimateUsd: params.scCallCount * params.usdPerCredit,
  };
}

function logFilterBreakdown(totalRaw: number, allReels: ParsedReel[]): void {
  const afterDedupe = allReels.length;
  const privacyPass = allReels.filter(passesPrivacyAndFollowers);
  const afterPrivacyFilter = privacyPass.length;
  const reachPass = privacyPass.filter(
    (reel) => reel.views / reel.owner.followers >= MIN_REACH_MULTIPLIER
  );
  const afterReachFilter = reachPass.length;
  const viewPass = reachPass.filter((reel) => reel.views >= MIN_VIEWS);
  const afterViewFilter = viewPass.length;
  const afterScoreFilter = viewPass.filter(
    (reel) => computeViralScore(reel) >= MIN_VIRAL_SCORE
  ).length;
  const tier1Count = privacyPass.filter((reel) => classifyTier(reel) === 1).length;
  const tier2Count = privacyPass.filter((reel) => classifyTier(reel) === 2).length;

  console.log(
    `  pipeline filter breakdown: ${totalRaw} total, ${afterDedupe} after dedupe, ${afterPrivacyFilter} after privacy/follower filter, ${afterReachFilter} after reach>=3, ${afterViewFilter} after views>=5000, ${afterScoreFilter} after viralScore>=1, tier1=${tier1Count} tier2=${tier2Count}`
  );
}

async function searchHashtag(hashtag: string): Promise<HashtagSearchResult> {
  const cleanTag = hashtag.replace(/^#/, "").trim();
  const api = await searchHashtagReels(cleanTag);

  if (!api.success) {
    return {
      hashtag: cleanTag,
      success: false,
      httpStatus: api.httpStatus,
      postCount: 0,
      uniqueCreatorsAfterDedupe: 0,
      error: api.error,
      rawResponse: api.data,
    };
  }

  const posts = extractPosts(api.data);
  const seen = new Set<string>();
  for (const post of posts) {
    const reel = reelFromPost(post);
    if (reel) seen.add(reel.owner.username.toLowerCase());
  }

  return {
    hashtag: cleanTag,
    success: true,
    httpStatus: api.httpStatus,
    postCount: posts.length,
    uniqueCreatorsAfterDedupe: seen.size,
    error: null,
    rawResponse: api.data,
  };
}

/** Upload reel thumbnails to R2 with bounded concurrency (mirrors scrape job). */
async function mirrorReelThumbnailsBounded(
  items: Array<{ shortcode: string; thumbnailUrl: string }>,
  concurrency = 5
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        const item = items[i]!;
        const stable = await ensureReelThumbnailOnR2(
          item.shortcode,
          item.thumbnailUrl ?? ""
        );
        out.set(item.shortcode, stable);
      }
    })
  );
  return out;
}

/** Mirror profile avatars to R2 with bounded concurrency (mirrors scrape job). */
async function mirrorProfilePicsBounded(
  items: Array<{ username: string; profilePicUrl: string }>,
  concurrency = 5
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        const item = items[i]!;
        const stable = await ensureProfilePicOnR2(
          item.username,
          item.profilePicUrl ?? ""
        );
        out.set(item.username.toLowerCase(), stable);
      }
    })
  );
  return out;
}

/** Dedupe: keep highest-view reel per creator-and-hashtag combo. */
function mergeReelsFromSearch(
  byCreatorHashtag: Map<string, ParsedReel>,
  search: HashtagSearchResult
): void {
  if (!search.success || !search.rawResponse) return;
  const posts = extractPosts(search.rawResponse);

  for (const post of posts) {
    const reel = reelFromPost(post);
    if (!reel) continue;

    const key = `${reel.owner.username.toLowerCase()}:${search.hashtag}`;
    const existing = byCreatorHashtag.get(key);
    if (!existing || reel.views > existing.views) {
      byCreatorHashtag.set(key, reel);
    }
  }
}

export async function runDiscoveryPipeline(
  businessDescription: string,
  onProgress?: (update: DiscoveryProgressUpdate) => void | Promise<void>
): Promise<DiscoveryResult> {
  const tracker = createDiscoveryScCallTracker(DISCOVERY_MAX_SC_CALLS);

  return runWithDiscoveryScCallTracker(tracker, async () => {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const usdPerCredit =
    Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || DEFAULT_USD_PER_CREDIT;

  let routedNiche = "";
  let narrowHashtags: string[] = [];
  let wideHashtags: string[] = [];
  let hashtags: string[] = [];
  const hashtagFailures: string[] = [];

  const emitPartial = async (
    phase: string,
    combinedReels: ParsedReel[],
    extra?: Pick<
      DiscoveryProgressUpdate,
      "creatorsTotal" | "creatorsDrilled" | "reelsFound"
    >
  ) => {
    const partial = buildDiscoveryResultFromReels({
      businessDescription,
      routedNiche,
      hashtagsUsed: hashtags,
      hashtagFailures,
      combinedReels,
      scCallCount: tracker.count,
      usdPerCredit,
    });
    await safeProgress(onProgress, {
      phase,
      reelsFound: extra?.reelsFound ?? partial.viralReels.length,
      creatorsTotal: extra?.creatorsTotal,
      creatorsDrilled: extra?.creatorsDrilled,
      partial,
    });
  };

  console.log("Step 1: Niche routing...");
  try {
    const raw = await routeNiche({ businessDescription });
    routedNiche = raw.primary_niche;
    console.log(
      `  primary=${routedNiche}, confidence=${raw.confidence}, keywords=[${raw.audience.audience_persona_keywords.join(", ")}]`
    );

    console.log("Step 2: Hashtag expansion (narrow)...");
    try {
      narrowHashtags = await expandToHashtags(
        anthropic,
        routedNiche,
        raw.audience.audience_persona_keywords
      );
      console.log(
        `  narrow hashtags: ${narrowHashtags.map((h) => `#${h}`).join(", ")}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  narrow hashtag expansion FAILED: ${message}`);
    }

    console.log("Step 2b: Hashtag expansion (widen)...");
    try {
      wideHashtags = await expandToHashtagsWider(
        anthropic,
        routedNiche,
        raw.audience.audience_persona_keywords,
        narrowHashtags,
        raw.secondary_niches ?? [],
        raw.content_angles ?? []
      );
      console.log(
        `  wide hashtags: ${wideHashtags.map((h) => `#${h}`).join(", ")}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  widen hashtag expansion FAILED: ${message}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  routing FAILED: ${message}`);
  }

  hashtags = dedupeHashtagList([...narrowHashtags, ...wideHashtags]);

  const byCreatorHashtag = new Map<string, ParsedReel>();
  let totalRaw = 0;

  if (hashtags.length === 0) {
    console.log("  skipping ScrapeCreators searches (no hashtags)");
  }

  for (const hashtag of hashtags) {
    if (tracker.count >= tracker.maxCalls) break;

    try {
      const result = await searchHashtag(hashtag);
      if (result.success) {
        totalRaw += result.postCount;
      }
      mergeReelsFromSearch(byCreatorHashtag, result);

      if (result.success) {
        console.log(
          `[discovery] hashtag #${hashtag} returned ${result.postCount} posts, ${result.uniqueCreatorsAfterDedupe} unique creators after dedupe`
        );
      } else {
        console.log(`[discovery] hashtag #${hashtag} FAILED: ${result.error}`);
        hashtagFailures.push(hashtag);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`[discovery] hashtag #${hashtag} FAILED: ${message}`);
      hashtagFailures.push(hashtag);
    }
  }

  const hashtagReels = [...byCreatorHashtag.values()];

  await emitPartial("hashtags", hashtagReels);

  const creators = [...collectUniqueCreators(hashtagReels).values()];

  await safeProgress(onProgress, {
    phase: "drilling",
    creatorsTotal: creators.length,
    creatorsDrilled: 0,
    reelsFound: selectTopScoredReels(hashtagReels).topReels.length,
    partial: buildDiscoveryResultFromReels({
      businessDescription,
      routedNiche,
      hashtagsUsed: hashtags,
      hashtagFailures,
      combinedReels: hashtagReels,
      scCallCount: tracker.count,
      usdPerCredit,
    }),
  });

  console.log(
    `Step 3: Profile drilling ${creators.length} creators (6mo reels, concurrency 5)...`
  );
  const drilledReels = await drillCreatorsBounded(
    creators,
    tracker,
    async ({ creatorsDrilled, drilledReels: drilledSoFar }) => {
      const combined = [...hashtagReels, ...drilledSoFar];
      const { topReels } = selectTopScoredReels(combined);
      await safeProgress(onProgress, {
        phase: "drilling",
        creatorsTotal: creators.length,
        creatorsDrilled,
        reelsFound: topReels.length,
        partial: buildDiscoveryResultFromReels({
          businessDescription,
          routedNiche,
          hashtagsUsed: hashtags,
          hashtagFailures,
          combinedReels: combined,
          scCallCount: tracker.count,
          usdPerCredit,
        }),
      });
    }
  );
  console.log(
    `  drilled ${drilledReels.length} reels from profile passes (scCalls=${tracker.count})`
  );

  const allReels = [...hashtagReels, ...drilledReels];

  const { uniqueReels, scored, topReels } = selectTopScoredReels(allReels);

  logFilterBreakdown(totalRaw, allReels);

  const tier1Reels = scored.filter((reel) => reel.tier === 1);
  const tier2Reels = scored.filter((reel) => reel.tier === 2);

  console.log(
    `  pipeline total: ${allReels.length} combined reels, ${uniqueReels.length} unique by shortcode, tier1=${tier1Reels.length} tier2=${tier2Reels.length} selected=${topReels.length} (tier1=${topReels.filter((r) => r.tier === 1).length} tier2=${topReels.filter((r) => r.tier === 2).length}), scCalls=${tracker.count}`
  );

  // Mirror thumbnails to R2 for the displayed reels only (max TOP_N). Deliberate cost tradeoff: we mirror at search time for UI consistency with the scrape grid; revisit to lazy-mirror-on-click if R2 writes become significant.
  const stableThumbs = await mirrorReelThumbnailsBounded(
    topReels.map((reel) => ({
      shortcode: reel.shortcode,
      thumbnailUrl: reel.thumbnailUrl,
    }))
  );

  // Mirror profile pics to R2 for unique owners in the result set only. Deliberate cost tradeoff: stable avatars in the sidebar at search time; revisit lazy-mirror if R2 writes become significant.
  const ownersByUsername = new Map<string, ParsedReel["owner"]>();
  for (const reel of topReels) {
    const key = reel.owner.username.toLowerCase();
    if (!ownersByUsername.has(key)) {
      ownersByUsername.set(key, reel.owner);
    }
  }
  const stableProfilePics = await mirrorProfilePicsBounded(
    [...ownersByUsername.values()].map((owner) => ({
      username: owner.username,
      profilePicUrl: owner.profilePicUrl,
    }))
  );

  return buildDiscoveryResultFromReels({
    businessDescription,
    routedNiche,
    hashtagsUsed: hashtags,
    hashtagFailures,
    combinedReels: allReels,
    scCallCount: tracker.count,
    usdPerCredit,
    stableThumbs,
    stableProfilePics,
  });
  });
}
