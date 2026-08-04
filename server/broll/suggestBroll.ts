/**
 * Orchestrate beat split + Pexels video search with in-job clip dedupe.
 */

import {
  BROLL_PEXELS_ATTRIBUTION,
  type BrollBeat,
  type SuggestBrollResult,
} from "../../shared/broll";
import { searchPexelsVideoForBeat } from "./searchPexelsVideo";
import { splitScriptIntoBeats } from "./splitScriptIntoBeats";

export async function suggestBrollForScript(args: {
  content: string;
  niche?: string;
  clipsPerBeat?: number;
}): Promise<SuggestBrollResult> {
  const content = args.content.trim();
  if (!content) {
    return { beats: [], attributionNote: BROLL_PEXELS_ATTRIBUTION };
  }

  const clipsPerBeat = Math.min(Math.max(args.clipsPerBeat ?? 1, 1), 3);
  const scriptBeats = await splitScriptIntoBeats(content, args.niche);

  const usedUrls = new Set<string>();
  const beats: BrollBeat[] = [];

  for (const beat of scriptBeats) {
    const query = [args.niche?.trim(), beat.searchQuery]
      .filter(Boolean)
      .join(" ")
      .trim();

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
    attributionNote: BROLL_PEXELS_ATTRIBUTION,
  };
}
