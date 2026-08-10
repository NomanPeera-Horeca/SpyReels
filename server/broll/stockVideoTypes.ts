/**
 * Shared stock-video candidate shape for Pexels / Pixabay (and future providers).
 */

export type StockVideoProvider = "pexels" | "pixabay";

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
};
