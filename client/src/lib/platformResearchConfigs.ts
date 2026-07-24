export type ResearchPlatform = "tiktok" | "youtube";

export type SortOption =
  | "views_desc"
  | "likes_desc"
  | "comments_desc"
  | "shares_desc"
  | "engagement_desc"
  | "date_desc"
  | "date_asc";

export type PlatformVideoLike = {
  id: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount?: number;
  thumbnailUrl: string | null;
  videoPageUrl: string;
  durationSec: number | null;
  postedAt: Date;
  engagementRate: number;
  caption?: string | null;
  title?: string | null;
  videoUrl?: string | null;
  /** True when row is older than the spy window (min-sample backfill). */
  outsideSpyWindow?: boolean | null;
};

export type PlatformResearchConfig = {
  platform: ResearchPlatform;
  label: string;
  contentNoun: string;
  /** Noun used in the in-progress "Found N …" line (TikTok: videos, YouTube: Shorts). */
  foundProgressNoun: string;
  documentTitle: string;
  routePrefix: string;
  handleLabel: string;
  handlePlaceholder: string;
  handleHelpText: string;
  handleInputId: string;
  timeframeInputId: string;
  timeframeHelpText: string;
  ctaLabel: string;
  audienceLabel: string;
  emptyCaptionLabel: string;
  hasShares: boolean;
  transcribeMode: "async" | "instant";
  getCaption: (video: PlatformVideoLike) => string;
  getVideoUrl: (video: PlatformVideoLike) => string | null;
  buildTranscribeInput: (videoId: number) => Record<string, number>;
  buildGenerateInput: (videoId: number) => Record<string, unknown>;
  emptyTranscriptCopy: string;
  sortOptions: Array<{ value: SortOption; label: string }>;
};

const SHARED_SORT_OPTIONS_WITHOUT_SHARES: Array<{
  value: SortOption;
  label: string;
}> = [
  { value: "views_desc", label: "Highest Views" },
  { value: "likes_desc", label: "Highest Likes" },
  { value: "comments_desc", label: "Highest Comments" },
  { value: "engagement_desc", label: "Highest Engagement Rate" },
  { value: "date_desc", label: "Date (Newest)" },
  { value: "date_asc", label: "Date (Oldest)" },
];

export const tiktokResearchConfig: PlatformResearchConfig = {
  platform: "tiktok",
  label: "TikTok",
  contentNoun: "videos",
  foundProgressNoun: "videos",
  documentTitle: "TikTok Research | SpyReels",
  routePrefix: "/tiktok-scraping",
  handleLabel: "TikTok Handle",
  handlePlaceholder: "e.g. khaby.lame",
  handleHelpText:
    "Paste the TikTok username without the @ symbol. The account must be public.",
  handleInputId: "tiktok-handle",
  timeframeInputId: "tiktok-timeframe",
  timeframeHelpText:
    "TikTok videos posted within this window will be collected.",
  ctaLabel: "Start spying on TikTok",
  audienceLabel: "followers",
  emptyCaptionLabel: "No caption",
  hasShares: true,
  transcribeMode: "async",
  getCaption: (video) => video.caption?.trim() || "",
  getVideoUrl: (video) => video.videoUrl ?? null,
  buildTranscribeInput: (videoId) => ({ tiktokVideoId: videoId }),
  buildGenerateInput: (videoId) => ({
    tiktokVideoId: videoId,
    topic: "",
    gradeLevel: "auto",
  }),
  emptyTranscriptCopy:
    "No speech was detected, so a script was not generated.",
  sortOptions: [
    { value: "views_desc", label: "Highest Views" },
    { value: "likes_desc", label: "Highest Likes" },
    { value: "comments_desc", label: "Highest Comments" },
    { value: "shares_desc", label: "Highest Shares" },
    { value: "engagement_desc", label: "Highest Engagement Rate" },
    { value: "date_desc", label: "Date (Newest)" },
    { value: "date_asc", label: "Date (Oldest)" },
  ],
};

export const youtubeResearchConfig: PlatformResearchConfig = {
  platform: "youtube",
  label: "YouTube",
  contentNoun: "videos",
  foundProgressNoun: "Shorts",
  documentTitle: "YouTube Research | SpyReels",
  routePrefix: "/youtube-scraping",
  handleLabel: "YouTube channel handle",
  handlePlaceholder: "e.g. starterstory",
  handleHelpText:
    "Paste the YouTube channel handle without the @ symbol. The channel must be public.",
  handleInputId: "youtube-handle",
  timeframeInputId: "youtube-timeframe",
  timeframeHelpText:
    "YouTube shorts posted within this window will be collected.",
  ctaLabel: "Start spying on YouTube",
  audienceLabel: "subscribers",
  emptyCaptionLabel: "No title",
  hasShares: false,
  transcribeMode: "instant",
  getCaption: (video) => video.title?.trim() || "",
  getVideoUrl: () => null,
  buildTranscribeInput: (videoId) => ({ youtubeVideoId: videoId }),
  buildGenerateInput: (videoId) => ({
    youtubeVideoId: videoId,
    topic: "",
    gradeLevel: "auto",
  }),
  emptyTranscriptCopy:
    "No transcript available for this Short, so a script was not generated.",
  sortOptions: SHARED_SORT_OPTIONS_WITHOUT_SHARES,
};
