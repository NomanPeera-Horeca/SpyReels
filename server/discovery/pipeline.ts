/**
 * Discover Creators pipeline (ScrapeCreators hashtag search).
 * Foundation: scripts/test-scrapecreators-discovery.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { routeNiche } from "../ai/prompts/niche-routing";
import {
  coerceInstagramTakenAtRaw,
  createDiscoveryScCallTracker,
  runWithDiscoveryScCallTracker,
  scrapeReels,
  searchHashtagReels,
  type DiscoveryScCallTracker,
  type ReelData,
} from "../instagram";
import {
  mirrorProfilePicsBounded,
  mirrorReelThumbnailsBounded,
  mirrorReelVideosBounded,
} from "./mediaMirror";
import { DISCOVERY_REELS_PER_PAGE } from "../../shared/const";
import {
  type ParsedReel,
  type ScoredReel,
  type ViralTier,
  MIN_REACH_MULTIPLIER,
  MIN_VIEWS,
  MIN_VIRAL_SCORE,
  classifyTier,
  computeViralScore,
  passesPrivacyAndFollowers,
  scoreReel,
  scoreReelRelaxed,
} from "./scoring";

export type { ViralTier } from "./scoring";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const TOP_N = 100;
const RELEVANCE_CANDIDATE_LIMIT = 150;
const RELEVANCE_BATCH_SIZE = 15;
const DISCOVERY_MAX_SC_CALLS = 300;
const DEFAULT_USD_PER_CREDIT = 0.002;
const MIN_RELEVANCE_SCORE = 55;
const LANGUAGE_MISMATCH_PENALTY = 35;
const MAX_REELS_PER_CREATOR_PER_WINDOW = 3;

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

/** Haiku batch relevance filter for top discovery candidates. */
const RELEVANCE_SCORING_PROMPT = `You score Instagram Reels for relevance to a user's business discovery search on SpyReels.

Given the user's business description, routed niche label, and a batch of Reels (shortcode, caption, creator username and display name), return a relevance verdict per Reel.

Return ONLY valid JSON in this exact shape:
{
  "reels": [
    { "shortcode": "AbC123", "relevant": true, "score": 85, "languageMismatch": false }
  ]
}

RULES:
1. A reel is relevant ONLY if its topic genuinely matches the SUBJECT of what the user is looking for (what the content is ABOUT), not merely because the creator is also a small business or works in a broad related industry.
2. Judge the reel caption and implied topic against the USER'S BUSINESS INTENT (what they sell, who they serve, and what kind of content they want to emulate).
3. Mark relevant false when the reel topic does not match the search subject, even if the creator is an entrepreneur or small business owner talking about their own unrelated trade.
4. EXAMPLE: For a search like "AI and automation for small business", a reel teaching AI tools, business systems, or automation IS relevant. A reel where a car detailing shop owner, florist, or woodworker talks about their trade is NOT relevant, even though they are a small business.
5. Mark relevant false for clearly off-topic content: burger reviews for restaurant SaaS, gaming for wedding photography coaching, unrelated hobby or trade content for a niche-specific search.
6. score is 0 to 100: how well this reel's topic and angle match what the user is looking for. Score below 55 means weak or tangential fit. Be honest with low scores for borderline content.
7. LANGUAGE (separate from score): Determine the dominant language of the business description and the dominant language of each reel caption. Set languageMismatch true ONLY when the caption is clearly and dominantly in a DIFFERENT language than the business description. Set languageMismatch false when the caption matches the description language, contains meaningful content in that language (mixed or code-switched captions count as match), or is too short, emoji-only, or hashtag-only to tell.
8. Do NOT lower score because of language. Score only topical relevance. languageMismatch is a separate boolean flag.
9. Include languageMismatch (boolean) on every reel entry.
10. Return exactly one entry per input shortcode. Use the exact shortcode strings from the input.
11. Do not use em dashes anywhere.
12. Return ONLY the JSON object, no preamble, no code fences.`;

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
    postedAt: string | null;
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
  scCallCount: number;
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

function readPostedAtFromPost(post: Record<string, unknown>): Date | null {
  return (
    coerceInstagramTakenAtRaw(post.taken_at_timestamp) ??
    coerceInstagramTakenAtRaw(post.taken_at) ??
    coerceInstagramTakenAtRaw(post.timestamp) ??
    coerceInstagramTakenAtRaw(post.device_timestamp) ??
    null
  );
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
    postedAt: reel.postedAt ?? null,
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
    postedAt: readPostedAtFromPost(post),
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

function selectTopScoredReels(
  reels: ParsedReel[],
  opts?: { relaxed?: boolean }
): {
  uniqueReels: ParsedReel[];
  scored: ScoredReel[];
  tier1Reels: ScoredReel[];
  tier2Reels: ScoredReel[];
  candidates: ScoredReel[];
  topReels: ScoredReel[];
} {
  const uniqueReels = dedupeReelsByShortcode(reels);
  const scoreFn = opts?.relaxed ? scoreReelRelaxed : scoreReel;
  const scored = uniqueReels
    .map(scoreFn)
    .filter((r): r is ScoredReel => r !== null);
  const tier1Reels = scored
    .filter((reel) => reel.tier === 1)
    .sort((a, b) => b.viralScore - a.viralScore);
  const tier2Reels = scored
    .filter((reel) => reel.tier === 2)
    .sort((a, b) => b.viralScore - a.viralScore);
  const candidates = [...tier1Reels, ...tier2Reels].slice(
    0,
    RELEVANCE_CANDIDATE_LIMIT
  );
  const topReels = candidates.slice(0, TOP_N);
  return {
    uniqueReels,
    scored,
    tier1Reels,
    tier2Reels,
    candidates,
    topReels,
  };
}

export interface RelevanceVerdict {
  shortcode: string;
  relevant: boolean;
  score: number;
  languageMismatch: boolean;
}

interface RelevanceEntry {
  keep: boolean;
  score: number;
  rawScore: number;
  languageMismatch: boolean;
}

export function effectiveRelevanceScore(verdict: RelevanceVerdict): number {
  const raw = verdict.score;
  if (!verdict.languageMismatch) return raw;
  return Math.max(0, raw - LANGUAGE_MISMATCH_PENALTY);
}

export function shouldKeepRelevanceVerdict(verdict: RelevanceVerdict): RelevanceEntry {
  const effectiveScore = effectiveRelevanceScore(verdict);
  if (verdict.relevant === false) {
    return {
      keep: false,
      score: effectiveScore,
      rawScore: verdict.score,
      languageMismatch: verdict.languageMismatch,
    };
  }
  if (effectiveScore < MIN_RELEVANCE_SCORE) {
    return {
      keep: false,
      score: effectiveScore,
      rawScore: verdict.score,
      languageMismatch: verdict.languageMismatch,
    };
  }
  return {
    keep: true,
    score: effectiveScore,
    rawScore: verdict.score,
    languageMismatch: verdict.languageMismatch,
  };
}

export function failOpenRelevanceEntry(): RelevanceEntry {
  return { keep: true, score: 50, rawScore: 50, languageMismatch: false };
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function scoreRelevanceBatch(
  client: Anthropic,
  businessDescription: string,
  routedNiche: string,
  batch: ScoredReel[]
): Promise<RelevanceVerdict[] | null> {
  const reelLines = batch
    .map((reel) => {
      const caption = reel.caption.trim().slice(0, 280) || "(no caption)";
      return `- shortcode: ${reel.shortcode}\n  username: @${reel.owner.username}\n  name: ${reel.owner.fullName || "(unknown)"}\n  caption: ${caption}`;
    })
    .join("\n\n");

  const userMessage = `Business description:
"""
${businessDescription}
"""

Routed niche: ${routedNiche || "(unknown)"}

Reels to score:
${reelLines}

Return relevance JSON for every shortcode listed above.`;

  const response = await client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    temperature: 0.1,
    system: RELEVANCE_SCORING_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return null;
  }

  const parsed = JSON.parse(stripCodeFences(textBlock.text)) as {
    reels?: Array<{
      shortcode?: string;
      relevant?: boolean;
      score?: number;
      languageMismatch?: boolean;
    }>;
  };

  if (!Array.isArray(parsed.reels)) {
    return null;
  }

  const out: RelevanceVerdict[] = [];
  for (const row of parsed.reels) {
    const shortcode = String(row.shortcode ?? "").trim();
    if (!shortcode) continue;
    const scoreRaw = Number(row.score);
    const score = Number.isFinite(scoreRaw)
      ? Math.min(100, Math.max(0, Math.round(scoreRaw)))
      : 50;
    out.push({
      shortcode,
      relevant: row.relevant !== false,
      score,
      languageMismatch: row.languageMismatch === true,
    });
  }
  return out;
}

function ownerUsernameKey(reel: ScoredReel): string {
  return reel.owner.username.toLowerCase();
}

function pickNextReelForWindow(
  remaining: ScoredReel[],
  windowCounts: Map<string, number>
): ScoredReel | null {
  const eligible = remaining.filter(
    (reel) =>
      (windowCounts.get(ownerUsernameKey(reel)) ?? 0) <
      MAX_REELS_PER_CREATOR_PER_WINDOW
  );
  if (eligible.length === 0) return null;

  const tier1StillUnplaced = remaining.some((reel) => reel.tier === 1);
  const tier1Eligible = eligible.filter((reel) => reel.tier === 1);

  let pool: ScoredReel[];
  if (tier1Eligible.length > 0) {
    pool = tier1Eligible;
  } else if (!tier1StillUnplaced) {
    pool = eligible.filter((reel) => reel.tier === 2);
  } else {
    return null;
  }

  if (pool.length === 0) return null;

  const bestByOwner = new Map<string, ScoredReel>();
  for (const reel of pool) {
    const key = ownerUsernameKey(reel);
    const prev = bestByOwner.get(key);
    if (!prev || reel.viralScore > prev.viralScore) {
      bestByOwner.set(key, reel);
    }
  }

  let best: ScoredReel | null = null;
  let bestIdx = Infinity;
  for (const reel of bestByOwner.values()) {
    const idx = remaining.indexOf(reel);
    if (idx >= 0 && idx < bestIdx) {
      bestIdx = idx;
      best = reel;
    }
  }

  return best;
}

/**
 * Reorder reels into page windows so no creator appears more than
 * MAX_REELS_PER_CREATOR_PER_WINDOW times per DISCOVERY_REELS_PER_PAGE slot block.
 * Deferred reels carry to the next window in original relative order.
 * Tier-1 reels never yield slots to tier-2 while any tier-1 remain unplaced.
 */
export function applyPerCreatorWindowCap(
  ordered: ScoredReel[],
  topN: number = TOP_N
): ScoredReel[] {
  if (ordered.length === 0) return [];

  const remaining = [...ordered];
  const output: ScoredReel[] = [];

  while (remaining.length > 0 && output.length < topN) {
    const windowCounts = new Map<string, number>();
    let slotsFilled = 0;

    while (
      slotsFilled < DISCOVERY_REELS_PER_PAGE &&
      remaining.length > 0 &&
      output.length < topN
    ) {
      const pick = pickNextReelForWindow(remaining, windowCounts);
      if (!pick) break;

      const idx = remaining.indexOf(pick);
      remaining.splice(idx, 1);
      output.push(pick);

      const key = ownerUsernameKey(pick);
      windowCounts.set(key, (windowCounts.get(key) ?? 0) + 1);
      slotsFilled++;
    }
  }

  return output.slice(0, topN);
}

async function applyRelevanceFilter(
  client: Anthropic,
  businessDescription: string,
  routedNiche: string,
  candidates: ScoredReel[],
  onProgress?: (update: DiscoveryProgressUpdate) => void | Promise<void>
): Promise<{ topReels: ScoredReel[]; haikuCalls: number }> {
  if (candidates.length === 0) {
    return { topReels: [], haikuCalls: 0 };
  }

  await safeProgress(onProgress, { phase: "scoring_relevance" });

  const relevanceByShortcode = new Map<string, RelevanceEntry>();
  let haikuCalls = 0;

  try {
    for (const batch of chunkArray(candidates, RELEVANCE_BATCH_SIZE)) {
      let verdicts: RelevanceVerdict[] | null = null;
      try {
        verdicts = await scoreRelevanceBatch(
          client,
          businessDescription,
          routedNiche,
          batch
        );
        haikuCalls++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(
          `[discovery] relevance batch FAILED (${batch.length} reels): ${message}`
        );
      }

      if (!verdicts) {
        for (const reel of batch) {
          if (!relevanceByShortcode.has(reel.shortcode)) {
            relevanceByShortcode.set(reel.shortcode, failOpenRelevanceEntry());
          }
        }
        continue;
      }

      const returned = new Set<string>();
      for (const verdict of verdicts) {
        returned.add(verdict.shortcode);
        relevanceByShortcode.set(
          verdict.shortcode,
          shouldKeepRelevanceVerdict(verdict)
        );
      }

      for (const reel of batch) {
        if (!returned.has(reel.shortcode)) {
          relevanceByShortcode.set(reel.shortcode, failOpenRelevanceEntry());
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[discovery] relevance filter skipped entirely: ${message}`);
    return { topReels: candidates.slice(0, TOP_N), haikuCalls };
  }

  const surviving = candidates.filter(
    (reel) => relevanceByShortcode.get(reel.shortcode)?.keep !== false
  );

  const tier1 = surviving
    .filter((reel) => reel.tier === 1)
    .sort((a, b) => {
      const scoreDiff =
        (relevanceByShortcode.get(b.shortcode)?.score ?? 50) -
        (relevanceByShortcode.get(a.shortcode)?.score ?? 50);
      return scoreDiff !== 0 ? scoreDiff : b.viralScore - a.viralScore;
    });
  const tier2 = surviving
    .filter((reel) => reel.tier === 2)
    .sort((a, b) => {
      const scoreDiff =
        (relevanceByShortcode.get(b.shortcode)?.score ?? 50) -
        (relevanceByShortcode.get(a.shortcode)?.score ?? 50);
      return scoreDiff !== 0 ? scoreDiff : b.viralScore - a.viralScore;
    });

  const dropped = candidates.length - surviving.length;
  const languageMismatchDropped = candidates.filter((reel) => {
    const entry = relevanceByShortcode.get(reel.shortcode);
    return entry?.languageMismatch === true && entry.keep === false;
  }).length;
  console.log(
    `[discovery] relevance filter: ${candidates.length} candidates, ${surviving.length} kept, ${dropped} dropped (minScore=${MIN_RELEVANCE_SCORE}, languageMismatchDropped=${languageMismatchDropped}), ${haikuCalls} Haiku calls`
  );

  const diversified = applyPerCreatorWindowCap([...tier1, ...tier2], TOP_N);
  return { topReels: diversified, haikuCalls };
}

function topReelsToViralOutput(
  topReels: ScoredReel[],
  stableThumbs?: Map<string, string>,
  stableProfilePics?: Map<string, string>,
  stableVideos?: Map<string, string>
): DiscoveryResult["viralReels"] {
  return topReels.map((reel) => {
    const ownerKey = reel.owner.username.toLowerCase();
    const mirroredPic = stableProfilePics?.get(ownerKey) ?? "";
    const profilePicUrl = mirroredPic || reel.owner.profilePicUrl;
    const mirroredVideo = stableVideos?.get(reel.shortcode) ?? "";
    return {
      shortcode: reel.shortcode,
      reelUrl: reel.reelUrl,
      thumbnailUrl: stableThumbs?.get(reel.shortcode) ?? reel.thumbnailUrl,
      videoUrl: mirroredVideo || reel.videoUrl,
      caption: reel.caption,
      views: reel.views,
      likes: reel.likes,
      comments: reel.comments,
      viralScore: reel.viralScore,
      viralTier: reel.viralTier,
      reachMultiplier: reel.reachMultiplier,
      engagementRate: reel.engagementRate,
      tier: reel.tier,
      postedAt: reel.postedAt ? reel.postedAt.toISOString() : null,
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
  stableVideos?: Map<string, string>;
  topReelsOverride?: ScoredReel[];
  relaxed?: boolean;
}): DiscoveryResult {
  const { uniqueReels, scored, topReels: defaultTop } = selectTopScoredReels(
    params.combinedReels,
    { relaxed: params.relaxed === true }
  );
  const topReels = params.topReelsOverride ?? defaultTop;
  return {
    businessDescription: params.businessDescription,
    routedNiche: params.routedNiche,
    hashtagsUsed: params.hashtagsUsed,
    hashtagFailures: params.hashtagFailures,
    viralReels: topReelsToViralOutput(
      topReels,
      params.stableThumbs,
      params.stableProfilePics,
      params.stableVideos
    ),
    totalCandidatesBeforeFilter: params.combinedReels.length,
    totalCandidatesAfterFilter: scored.length,
    costEstimateUsd: params.scCallCount * params.usdPerCredit,
    scCallCount: params.scCallCount,
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

export type RunDiscoveryPipelineOptions = {
  /** Skip R2 thumbnail/video/profile mirroring (use provider CDN URLs). */
  skipMediaMirroring?: boolean;
  /** Hard ScrapeCreators call ceiling for this run (default 300). */
  maxScCalls?: number;
  /** Skip expensive creator profile drilling (hashtag search only). */
  skipProfileDrilling?: boolean;
  /**
   * Stop profile drilling once this many unique scored candidates exist
   * after hashtag + drilled reels (best-effort early stop).
   */
  earlyStopCandidateCount?: number;
};

export async function runDiscoveryPipeline(
  businessDescription: string,
  onProgress?: (update: DiscoveryProgressUpdate) => void | Promise<void>,
  options?: RunDiscoveryPipelineOptions
): Promise<DiscoveryResult> {
  const maxScCalls = Math.max(
    1,
    Math.min(options?.maxScCalls ?? DISCOVERY_MAX_SC_CALLS, DISCOVERY_MAX_SC_CALLS)
  );
  const tracker = createDiscoveryScCallTracker(maxScCalls);

  return runWithDiscoveryScCallTracker(tracker, async () => {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const usdPerCredit =
    Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || DEFAULT_USD_PER_CREDIT;
  const relaxedScoring = options?.skipProfileDrilling === true;

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
      relaxed: relaxedScoring,
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

  const earlyStopAt = options?.earlyStopCandidateCount ?? null;
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

      if (earlyStopAt != null) {
        const scoredSoFar = selectTopScoredReels(
          [...byCreatorHashtag.values()],
          { relaxed: relaxedScoring }
        ).scored;
        if (scoredSoFar.length >= earlyStopAt) {
          console.log(
            `[discovery] hashtag early stop: scored=${scoredSoFar.length} >= ${earlyStopAt} (scCalls=${tracker.count})`
          );
          break;
        }
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
    reelsFound: selectTopScoredReels(hashtagReels, {
      relaxed: relaxedScoring,
    }).topReels.length,
    partial: buildDiscoveryResultFromReels({
      businessDescription,
      routedNiche,
      hashtagsUsed: hashtags,
      hashtagFailures,
      combinedReels: hashtagReels,
      scCallCount: tracker.count,
      usdPerCredit,
      relaxed: relaxedScoring,
    }),
  });

  console.log(
    `Step 3: Profile drilling ${creators.length} creators (6mo reels, concurrency 5, maxSc=${tracker.maxCalls})...`
  );
  let drilledReels: ParsedReel[] = [];
  if (options?.skipProfileDrilling) {
    console.log("  skipProfileDrilling=true — using hashtag reels only");
  } else {
    drilledReels = await drillCreatorsBounded(
      creators,
      tracker,
      async ({ creatorsDrilled, drilledReels: drilledSoFar }) => {
        const combined = [...hashtagReels, ...drilledSoFar];
        const { topReels, scored } = selectTopScoredReels(combined, {
          relaxed: relaxedScoring,
        });
        if (
          earlyStopAt != null &&
          scored.length >= earlyStopAt &&
          tracker.count < tracker.maxCalls
        ) {
          // Exhaust remaining budget intentionally by marking fuse.
          tracker.count = tracker.maxCalls;
          console.log(
            `[discovery] early stop: scored=${scored.length} >= ${earlyStopAt} (scCalls=${tracker.count})`
          );
        }
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
            relaxed: relaxedScoring,
          }),
        });
      }
    );
  }
  console.log(
    `  drilled ${drilledReels.length} reels from profile passes (scCalls=${tracker.count})`
  );

  const allReels = [...hashtagReels, ...drilledReels];

  const { uniqueReels, scored, candidates } = selectTopScoredReels(allReels, {
    relaxed: relaxedScoring,
  });

  logFilterBreakdown(totalRaw, allReels);
  if (relaxedScoring) {
    console.log(
      `  relaxed scoring (hashtag-only): scored=${scored.length} candidates=${candidates.length}`
    );
  }

  const { topReels, haikuCalls: relevanceHaikuCalls } =
    await applyRelevanceFilter(
      anthropic,
      businessDescription,
      routedNiche,
      candidates,
      onProgress
    );

  const tier1Reels = scored.filter((reel) => reel.tier === 1);
  const tier2Reels = scored.filter((reel) => reel.tier === 2);

  console.log(
    `  pipeline total: ${allReels.length} combined reels, ${uniqueReels.length} unique by shortcode, tier1=${tier1Reels.length} tier2=${tier2Reels.length} selected=${topReels.length} (tier1=${topReels.filter((r) => r.tier === 1).length} tier2=${topReels.filter((r) => r.tier === 2).length}), scCalls=${tracker.count}, relevanceHaikuCalls=${relevanceHaikuCalls}`
  );

  // Mirror thumbnails to R2 for the displayed reels only (max TOP_N). Deliberate cost tradeoff: we mirror at search time for UI consistency with the scrape grid; revisit to lazy-mirror-on-click if R2 writes become significant.
  let stableThumbs = new Map<string, string>();
  let stableVideos = new Map<string, string>();
  let stableProfilePics = new Map<string, string>();

  if (!options?.skipMediaMirroring) {
    stableThumbs = await mirrorReelThumbnailsBounded(
      topReels.map((reel) => ({
        shortcode: reel.shortcode,
        thumbnailUrl: reel.thumbnailUrl,
      }))
    );

    stableVideos = await mirrorReelVideosBounded(
      topReels
        .filter((reel) => (reel.videoUrl ?? "").trim().length > 0)
        .map((reel) => ({
          shortcode: reel.shortcode,
          videoUrl: reel.videoUrl,
        }))
    );

    // Mirror profile pics to R2 for unique owners in the result set only.
    const ownersByUsername = new Map<string, ParsedReel["owner"]>();
    for (const reel of topReels) {
      const key = reel.owner.username.toLowerCase();
      if (!ownersByUsername.has(key)) {
        ownersByUsername.set(key, reel.owner);
      }
    }
    stableProfilePics = await mirrorProfilePicsBounded(
      [...ownersByUsername.values()].map((owner) => ({
        username: owner.username,
        profilePicUrl: owner.profilePicUrl,
      }))
    );
  }

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
    stableVideos,
    topReelsOverride: topReels,
    relaxed: relaxedScoring,
  });
  });
}
