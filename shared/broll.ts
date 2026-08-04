/** Shared types for B-Roll beat suggestions (Pexels video clips). */

export type BrollClip = {
  id: number;
  thumbnailUrl: string;
  previewUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  /** Pexels video page URL (required for attribution). */
  sourceUrl: string;
  photographerName: string;
  photographerUrl: string;
};

export type BrollBeat = {
  index: number;
  /** Short excerpt / paraphrase of the script segment. */
  scriptText: string;
  /** Visual-search-friendly query summary for stock video. */
  visualSummary: string;
  searchQuery: string;
  clips: BrollClip[];
};

export type SuggestBrollResult = {
  beats: BrollBeat[];
  attributionNote: string;
};

export const BROLL_PEXELS_ATTRIBUTION =
  "Videos provided by Pexels. Credit the photographer when you publish.";
