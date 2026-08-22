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

export type ViralPostsTab = "for-you" | "explore" | "saved";
export type SavedPostsFilter = "all" | "unused" | "remade";
export type ExploreQuickFilter = "all" | "rising" | "proven";

export type ExploreAdvancedFilters = {
  platforms: { instagram: boolean; tiktok: boolean };
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

export const DEFAULT_EXPLORE_FILTERS: ExploreAdvancedFilters = {
  platforms: { instagram: true, tiktok: false },
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
