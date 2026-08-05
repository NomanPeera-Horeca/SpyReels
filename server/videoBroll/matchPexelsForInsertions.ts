/**
 * Resolve Pexels clips for each LLM insertion point (in-job URL dedupe).
 */

import { searchPexelsVideoForBeat } from "../broll/searchPexelsVideo";
import type { VideoBrollInsertionPoint } from "../../shared/videoBroll";

export async function matchPexelsForInsertions(
  points: Array<
    Pick<VideoBrollInsertionPoint, "timestampSeconds" | "reason" | "searchQuery">
  >
): Promise<VideoBrollInsertionPoint[]> {
  const usedUrls = new Set<string>();
  const results: VideoBrollInsertionPoint[] = [];

  for (const point of points) {
    const video = await searchPexelsVideoForBeat(point.searchQuery, usedUrls);
    if (video) {
      usedUrls.add(video.previewUrl);
      usedUrls.add(video.sourceUrl);
      results.push({
        ...point,
        pexelsClipUrl: video.previewUrl,
        pexelsClipId: video.id,
      });
    } else {
      results.push({
        ...point,
        pexelsClipUrl: null,
        pexelsClipId: null,
      });
    }
  }

  return results;
}
