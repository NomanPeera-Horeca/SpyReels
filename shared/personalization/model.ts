/**
 * New onboarding + personalization: shared vocabulary.
 *
 * Source of truth for values stored in the personalization tables
 * (drizzle/personalizationSchema.ts) and used by client and server.
 * Copy and order follow the approved Figma flow:
 * Platform > Profile confirmation > Primary use case > Attribution >
 * Your Goal > Your Audience > Your Pillars > Home.
 *
 * Every user can complete Goal, Audience and Pillars, whatever their post
 * count (including zero, private accounts and "I don't post yet"). Missing
 * history changes WHERE suggestions come from, never WHETHER a step is shown.
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

/** Steps 4a to 4c, the personalization stepper (Goal, Audience, Pillars). Always all three. */
export const PERSONALIZATION_STEPS = ["goal", "audience", "pillars"] as const;
export type PersonalizationStep = (typeof PERSONALIZATION_STEPS)[number];

/**
 * pending: no suggestions yet (user can still type their own and confirm)
 * suggested: suggestions exist, user has not confirmed
 * confirmed: user tapped the confirm button (Spot on / Nailed it / ...)
 * skipped: user tapped Skip (suggestions are kept, not confirmed)
 *
 * There is deliberately no "not applicable" state: no data rule may remove
 * a step from the flow.
 */
export const STEP_STATUSES = [
  "pending",
  "suggested",
  "confirmed",
  "skipped",
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/** Data rule: analysis window. */
export const ANALYSIS_WINDOW_MONTHS = 6;

/**
 * brand_description: what the creator makes content about / what their
 * business does, in their words. Legacy onboarding stored this in
 * users.businessDescription ("What do you create content about?") and the plan
 * coach reads it as brandDescription. It is not a goal.
 */
export const PERSONALIZATION_ITEM_KINDS = [
  "goal",
  "audience",
  "pillar",
  "niche",
  "language",
  "brand_description",
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
 * What a value is based on. The UI must label these differently.
 * - performance_backed: measured from the user's own analyzed posts
 *   (requires an analysis run; the only kind allowed to carry numbers such
 *   as a pillar's view share)
 * - profile_inferred: an AI recommendation from profile info (bio, niche)
 *   and confirmed goals. Never shows performance numbers.
 * - user_provided: typed or edited by the user.
 */
export const ITEM_EVIDENCE = [
  "performance_backed",
  "profile_inferred",
  "user_provided",
] as const;
export type ItemEvidence = (typeof ITEM_EVIDENCE)[number];

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
/**
 * viewSharePercent is the REAL share of the user's views, or null.
 * Only performance_backed pillars may carry a number (also enforced by a DB CHECK).
 */
export type PillarPayload = {
  title: string;
  description: string;
  viewSharePercent: number | null;
};
export type NichePayload = { slug: string; label: string };
export type LanguagePayload = { code: string; label: string };
export type BrandDescriptionPayload = { text: string };

export type ItemPayloadByKind = {
  goal: GoalPayload;
  audience: AudiencePayload;
  pillar: PillarPayload;
  niche: NichePayload;
  language: LanguagePayload;
  brand_description: BrandDescriptionPayload;
};

/**
 * Editing these kinds makes AI suggestions built on the old answers stale.
 * Goal, audience and niche feed pillar suggestions.
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
  brand_description: ["pillar"],
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

/**
 * not_posting_yet: the user chose "I don't post yet". The row still owns
 * their goals, audiences and pillars; platform and handle are filled in
 * later when they start posting, and the strategy carries over.
 * unlinked: strategy saved before any account was linked (legacy users
 * backfilled from users.* columns). Same shape as not_posting_yet (no
 * handle); the account is linked later and the strategy carries over.
 */
export const SOCIAL_PROFILE_STATUSES = [
  "pending_confirmation",
  "confirmed",
  "not_found",
  "private",
  "lookup_failed",
  "not_posting_yet",
  "unlinked",
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

/**
 * What history-based analysis can offer right now. Drives the suggestion
 * source and the UI label, never whether a step is shown.
 */
export const ANALYSIS_AVAILABILITY = [
  "available",
  "in_progress",
  "no_public_posts",
  "private_account",
  "not_posting_yet",
  "account_not_linked",
  "unavailable",
] as const;
export type AnalysisAvailability = (typeof ANALYSIS_AVAILABILITY)[number];

/** Durable job type for the profile analysis (to be registered in server/durableJobs/types.ts). */
export const PROFILE_ANALYSIS_JOB_TYPE = "profile_analysis";

/**
 * Why an analysis run exists. One run = one logical request.
 * - initial: started by "That's me". One per account identity, ever.
 *   Reloads and repeated taps reuse it; a failed one is retried in place.
 * - user_refresh: the user explicitly asked for fresh analysis. Each one is a
 *   new run (history kept), subject to cooldown and usage limits.
 * - background: scheduled refresh. Only when the refresh policy allows it.
 *
 * Automatic retries are NOT new runs: the durable job retries the same row
 * (attempt counter, lease expiry) under the same idempotency key.
 */
export const ANALYSIS_REQUEST_KINDS = [
  "initial",
  "user_refresh",
  "background",
] as const;
export type AnalysisRequestKind = (typeof ANALYSIS_REQUEST_KINDS)[number];

/**
 * PROVISIONAL refresh policy (needs CEO confirmation). Each analysis costs
 * provider calls, so refreshes are rate limited:
 * - a user refresh needs this long since the last finished run
 * - background refresh is OFF until a policy is approved; when on, it only
 *   runs if the last successful analysis is older than the interval
 */
export const ANALYSIS_REFRESH_POLICY = {
  userRefreshCooldownMinutes: 60,
  backgroundRefreshEnabled: false,
  backgroundRefreshIntervalDays: 7,
} as const;
export type AnalysisRefreshPolicy = {
  userRefreshCooldownMinutes: number;
  backgroundRefreshEnabled: boolean;
  backgroundRefreshIntervalDays: number;
};

/**
 * One post as returned by the existing provider integrations, normalized.
 * Any number the provider did not return is null. Nothing is estimated.
 */
export type NormalizedPost = {
  postId: string;
  url: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  durationSec: number | null;
  caption: string | null;
};

/** Stored on profile_analysis_runs.sourceSnapshot after stage 1. */
export type AnalysisSourceSnapshot = {
  version: 1;
  platform: SocialPlatform;
  handle: string;
  /** From the provider's profile response, or null. Never estimated. */
  followerCount: number | null;
  windowStart: string;
  windowEnd: string;
  posts: NormalizedPost[];
};
