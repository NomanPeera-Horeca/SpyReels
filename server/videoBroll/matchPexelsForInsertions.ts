/**
 * Resolve stock clips for each LLM insertion point (in-job URL dedupe).
 * Pexels first, Pixabay fallback via searchStockVideoForBeat.
 */

import { searchStockVideoForBeat } from "../broll/searchStockVideoForBeat";
import type { VideoBrollInsertionPoint } from "../../shared/videoBroll";

export async function matchPexelsForInsertions(
  points: Array<
    Pick<VideoBrollInsertionPoint, "timestampSeconds" | "reason" | "searchQuery">
  >
): Promise<VideoBrollInsertionPoint[]> {
  const usedUrls = new Set<string>();
  const results: VideoBrollInsertionPoint[] = [];

  for (const point of points) {
    const video = await searchStockVideoForBeat(point.searchQuery, usedUrls, {
      relevanceText: point.searchQuery || point.reason,
    });
    if (video) {
      usedUrls.add(video.previewUrl);
      usedUrls.add(video.sourceUrl);
      results.push({
        ...point,
        pexelsClipUrl: video.previewUrl,
        pexelsClipId: video.id,
        clipProvider: video.provider,
      });
    } else {
      results.push({
        ...point,
        pexelsClipUrl: null,
        pexelsClipId: null,
        clipProvider: null,
      });
    }
  }

  return results;
}
