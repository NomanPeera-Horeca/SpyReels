/**
 * Bounds for onboarding profile identification.
 * TikTok and YouTube use the short interactive bounds below.
 */
export const PROFILE_LOOKUP_DEADLINE_MS = 12_000;
export const PROFILE_LOOKUP_ATTEMPT_TIMEOUT_MS = 8_000;
export const PROFILE_LOOKUP_MAX_ATTEMPTS = 2;
/**
 * Instagram profile requests can take longer than 12s at the provider.
 * Creator Radar waits 30s per request for the same call, so onboarding uses
 * that request timeout, keeps one retry, and stops the whole lookup at 45s.
 */
export const INSTAGRAM_PROFILE_LOOKUP_DEADLINE_MS = 45_000;
export const INSTAGRAM_PROFILE_LOOKUP_ATTEMPT_TIMEOUT_MS = 30_000;
/** The lookup is still the same in-flight provider call after this long. */
export const PROFILE_LOOKUP_SLOW_AFTER_MS = 8_000;
/** Successful public profiles. A retry of the same handle does not pay the provider again. */
export const PROFILE_LOOKUP_CACHE_TTL_MS = 30 * 60 * 1000;
