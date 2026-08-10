/**
 * Orchestrate beat split + stock video search with in-job clip dedupe.
 * Pexels first, Pixabay fallback via searchStockVideoForBeat.
 */

import {
  type BrollBeat,
  type BrollClip,
  type SuggestBrollResult,
} from "../../shared/broll";
import { searchStockVideoForBeat } from "./searchStockVideoForBeat";
import { splitScriptIntoBeats } from "./splitScriptIntoBeats";

/**
 * Legacy helper: niche + theme + beat query. Do not use for stock API retrieval;
 * theme/niche belong in relevanceText only so the API query matches the UI keyword.
 */
export function buildSearchQuery(
  theme: string,
  beatQuery: string,
  niche?: string
): string {
  const parts: string[] = [];
  const nicheTrim = niche?.trim();
  if (nicheTrim) parts.push(nicheTrim);

  const themeTrim = theme.trim();
  const beatTrim = beatQuery.trim();
  const beatLower = beatTrim.toLowerCase();
  if (themeTrim) {
    const themeWords = themeTrim.toLowerCase().split(/\s+/).filter(Boolean);
    const themeAlreadyInQuery = themeWords.every((w) => beatLower.includes(w));
    if (!themeAlreadyInQuery) parts.push(themeTrim);
  }
  if (beatTrim) parts.push(beatTrim);

  return parts.join(" ").trim();
}

/**
 * Merge optional user reroll context into a short stock search query (max ~6 words).
 * Context words lead so "commercial kitchen" wins over a vague base query.
 */
export function mergeUserContextIntoQuery(
  baseQuery: string,
  userContext?: string
): string {
  const base = baseQuery.trim();
  const ctx = (userContext ?? "").trim();
  if (!ctx) return base;
  if (!base) {
    return ctx.split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  }

  const ctxWords = ctx.split(/\s+/).filter(Boolean).slice(0, 4);
  const out: string[] = [...ctxWords];
  for (const w of base.split(/\s+/).filter(Boolean)) {
    if (out.length >= 6) break;
    if (!out.some((x) => x.toLowerCase() === w.toLowerCase())) out.push(w);
  }
  return out.join(" ");
}

/** Clean stock API query: matches UI keyword (searchQuery || visualSummary). */
export function beatStockSearchQuery(beat: {
  searchQuery?: string;
  visualSummary?: string;
}): string {
  return (beat.searchQuery || beat.visualSummary || "").trim();
}

/** Mood/context for Haiku; theme and niche stay out of the retrieval query. */
export function beatRelevanceText(args: {
  visualSummary?: string;
  searchQuery?: string;
  scriptText?: string;
  theme?: string;
  niche?: string;
  userContext?: string;
}): string {
  return [
    (args.userContext ?? "").trim(),
    (args.visualSummary ?? "").trim() ||
      (args.searchQuery ?? "").trim() ||
      (args.scriptText ?? "").trim(),
    (args.theme ?? "").trim(),
    (args.niche ?? "").trim(),
  ]
    .filter(Boolean)
    .join(" | ");
}

function mapVideoToClip(video: {
  id: number;
  thumbnailUrl: string;
  previewUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  sourceUrl: string;
  photographerName: string;
  photographerUrl: string;
  provider?: "pexels" | "pixabay";
  matchConfidence?: "high" | "approximate";
}): BrollClip {
  return {
    id: video.id,
    thumbnailUrl: video.thumbnailUrl,
    previewUrl: video.previewUrl,
    durationSeconds: video.durationSeconds,
    width: video.width,
    height: video.height,
    sourceUrl: video.sourceUrl,
    photographerName: video.photographerName,
    photographerUrl: video.photographerUrl,
    provider: video.provider ?? "pexels",
    matchConfidence: video.matchConfidence ?? "high",
  };
}

export async function suggestBrollForScript(args: {
  content: string;
  niche?: string;
  clipsPerBeat?: number;
}): Promise<SuggestBrollResult> {
  const content = args.content.trim();
  if (!content) {
    return { beats: [], attributionNote: "", theme: "" };
  }

  const clipsPerBeat = Math.min(Math.max(args.clipsPerBeat ?? 1, 1), 3);
  const { theme, beats: scriptBeats } = await splitScriptIntoBeats(
    content,
    args.niche
  );

  const usedUrls = new Set<string>();
  const beats: BrollBeat[] = [];

  for (const beat of scriptBeats) {
    const query = beatStockSearchQuery(beat);
    const relevanceText = beatRelevanceText({
      visualSummary: beat.visualSummary,
      searchQuery: beat.searchQuery,
      scriptText: beat.scriptText,
      theme,
      niche: args.niche,
    });

    const clips: BrollClip[] = [];
    for (let i = 0; i < clipsPerBeat; i++) {
      const beatQuery = query || beat.visualSummary;
      const video = await searchStockVideoForBeat(beatQuery, usedUrls, {
        relevanceText: relevanceText || beatQuery,
      });
      if (!video) break;
      usedUrls.add(video.previewUrl);
      usedUrls.add(video.sourceUrl);
      clips.push(mapVideoToClip(video));
    }

    beats.push({
      index: beat.index,
      scriptText: beat.scriptText,
      visualSummary: beat.visualSummary,
      searchQuery: beat.searchQuery,
      clips,
    });
  }

  return {
    beats,
    attributionNote: "",
    theme,
  };
}

/**
 * Re-search stock video for a single beat (no LLM split).
 *
 * Product decision: does NOT increment brollGenerationCount. Full
 * suggestBroll still gates usage; per-beat re-search is currently unlimited
 * and can get a light limit later if needed.
 */
export async function regenerateBrollBeat(args: {
  searchQuery: string;
  visualSummary?: string;
  niche?: string;
  theme?: string;
  excludeUrls?: string[];
  clipsPerBeat?: number;
  /** Extra user hint, e.g. "commercial kitchen", merged into the stock query. */
  userContext?: string;
}): Promise<{ clips: BrollClip[] }> {
  const clipsPerBeat = Math.min(Math.max(args.clipsPerBeat ?? 1, 1), 3);
  const beatQuery =
    args.searchQuery.trim() || (args.visualSummary ?? "").trim();
  // Stock API: clean beat query + optional user context only (no theme/niche).
  const query = mergeUserContextIntoQuery(beatQuery, args.userContext);

  const usedUrls = new Set<string>(
    (args.excludeUrls ?? []).map((u) => u.trim()).filter(Boolean)
  );

  const relevanceText = beatRelevanceText({
    userContext: args.userContext,
    visualSummary: args.visualSummary,
    searchQuery: args.searchQuery,
    theme: args.theme,
    niche: args.niche,
  });

  const clips: BrollClip[] = [];
  for (let i = 0; i < clipsPerBeat; i++) {
    const video = await searchStockVideoForBeat(query || beatQuery, usedUrls, {
      relevanceText: relevanceText || query || beatQuery,
    });
    if (!video) break;
    usedUrls.add(video.previewUrl);
    usedUrls.add(video.sourceUrl);
    clips.push(mapVideoToClip(video));
  }

  return { clips };
}
