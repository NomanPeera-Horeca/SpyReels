/**
 * New onboarding + personalization: shared vocabulary.
 *
 * Source of truth for values stored in the personalization tables
 * (drizzle/personalizationSchema.ts) and used by client and server.
 * Copy and order follow the approved Figma flow:
 * Platform > Profile confirmation > Primary use case > Attribution >
 * Your Goal > Your Audience > Your Pillars > Home.
 */

export const SOCIAL_PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Step 3a "What brings you to SpyReels?" (single select). */
export const PRIMARY_USE_CASES = [
  "find_viral_videos",
  "scripts_in_my_voice",
  "analyze_creators",
  "ideas_what_to_post",
] as const;
export type PrimaryUseCase = (typeof PRIMARY_USE_CASES)[number];

/** Step 3b "How did you hear about us?" (single select, optional; skip = null). */
export const ATTRIBUTION_SOURCES = [
  "google_search",
  "chatgpt_ai_tools",
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "friend",
  "other",
] as const;
export type AttributionSource = (typeof ATTRIBUTION_SOURCES)[number];

/** Whole-flow order. Used to compute where a returning user resumes. */
export const ONBOARDING_STEPS = [
  "platform",
  "profile_confirm",
  "use_case",
  "attribution",
  "goal",
  "audience",
  "pillars",
  "done",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Steps 4a to 4c, the personalization stepper (Goal, Audience, Pillars). */
export const PERSONALIZATION_STEPS = ["goal", "audience", "pillars"] as const;
export type PersonalizationStep = (typeof PERSONALIZATION_STEPS)[number];

/**
 * pending: nothing to show yet (analysis not ready)
 * suggested: AI suggestions exist, user has not confirmed
 * confirmed: user tapped the confirm button (Spot on / Nailed it / ...)
 * skipped: user tapped Skip (suggestions are kept, not confirmed)
 * not_applicable: data rule removed the step (fewer than 10 posts)
 */
export const STEP_STATUSES = [
  "pending",
  "suggested",
  "confirmed",
  "skipped",
  "not_applicable",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** Data rule: fewer posts than this in the window skips Audience and Pillars. */
export const MIN_POSTS_FOR_FULL_PERSONALIZATION = 10;
/** Data rule: analysis window. */
export const ANALYSIS_WINDOW_MONTHS = 6;

export const PERSONALIZATION_ITEM_KINDS = [
  "goal",
  "audience",
  "pillar",
  "niche",
  "language",
] as const;
export type PersonalizationItemKind =
  (typeof PERSONALIZATION_ITEM_KINDS)[number];

export const ITEM_SOURCES = [
  "ai_suggested",
  "user_entered",
  "user_edited",
] as const;
export type ItemSource = (typeof ITEM_SOURCES)[number];

/**
 * suggested / confirmed / dismissed are live states.
 * superseded = replaced by a newer row (kept for history, never shown).
 */
export const ITEM_STATUSES = [
  "suggested",
  "confirmed",
  "dismissed",
  "superseded",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type GoalPayload = { text: string };
/** "You create content for {who} to help them {outcome}" */
export type AudiencePayload = { who: string; outcome: string };
/** viewSharePercent is the REAL share of the user's views, or null if unknown. Never invented. */
export type PillarPayload = {
  title: string;
  description: string;
  viewSharePercent: number | null;
};
export type NichePayload = { slug: string; label: string };
export type LanguagePayload = { code: string; label: string };

export type ItemPayloadByKind = {
  goal: GoalPayload;
  audience: AudiencePayload;
  pillar: PillarPayload;
  niche: NichePayload;
  language: LanguagePayload;
};

/**
 * Editing these kinds makes AI suggestions built on the old answers stale.
 * Goal and audience feed pillar suggestions.
 */
export const INVALIDATES_ON_EDIT: Record<
  PersonalizationItemKind,
  PersonalizationItemKind[]
> = {
  goal: ["pillar"],
  audience: ["pillar"],
  niche: ["pillar"],
  pillar: [],
  language: [],
};

/** Right-panel analysis checklist (steps 3a and 3b). States come from the real job. */
export const ANALYSIS_STAGES = [
  "published_content",
  "strongest_performers",
  "hooks_and_topics",
  "niche_opportunities",
] as const;
export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

export const ANALYSIS_STAGE_STATUSES = [
  "waiting",
  "running",
  "done",
  "failed",
  "skipped",
] as const;
export type AnalysisStageStatus = (typeof ANALYSIS_STAGE_STATUSES)[number];

export const ANALYSIS_RUN_STATUSES = [
  "queued",
  "running",
  "partial",
  "succeeded",
  "failed",
] as const;
export type AnalysisRunStatus = (typeof ANALYSIS_RUN_STATUSES)[number];

/** Public lookup result for step 2. Private / not found never get stuck: user can try another handle or skip. */
export const SOCIAL_PROFILE_STATUSES = [
  "pending_confirmation",
  "confirmed",
  "not_found",
  "private",
  "lookup_failed",
] as const;
export type SocialProfileStatus = (typeof SOCIAL_PROFILE_STATUSES)[number];

/** Default none: SpyReels reads public data only. OAuth is a later, separate decision. */
export const SOCIAL_PROFILE_AUTHORIZATION = [
  "none",
  "authorized",
  "reconnect_required",
] as const;
export type SocialProfileAuthorization =
  (typeof SOCIAL_PROFILE_AUTHORIZATION)[number];

/** Durable job type for the profile analysis (to be registered in server/durableJobs/types.ts). */
export const PROFILE_ANALYSIS_JOB_TYPE = "profile_analysis";
