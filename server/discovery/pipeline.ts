/**
 * Discover Creators pipeline (ScrapeCreators hashtag search).
 * Foundation: scripts/test-scrapecreators-discovery.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { routeNiche } from "../ai/prompts/niche-routing";
import { searchHashtagReels } from "../instagram";
import { ensureReelThumbnailOnR2 } from "../reelThumbnailR2";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const TOP_N = 25;
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
  businessDescription: string
): Promise<DiscoveryResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const usdPerCredit =
    Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || DEFAULT_USD_PER_CREDIT;

  let routedNiche = "";
  let hashtags: string[] = [];
  const hashtagFailures: string[] = [];

  console.log("Step 1: Niche routing...");
  try {
    const raw = await routeNiche({ businessDescription });
    routedNiche = raw.primary_niche;
    console.log(
      `  primary=${routedNiche}, confidence=${raw.confidence}, keywords=[${raw.audience.audience_persona_keywords.join(", ")}]`
    );

    console.log("Step 2: Hashtag expansion...");
    try {
      hashtags = await expandToHashtags(
        anthropic,
        routedNiche,
        raw.audience.audience_persona_keywords
      );
      console.log(`  hashtags: ${hashtags.map((h) => `#${h}`).join(", ")}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  hashtag expansion FAILED: ${message}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`  routing FAILED: ${message}`);
  }

  const byCreatorHashtag = new Map<string, ParsedReel>();
  let totalRaw = 0;

  if (hashtags.length === 0) {
    console.log("  skipping ScrapeCreators searches (no hashtags)");
  }

  for (const hashtag of hashtags) {
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

  const allReels = [...byCreatorHashtag.values()];

  // Collapse the same reel surfaced under multiple hashtags (same shortcode,
  // possibly different like/view snapshots). Keep the highest-view copy.
  const byShortcode = new Map<string, ParsedReel>();
  for (const reel of allReels) {
    const existing = byShortcode.get(reel.shortcode);
    if (!existing || reel.views > existing.views) {
      byShortcode.set(reel.shortcode, reel);
    }
  }
  const uniqueReels = [...byShortcode.values()];

  const scored = uniqueReels
    .map(scoreReel)
    .filter((r): r is ScoredReel => r !== null);

  logFilterBreakdown(totalRaw, allReels);

  const tier1Reels = scored
    .filter((reel) => reel.tier === 1)
    .sort((a, b) => b.viralScore - a.viralScore);
  const tier2Reels = scored
    .filter((reel) => reel.tier === 2)
    .sort((a, b) => b.viralScore - a.viralScore);
  const topReels = [...tier1Reels, ...tier2Reels].slice(0, TOP_N);

  console.log(
    `  pipeline total: ${allReels.length} after creator-hashtag dedupe, ${uniqueReels.length} unique reels, tier1=${tier1Reels.length} tier2=${tier2Reels.length} selected=${topReels.length} (tier1=${topReels.filter((r) => r.tier === 1).length} tier2=${topReels.filter((r) => r.tier === 2).length})`
  );

  // Mirror thumbnails to R2 for the displayed reels only (max TOP_N). Deliberate cost tradeoff: we mirror at search time for UI consistency with the scrape grid; revisit to lazy-mirror-on-click if R2 writes become significant.
  const stableThumbs = await mirrorReelThumbnailsBounded(
    topReels.map((reel) => ({
      shortcode: reel.shortcode,
      thumbnailUrl: reel.thumbnailUrl,
    }))
  );

  return {
    businessDescription,
    routedNiche,
    hashtagsUsed: hashtags,
    hashtagFailures,
    viralReels: topReels.map((reel) => ({
      shortcode: reel.shortcode,
      reelUrl: reel.reelUrl,
      thumbnailUrl: stableThumbs.get(reel.shortcode) ?? reel.thumbnailUrl,
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
        profilePicUrl: reel.owner.profilePicUrl,
      },
    })),
    totalCandidatesBeforeFilter: allReels.length,
    totalCandidatesAfterFilter: scored.length,
    costEstimateUsd: hashtags.length * usdPerCredit,
  };
}
