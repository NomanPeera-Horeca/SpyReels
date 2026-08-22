export type ViralPlatform = "instagram" | "tiktok";

export type ViralTrendStatus =
  | "rising-fast"
  | "breaking-out"
  | "proven-format"
  | "saturated";

export type ViralRemakeAngle = "best" | "story" | "contrarian";

export type ViralPostWhyItWorks = {
  hookMechanism?: string;
  structure?: string[];
  emotionalTrigger?: string;
  visualPattern?: string;
  ctaStrategy?: string;
  timingNote?: string;
};

export type ViralPost = {
  id: string;
  platform: ViralPlatform;
  creatorName: string;
  creatorAvatar?: string;
  creatorFollowers?: number;
  creatorId?: string;
  postUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  postedAt: string;
  hook: string;
  hookHighlight?: string;
  transcript?: string;
  views: number;
  likes?: number;
  comments: number;
  shares: number;
  trendStatus: ViralTrendStatus;
  relevanceLabel: string;
  relevanceReason: string;
  contentPillar?: string;
  videoStyle?: string;
  whyItWorks?: ViralPostWhyItWorks;
  saved: boolean;
  remade: boolean;
  posterTone?: "poster-1" | "poster-2" | "poster-3" | "poster-4" | "poster-5" | "poster-6" | "poster-7";
  humanTone?: "chef" | "light" | "woman";
};

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

export type RecommendationFeedbackAction =
  | "more-like-this"
  | "not-relevant"
  | "hide-creator";

export type ViralRemakePreview = {
  angle: ViralRemakeAngle;
  newHook: string;
  script: string;
  caption: string;
  shotGuidance: string[];
  brollSuggestions: string[];
};

export const DEFAULT_EXPLORE_FILTERS: ExploreAdvancedFilters = {
  platforms: { instagram: true, tiktok: true },
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
