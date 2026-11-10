/** Shared Viral Posts types (backend + frontend). */

export type ViralTrendStatus =
  | "breaking-out"
  | "rising-fast"
  | "proven-format"
  | "saturated"
  | "unknown";

export type ViralPostPlatform = "instagram" | "tiktok" | "youtube";

/**
 * Supported Viral Posts discovery platforms. YouTube remains opt-in through
 * VIRAL_POSTS_YOUTUBE_ENABLED so production can roll it back independently.
 */
export const VIRAL_POSTS_V1_PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
export type ViralPostsV1Platform = (typeof VIRAL_POSTS_V1_PLATFORMS)[number];
export const VIRAL_POSTS_V1_DEFAULT_PLATFORM: ViralPostsV1Platform = "instagram";

export function isViralPostsV1Platform(
  platform: string | null | undefined
): platform is ViralPostsV1Platform {
  const clean = (platform || "").trim().toLowerCase();
  return (VIRAL_POSTS_V1_PLATFORMS as readonly string[]).includes(clean);
}

/** Map stale youtube (or unknown) Viral Posts platform state to the V1 default. */
export function normalizeViralPostsV1Platform(
  platform: string | null | undefined
): ViralPostsV1Platform {
  const clean = (platform || "").trim().toLowerCase();
  if (clean === "tiktok") return "tiktok";
  if (clean === "youtube") return "youtube";
  return VIRAL_POSTS_V1_DEFAULT_PLATFORM;
}

/** Preserve supported Explore filters; server-side feature flags still govern supply. */
export function normalizeViralPostsExplorePlatforms(platforms: {
  instagram: boolean;
  tiktok: boolean;
  youtube: boolean;
}): { instagram: boolean; tiktok: boolean; youtube: boolean } {
  return { ...platforms };
}

export type ViralFeedbackType =
  | "more_like_this"
  | "not_relevant"
  | "dismissed";

export type ViralMediaStatus =
  | "pending"
  | "mirrored"
  | "source_fallback"
  | "failed";

export type ViralPost = {
  id: string;
  sourceId: string;
  platform: ViralPostPlatform;

  creatorId?: string | null;
  creatorName: string;
  creatorHandle?: string | null;
  creatorAvatarUrl?: string | null;
  creatorFollowers?: number | null;

  sourceUrl: string;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  /**
   * Durable `reels.id` for IG/TikTok inline playback (R2 refresh path).
   * Null for YouTube (link-out only) and when not yet mirrored.
   */
  reelId?: number | null;
  /** How the thumbnail was resolved for this candidate. */
  mediaStatus?: ViralMediaStatus | null;

  caption?: string | null;
  transcript?: string | null;
  hook?: string | null;
  hashtags?: string[];

  publishedAt?: string | null;
  ageHours?: number | null;

  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;

  reachMultiplier?: number | null;
  engagementRate?: number | null;
  viewsPerHour?: number | null;

  trendStatus: ViralTrendStatus;

  contentPillar?: string | null;
  relevanceLabel: string;
  relevanceReason: string;

  /**
   * Shared library only: the one viral rule's multiple and what it compares
   * against ("usual_views" = the creator's median of recent videos).
   */
  viralMultiple?: number | null;
  viralBasis?: "usual_views" | "followers" | null;

  hookMechanism?: string | null;
  format?: string | null;
  adaptabilityReason?: string | null;

  saved: boolean;
  dismissed: boolean;
  remade: boolean;

  shownAt?: string | null;
};

export type ViralDailyFeedResponse = {
  feedId: number;
  localDate: string;
  timezone: string;
  generatedAt: string;
  status: "ready" | "empty" | "error" | "refreshing" | "assembling";
  fromCache: boolean;
  generationReason: string | null;
  items: ViralPost[];
  errorMessage?: string | null;
  /** True when a background pool refresh was kicked for cold start. */
  poolRefreshStarted?: boolean;
  /** Server-side timing for this response (ms). */
  serverDurationMs?: number;
};

/** Paginated past daily feeds (excludes today; see getFeedHistory). */
export type ViralFeedHistoryResponse = {
  feeds: ViralDailyFeedResponse[];
  /** Oldest localDate in this page when hasMore; pass as cursor for the next page. */
  nextCursor: string | null;
  hasMore: boolean;
};

export type ViralSearchResponse = {
  items: ViralPost[];
  query: string;
  fromCache: boolean;
  /** ScrapeCreators calls for this request (0 on cache hit). */
  scCallCount?: number;
  costEstimateUsd?: number;
  serverDurationMs?: number;
};

/** Parsed from VIRAL_POSTS_LIVE (default: on outside production). Prefer explicit true/false. */
export function parseViralPostsLive(
  raw: string | undefined,
  nodeEnv: string | undefined
): boolean {
  const parsed = parseExplicitBoolean(raw);
  if (parsed !== null) return parsed;
  return nodeEnv !== "production";
}

/** Parsed from VIRAL_POSTS_INSTAGRAM_ENABLED (default: follows VIRAL_POSTS_LIVE). Prefer explicit true/false. */
export function parseViralPostsInstagramEnabled(
  raw: string | undefined,
  viralPostsLive: boolean
): boolean {
  const parsed = parseExplicitBoolean(raw);
  if (parsed !== null) return parsed;
  return viralPostsLive;
}

/** Parsed from VIRAL_POSTS_TIKTOK_ENABLED (default: follows VIRAL_POSTS_LIVE). */
export function parseViralPostsTiktokEnabled(
  raw: string | undefined,
  viralPostsLive: boolean
): boolean {
  const parsed = parseExplicitBoolean(raw);
  if (parsed !== null) return parsed;
  return viralPostsLive;
}

/**
 * Parsed from VIRAL_POSTS_YOUTUBE_ENABLED.
 * YouTube is opt-in only: blank/invalid/false stay disabled even when Viral Posts is live.
 */
export function parseViralPostsYoutubeEnabled(
  raw: string | undefined,
  viralPostsLive: boolean
): boolean {
  return viralPostsLive && parseExplicitBoolean(raw) === true;
}

/**
 * Process-local pool refresher (web process). Opt-in only.
 * Blank/invalid => false. Production web must stay false; use cron/worker.
 */
export function parseViralPostsPoolRefresher(
  raw: string | undefined
): boolean {
  const parsed = parseExplicitBoolean(raw);
  return parsed === true;
}

/** Refresh interval ms. Blank => 3 hours. Invalid => 3 hours. */
export function parseViralPostsPoolRefreshMs(
  raw: string | undefined
): number {
  const DEFAULT_MS = 3 * 60 * 60 * 1000;
  if (raw === undefined || raw.trim() === "") return DEFAULT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 60_000) return DEFAULT_MS;
  return Math.floor(n);
}

/** Strict true/false parser. Returns null when unset or unrecognized. */
export function parseExplicitBoolean(
  raw: string | undefined
): boolean | null {
  if (raw === undefined || raw.trim() === "") return null;
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

export const VIRAL_POSTS_NOT_ENABLED_MESSAGE =
  "Viral Posts is not enabled";

export const VIRAL_POSTS_INSTAGRAM_DISABLED_MESSAGE =
  "Instagram Viral Posts is not available right now";

export const VIRAL_DAILY_FEED_MIN = 5;
export const VIRAL_DAILY_FEED_MAX = 7;
