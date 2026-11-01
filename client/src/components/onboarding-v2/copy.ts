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
    cancel: "Cancel",
    retry: "Retry",
    finding: {
      instagram: "Finding your Instagram profile",
      tiktok: "Finding your TikTok profile",
      youtube: "Finding your YouTube channel",
    },
    slow: {
      instagram: "Instagram is taking longer than expected.",
      tiktok: "TikTok is taking longer than expected.",
      youtube: "YouTube is taking longer than expected.",
    },
    errors: {
      not_found: "We couldn't find this account. Check the spelling, or paste your profile link.",
      private: "This account is private. Try another handle.",
      invalid: "Enter a username or a profile link.",
      platform_mismatch: "This link is for a different platform.",
      unsupported_link: "Use a profile link, not a post link.",
      error: "Something went wrong. Try again.",
      rate_limited: "Too many lookups. Try again in a few minutes.",
      timeout: "This is taking longer than expected.",
      unavailable: "We can't read this profile right now. You can continue without it.",
    },
    continueWithout: "Continue without my profile",
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
  starter: {
    title: "Tell us about your content",
    subtitle: "Three quick answers so your strategy fits you. Answer what you can.",
    topicLabel: "What do you create content about?",
    topicPlaceholder: "e.g. Fitness, Personal Finance, AI Tools...",
    audienceLabel: "Who are you talking to?",
    audiencePlaceholder: "e.g. Busy moms who want to lose 20 lbs...",
    purposeLabel: "What do you want your content to do for you?",
    examples: "Or pick one",
    skip: "Skip",
  },
  insight: {
    label: "Performance insight from your videos",
    views: "views on this video",
  },
  whatWorks: {
    title: "What works for you",
    subtitle: "We studied your last 6 months of posts.",
    label: "Your best Reel",
    views: "views",
    yourFollowers: "your followers",
    play: "Play your best Reel",
  },
  personalization: {
    subtitleFromPosts: "From your posts. Confirm or edit anything.",
    subtitle: "Confirm or edit anything.",
    goal: {
      title: "Why you create",
      subtitle: "Confirm your goals to find viral videos that fit.",
      groupLabel: "Goals",
      fieldLabel: "Goal",
      add: "+ Add goal",
      nicheLabel: "Niche",
      languageLabel: "Language",
      main: "Looks right, continue",
      placeholder: "What you want your content to do",
    },
    audience: {
      title: "Who you want to reach",
      subtitle: "Confirm your audience to find videos relevant to them.",
      groupLabel: "Audience",
      add: "+ Add audience",
      whoLabel: "Who",
      outcomeLabel: "To help them",
      main: "Looks right, continue",
    },
    pillars: {
      title: "What you'll create",
      subtitle: "Confirm your topics to find viral videos worth creating.",
      add: "+ Add a pillar",
      titleLabel: "Pillar",
      descriptionLabel: "What it covers",
      ofViews: "of views",
      main: "Save and continue",
    },
    edit: "Edit",
    add: "Add",
    save: "Save",
    cancel: "Cancel",
    remove: "Remove",
    undo: "Undo",
    removed: "Removed",
    finishEdit: "Fill in the required field, or cancel the edit, to continue.",
    done: "Done",
    skip: "Skip",
    notSet: "Not set",
    subtopicsLabel: "Suggested subtopics",
    thinking: "Writing suggestions from your profile",
    failed: "We couldn't write a suggestion. Add your own.",
    retry: "Try again",
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
