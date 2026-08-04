/**
 * Orchestrate beat split + Pexels video search with in-job clip dedupe.
 */

import {
  type BrollBeat,
  type BrollClip,
  type SuggestBrollResult,
} from "../../shared/broll";
import { searchPexelsVideoForBeat } from "./searchPexelsVideo";
import { splitScriptIntoBeats } from "./splitScriptIntoBeats";

/** Prefix theme onto a beat query when it is not already present. */
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
    const query = buildSearchQuery(
      theme,
      beat.searchQuery || beat.visualSummary,
      args.niche
    );

    const clips: BrollClip[] = [];
    for (let i = 0; i < clipsPerBeat; i++) {
      const video = await searchPexelsVideoForBeat(
        query || beat.visualSummary,
        usedUrls
      );
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
 * Re-search Pexels for a single beat (no LLM split).
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
}): Promise<{ clips: BrollClip[] }> {
  const clipsPerBeat = Math.min(Math.max(args.clipsPerBeat ?? 1, 1), 3);
  const beatQuery =
    args.searchQuery.trim() || (args.visualSummary ?? "").trim();
  const query = buildSearchQuery(args.theme ?? "", beatQuery, args.niche);

  const usedUrls = new Set<string>(
    (args.excludeUrls ?? []).map((u) => u.trim()).filter(Boolean)
  );

  const clips: BrollClip[] = [];
  for (let i = 0; i < clipsPerBeat; i++) {
    const video = await searchPexelsVideoForBeat(query || beatQuery, usedUrls);
    if (!video) break;
    usedUrls.add(video.previewUrl);
    usedUrls.add(video.sourceUrl);
    clips.push(mapVideoToClip(video));
  }

  return { clips };
}
