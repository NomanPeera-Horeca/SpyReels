/** Client re-exports of shared Viral Posts types (Phase 3A). */
export type {
  ViralDailyFeedResponse,
  ViralFeedbackType,
  ViralMediaStatus,
  ViralPost,
  ViralPostPlatform,
  ViralSearchResponse,
  ViralTrendStatus,
} from "@shared/viralPosts";
export {
  VIRAL_POSTS_V1_DEFAULT_PLATFORM,
  VIRAL_POSTS_V1_PLATFORMS,
  isViralPostsV1Platform,
  normalizeViralPostsExplorePlatforms,
  normalizeViralPostsV1Platform,
} from "@shared/viralPosts";
import { normalizeViralPostsExplorePlatforms } from "@shared/viralPosts";

export type ViralPostsTab = "for-you" | "explore" | "saved";
export type SavedPostsFilter = "all" | "unused" | "remade";
export type ExploreQuickFilter = "all" | "rising" | "proven";

export type ExploreAdvancedFilters = {
  platforms: { instagram: boolean; tiktok: boolean; youtube: boolean };
  momentum: {
    breakingOut: boolean;
    risingFast: boolean;
    provenFormat: boolean;
  };
  videoStyles: {
    talkingHead: boolean;
    storytelling: boolean;
    educational: boolean;
    faceless: boolean;
  };
  postedWithin: "24h" | "7d" | "30d";
};

export type ViralRemakeAngle = "best" | "story" | "contrarian";

export type ViralRemakePreview = {
  angle: ViralRemakeAngle;
  newHook: string;
  script: string;
  caption: string;
  shotGuidance: string[];
  brollSuggestions: string[];
};

/** Viral Posts V1 UI: Instagram + TikTok only (youtube kept off for stale state). */
export const DEFAULT_EXPLORE_FILTERS: ExploreAdvancedFilters = {
  platforms: { instagram: true, tiktok: true, youtube: false },
  momentum: {
    breakingOut: true,
    risingFast: true,
    provenFormat: false,
  },
  videoStyles: {
    talkingHead: false,
    storytelling: false,
    educational: false,
    faceless: false,
  },
  postedWithin: "7d",
};

/** Force YouTube off so stale saved filter state cannot show an empty YouTube view. */
export function normalizeExploreFilters(
  filters: ExploreAdvancedFilters
): ExploreAdvancedFilters {
  return {
    ...filters,
    platforms: normalizeViralPostsExplorePlatforms(filters.platforms),
  };
}
