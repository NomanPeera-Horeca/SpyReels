/** Phase 3A.1 provider budgets and latency defaults. */
export const VIRAL_POOL_DEFAULTS = {
  /** Max ScrapeCreators calls per pool refresh run. */
  refreshMaxScCalls: 35,
  /** Skip profile drilling on routine refreshes (hashtag-only). */
  refreshSkipProfileDrilling: true,
  /** Stop early once this many scored candidates exist. */
  refreshEarlyStopCandidates: 40,
  /** Per-pool daily ScrapeCreators budget. */
  dailyCallBudget: 60,
  /** Minimum fresh candidates before skipping a refresh. */
  minFreshCandidates: 40,
  /** Short freshness window used only to decide whether a pool needs new discovery. */
  freshCandidateMaxAgeHours: 72,
  /**
   * Recommendation reservoir window. Proven candidates can stay eligible for
   * Today’s Picks / browse for 90 days even while refresh continues every few days.
   */
  assemblyCandidateMaxAgeHours: 90 * 24,
  /** Exact videos already shown in Today’s Picks stay suppressed for 90 days. */
  todayPicksRepeatSuppressionDays: 90,
  /** Max candidates loaded from pool for scoring. */
  assemblyCandidateLimit: 120,
  /** How long to wait for a concurrent assembler (ms). */
  concurrentAssembleWaitMs: 8_000,
  /** Explore search ScrapeCreators budget. */
  exploreMaxScCalls: 25,
  /** Explore in-memory cache TTL. */
  exploreCacheMs: 10 * 60 * 1000,
  /** How long a pool refresh lease lasts before it can be stolen (ms). */
  refreshLeaseTtlMs: 10 * 60 * 1000,
  /** TT/YT seed refresh: max handles scraped per pool run. */
  seedMaxHandlesPerRefresh: 4,
  /** TT/YT seed refresh: max videos kept per handle. */
  seedMaxVideosPerHandle: 8,
  /** TT/YT seed pools: lower fresh floor (handle scrape, not hashtag). */
  seedMinFreshCandidates: 12,
  /** TT/YT seed pools: tighter daily budget. */
  seedDailyCallBudget: 30,
  /** Approximate SC calls charged per seed handle scrape. */
  seedScCallsPerHandle: 3,
} as const;

/** Pillar key for platform seed pools (one pool per niche+platform). */
export const VIRAL_SEED_POOL_PILLAR = "seed-mix";

export const DEFAULT_CONTENT_PILLARS = [
  "restaurant profitability",
  "menu engineering",
  "restaurant operations",
  "kitchen buildouts",
  "restaurant marketing",
  "hospitality leadership",
] as const;

export function slugifyPoolPart(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "general";
}

export function buildPoolKey(args: {
  platform?: string;
  niche: string;
  pillar: string;
  language?: string;
  region?: string | null;
}): string {
  const platform = args.platform || "instagram";
  const lang = args.language || "en";
  const region = args.region ? `:${slugifyPoolPart(args.region)}` : "";
  return `${platform}:${slugifyPoolPart(args.niche)}:${slugifyPoolPart(args.pillar)}:${lang}${region}`;
}
