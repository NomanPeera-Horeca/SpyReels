/** Shared types for the public /free-tools/broll-generator landing preview. */

export type BrollLandingMatchSource = "pexels" | "pixabay" | "ai";

/** UI shape for matched preview clips (script or video mode). */
export type BrollLandingMatch = {
  beat: string;
  keyword: string;
  clipUrl: string;
  posterUrl: string;
  source: BrollLandingMatchSource;
  start: number;
  end: number;
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
