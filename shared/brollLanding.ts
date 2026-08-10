/** Shared types for the public /free-tools/broll-generator landing preview. */

export type BrollLandingMatchSource = "pexels" | "pixabay" | "ai";

/** Whether a beat found a stock clip or needs user context to retry. */
export type BrollLandingMatchStatus = "matched" | "no_match";

/** high = passed relevance; approximate = best available after relevance failed. */
export type BrollLandingMatchConfidence = "high" | "approximate";

/** UI shape for matched preview clips (script or video mode). */
export type BrollLandingMatch = {
  beat: string;
  keyword: string;
  /** Empty when matchStatus is no_match. */
  clipUrl: string;
  /** Empty when matchStatus is no_match. */
  posterUrl: string;
  source: BrollLandingMatchSource;
  start: number;
  end: number;
  matchStatus: BrollLandingMatchStatus;
  /** Present when matchStatus is matched. Defaults to high for legacy rows. */
  matchConfidence?: BrollLandingMatchConfidence;
};

export const ANONYMOUS_BROLL_PREVIEW_DAILY_LIMIT = 3;

export type BrollLandingQuota = {
  remaining: number;
  limit: number;
  /** True when results should show the CSS watermark overlay. */
  watermarked: boolean;
  /** True when full-resolution download is unlocked (paid plan). */
  canDownload: boolean;
  isAuthenticated: boolean;
};
