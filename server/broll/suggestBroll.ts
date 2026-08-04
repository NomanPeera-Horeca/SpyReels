/**
 * Orchestrate beat split + Pexels video search with in-job clip dedupe.
 */

import {
  type BrollBeat,
  type SuggestBrollResult,
} from "../../shared/broll";
import { searchPexelsVideoForBeat } from "./searchPexelsVideo";
import { splitScriptIntoBeats } from "./splitScriptIntoBeats";

/** Prefix theme onto a beat query when it is not already present. */
function buildSearchQuery(theme: string, beatQuery: string, niche?: string): string {
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

export async function suggestBrollForScript(args: {
  content: string;
  niche?: string;
  clipsPerBeat?: number;
}): Promise<SuggestBrollResult> {
  const content = args.content.trim();
  if (!content) {
    return { beats: [], attributionNote: "" };
  }

  const clipsPerBeat = Math.min(Math.max(args.clipsPerBeat ?? 1, 1), 3);
  const { theme, beats: scriptBeats } = await splitScriptIntoBeats(
    content,
    args.niche
  );

  const usedUrls = new Set<string>();
  const beats: BrollBeat[] = [];

  for (const beat of scriptBeats) {
    const query = buildSearchQuery(theme, beat.searchQuery || beat.visualSummary, args.niche);

    const clips = [];
    for (let i = 0; i < clipsPerBeat; i++) {
      const video = await searchPexelsVideoForBeat(query || beat.visualSummary, usedUrls);
      if (!video) break;
      usedUrls.add(video.previewUrl);
      usedUrls.add(video.sourceUrl);
      clips.push({
        id: video.id,
        thumbnailUrl: video.thumbnailUrl,
        previewUrl: video.previewUrl,
        durationSeconds: video.durationSeconds,
        width: video.width,
        height: video.height,
        sourceUrl: video.sourceUrl,
        photographerName: video.photographerName,
        photographerUrl: video.photographerUrl,
      });
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
  };
}
