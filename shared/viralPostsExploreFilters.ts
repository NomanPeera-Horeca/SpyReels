import type { ViralPost, ViralTrendStatus } from "./viralPosts";
import { isViralPostsV1Platform } from "./viralPosts";

export type ExploreQuickFilter = "all" | "rising" | "proven";
export type ExplorePostedWithin = "24h" | "7d" | "30d";

export type ExplorePlatformFilters = {
  instagram: boolean;
  tiktok: boolean;
  youtube?: boolean;
};

export const EXPLORE_POSTED_WITHIN_MAX_HOURS: Record<
  ExplorePostedWithin,
  number
> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
};

const RISING_TREND_STATUSES: ReadonlySet<ViralTrendStatus> = new Set([
  "breaking-out",
  "rising-fast",
]);

export type ExploreFilterablePost = Pick<
  ViralPost,
  | "id"
  | "platform"
  | "creatorId"
  | "creatorHandle"
  | "publishedAt"
  | "ageHours"
  | "trendStatus"
  | "saved"
>;

export function explorePostCreatorKey(
  post: Pick<ExploreFilterablePost, "creatorId" | "creatorHandle">
): string {
  return (post.creatorId || post.creatorHandle || "")
    .toLowerCase()
    .replace(/^@/, "");
}

/** Prefer ageHours; else derive from publishedAt. Null when unusable. */
export function resolveExplorePostAgeHours(
  post: Pick<ExploreFilterablePost, "ageHours" | "publishedAt">,
  nowMs = Date.now()
): number | null {
  if (
    post.ageHours != null &&
    Number.isFinite(post.ageHours) &&
    post.ageHours >= 0
  ) {
    return post.ageHours;
  }
  const raw = (post.publishedAt || "").trim();
  if (!raw) return null;
  const publishedMs = Date.parse(raw);
  if (!Number.isFinite(publishedMs)) return null;
  const hours = (nowMs - publishedMs) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 0) return null;
  return hours;
}

export function matchesExploreQuickFilter(
  trendStatus: ViralTrendStatus | null | undefined,
  quickFilter: ExploreQuickFilter
): boolean {
  if (quickFilter === "all") return true;
  if (quickFilter === "rising") {
    return RISING_TREND_STATUSES.has(trendStatus as ViralTrendStatus);
  }
  return trendStatus === "proven-format";
}

export function matchesExplorePostedWithin(
  post: Pick<ExploreFilterablePost, "ageHours" | "publishedAt">,
  postedWithin: ExplorePostedWithin,
  nowMs = Date.now()
): boolean {
  const ageHours = resolveExplorePostAgeHours(post, nowMs);
  if (ageHours == null) return false;
  return ageHours <= EXPLORE_POSTED_WITHIN_MAX_HOURS[postedWithin];
}

export function matchesExplorePlatform(
  platform: string | null | undefined,
  platforms: ExplorePlatformFilters
): boolean {
  if (!platforms.instagram && !platforms.tiktok) return false;
  // Viral Posts V1 never surfaces YouTube rows.
  if (!isViralPostsV1Platform(platform)) return false;
  if (platform === "tiktok") return platforms.tiktok === true;
  return platforms.instagram === true;
}

/**
 * Pure Explore V1 filter for Browse and Search result lists.
 * Does not trigger provider discovery.
 */
export function applyExplorePostFilters<T extends ExploreFilterablePost>(args: {
  posts: T[];
  platforms: ExplorePlatformFilters;
  postedWithin: ExplorePostedWithin;
  quickFilter: ExploreQuickFilter;
  hiddenCreatorKeys?: Iterable<string> | ReadonlySet<string>;
  dismissedPostIds?: Iterable<string> | ReadonlySet<string>;
  savedOverrides?: Record<string, boolean>;
  nowMs?: number;
}): T[] {
  const hidden = toSet(args.hiddenCreatorKeys);
  const dismissed = toSet(args.dismissedPostIds);
  const nowMs = args.nowMs ?? Date.now();
  const overrides = args.savedOverrides;

  return args.posts
    .map((post) => {
      if (overrides && overrides[post.id] != null) {
        return { ...post, saved: overrides[post.id]! };
      }
      return post;
    })
    .filter((post) => {
      if (dismissed.has(post.id)) return false;
      const key = explorePostCreatorKey(post);
      if (key && hidden.has(key)) return false;
      if (!matchesExplorePlatform(post.platform, args.platforms)) return false;
      if (!matchesExplorePostedWithin(post, args.postedWithin, nowMs)) {
        return false;
      }
      if (!matchesExploreQuickFilter(post.trendStatus, args.quickFilter)) {
        return false;
      }
      return true;
    });
}

export function exploreEmptyCopy(args: {
  platforms: ExplorePlatformFilters;
  usingSearch: boolean;
  rawResultCount: number;
  quickFilter: ExploreQuickFilter;
}): { title: string; description: string } {
  if (!args.platforms.instagram && !args.platforms.tiktok) {
    return {
      title: "Select Instagram or TikTok to see posts",
      description: "Select Instagram or TikTok to see posts.",
    };
  }
  if (args.usingSearch) {
    if (args.rawResultCount > 0) {
      return {
        title: "No posts match these filters",
        description:
          "Try Last 30 days, clear Rising / Proven, or turn both platforms back on.",
      };
    }
    return {
      title: "No exact matches yet",
      description:
        "Try a broader topic, or clear the search to browse your niche.",
    };
  }
  if (args.quickFilter === "all") {
    return {
      title: "No browse posts available yet",
      description:
        "Your niche pool is refreshing. Try again shortly or search for a topic now.",
    };
  }
  return {
    title: "No posts match these filters",
    description: "Clear Rising / Proven or adjust the platform filters.",
  };
}

function toSet(
  value: Iterable<string> | ReadonlySet<string> | undefined
): Set<string> {
  if (!value) return new Set();
  if (value instanceof Set) return value;
  return new Set(value);
}
