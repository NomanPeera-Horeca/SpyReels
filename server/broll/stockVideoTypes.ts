/**
 * Shared stock-video candidate shape for Pexels / Pixabay (and future providers).
 */

export type StockVideoProvider = "pexels" | "pixabay";

/** high = passed relevance; approximate = best available after all candidates failed relevance. */
export type StockMatchConfidence = "high" | "approximate";

export type StockVideoResult = {
  id: number;
  thumbnailUrl: string;
  previewUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  /** Stock video page URL. */
  sourceUrl: string;
  photographerName: string;
  photographerUrl: string;
  provider: StockVideoProvider;
  matchConfidence?: StockMatchConfidence;
};

/**
 * Per-provider beat search outcome.
 * empty = zero candidates; high/approximate always include a video.
 */
export type StockProviderBeatResult =
  | { status: "empty" }
  | { status: "high"; video: StockVideoResult }
  | { status: "approximate"; video: StockVideoResult };
