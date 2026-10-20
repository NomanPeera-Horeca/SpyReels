/**
 * Bounds for onboarding profile identification.
 * These are shorter than the existing 30s provider default. They do not raise it.
 */
export const PROFILE_LOOKUP_DEADLINE_MS = 12_000;
export const PROFILE_LOOKUP_ATTEMPT_TIMEOUT_MS = 8_000;
export const PROFILE_LOOKUP_MAX_ATTEMPTS = 2;
/** The lookup is still the same in-flight provider call after this long. */
export const PROFILE_LOOKUP_SLOW_AFTER_MS = 8_000;
/** Successful public profiles. A retry of the same handle does not pay the provider again. */
export const PROFILE_LOOKUP_CACHE_TTL_MS = 30 * 60 * 1000;
