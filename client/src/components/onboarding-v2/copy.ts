/**
 * Onboarding v2 copy. Exact text from the approved Figma desktop frames and
 * the approved build plan. One copy for desktop and mobile (the mobile
 * frames still carry an older draft of the 3a options and step 1 subtitle).
 * No em dashes.
 */
import type {
  AnalysisStage,
  AttributionSource,
  PrimaryUseCase,
  SocialPlatform,
} from "@shared/personalization/model";

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export const COPY = {
  platform: {
    title: "Where do you post?",
    subtitle: "We study your profile to find winning creators and viral videos in your niche.",
    fieldLabel: "Username or profile link",
    placeholder: "@handle",
    noPost: "I don't post yet",
    continue: "Continue",
    errors: {
      not_found: "Handle not found. Try another handle.",
      private: "This account is private. Try another handle.",
      invalid: "Enter a username or a profile link.",
      platform_mismatch: "This link is for a different platform.",
      unsupported_link: "Use a profile link, not a post link.",
      error: "Something went wrong. Try again.",
      rate_limited: "Too many lookups. Try again in a few minutes.",
    },
  },
  profile: {
    title: "Is this you?",
    subtitle: "Confirm your profile so we can personalize your recommendations.",
    notMe: "Not me",
    thatsMe: "That's me",
  },
  useCase: {
    title: "What brings you to SpyReels?",
    subtitle: "Choose what you want to do first.",
  },
  attribution: {
    title: "How did you hear about us?",
    subtitle: "Pick one.",
    skip: "Skip",
  },
  niche: {
    title: "What do you want to grow in?",
  },
  personalization: {
    subtitleFromPosts: "From your posts. Confirm or edit anything.",
    subtitle: "Confirm or edit anything.",
    goal: {
      title: "Why you create",
      sentenceLabel: "In one sentence",
      nicheLabel: "Niche",
      languageLabel: "Language",
      main: "Spot on",
      placeholder: "What you want your content to do",
    },
    audience: {
      title: "Who you want to reach",
      rowPrefix: "You create content for",
      rowMiddle: "to help them",
      add: "+ Add an audience",
      whoLabel: "Who",
      outcomeLabel: "To help them",
      main: "Nailed it",
    },
    pillars: {
      title: "What you'll create",
      add: "+ Add a pillar",
      titleLabel: "Pillar",
      descriptionLabel: "What it covers",
      ofViews: "of views",
      main: "Show me what's going viral",
    },
    edit: "Edit",
    add: "Add",
    save: "Save",
    cancel: "Cancel",
    remove: "Remove",
    skip: "Skip",
    notSet: "Not set",
    thinking: "Writing suggestions from your profile",
    failed: "We couldn't write a suggestion. Add your own.",
  },
  back: "Back",
  continue: "Continue",
  tryAgain: "Try again",
  checklistHeading: "We're learning what helps your content grow",
} as const;

export const USE_CASE_OPTIONS: Array<{
  value: PrimaryUseCase;
  title: string;
  description: string;
}> = [
  {
    value: "find_viral_videos",
    title: "Find viral videos in my niche",
    description: "Discover what's taking off before everyone else.",
  },
  {
    value: "scripts_in_my_voice",
    title: "Turn viral videos into scripts in my voice",
    description: "Make proven ideas original and ready to film.",
  },
  {
    value: "analyze_creators",
    title: "Analyze creators I want to learn from",
    description: "Explore their top videos, hooks, and topics.",
  },
  {
    value: "ideas_what_to_post",
    title: "Find ideas for what to post next",
    description: "Get inspiration tailored to your niche.",
  },
];

/** Two-column order from the Figma frame: left column first, row by row. */
export const ATTRIBUTION_OPTIONS: Array<{ value: AttributionSource; label: string }> = [
  { value: "google_search", label: "Google search" },
  { value: "chatgpt_ai_tools", label: "ChatGPT or AI tools" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "facebook", label: "Facebook" },
  { value: "friend", label: "A friend" },
  { value: "other", label: "Other" },
];

export { GROWTH_NICHE_OPTIONS } from "@shared/personalization/growthNiches";

export const ANALYSIS_STAGE_COPY: Record<AnalysisStage, { title: string; description: string }> = {
  published_content: {
    title: "Analyzing your published content",
    description: "Reviewing your recent public posts.",
  },
  strongest_performers: {
    title: "Discovering your strongest performers",
    description: "Finding which videos attracted the most attention.",
  },
  hooks_and_topics: {
    title: "Identifying your best hooks and topics",
    description: "Understanding the patterns behind your content.",
  },
  niche_opportunities: {
    title: "Finding opportunities in your niche",
    description: "Discovering viral content relevant to your audience.",
  },
};
