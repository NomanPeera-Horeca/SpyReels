/** Shared types for B-Roll beat suggestions (stock video clips). */

export type BrollClip = {
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
  /** Stock provider; defaults to pexels when omitted (legacy rows). */
  provider?: "pexels" | "pixabay";
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
  /** Kept for API compatibility; UI no longer displays attribution. */
  attributionNote: string;
  /** Overall theme from beat split; used for per-beat re-search. */
  theme?: string;
};
