/**
 * Unified stock video search: Pexels first, Pixabay only when Pexels has no
 * high-confidence match. Sequential fallback (not parallel).
 * Within each provider, relevance checks run in parallel (capped at 4).
 *
 * Returns null only when both providers return zero candidates. If candidates
 * exist but all fail relevance, returns the top-ranked clip from the first
 * provider that had results, marked matchConfidence: "approximate".
 */

import { searchPexelsVideoForBeat } from "./searchPexelsVideo";
import { searchPixabayVideoForBeat } from "./searchPixabayVideo";
import type { StockVideoResult } from "./stockVideoTypes";

export type SearchStockVideoForBeatOptions = {
  /** Beat / visual intent text for Haiku relevance on both providers. */
  relevanceText?: string;
};

/**
 * Prefer a high-confidence Pexels hit, then high-confidence Pixabay.
 * Fall back to an approximate clip from the first provider with results.
 * Null only when both providers are empty.
 */
export async function searchStockVideoForBeat(
  query: string,
  excludeUrls: Set<string>,
  options: SearchStockVideoForBeatOptions = {}
): Promise<StockVideoResult | null> {
  const relevanceText = (options.relevanceText ?? query).trim();
  const opts = { relevanceText };

  const fromPexels = await searchPexelsVideoForBeat(query, excludeUrls, opts);
  if (fromPexels.status === "high") return fromPexels.video;

  const fromPixabay = await searchPixabayVideoForBeat(query, excludeUrls, opts);
  if (fromPixabay.status === "high") return fromPixabay.video;

  if (fromPexels.status === "approximate") return fromPexels.video;
  if (fromPixabay.status === "approximate") return fromPixabay.video;

  return null;
}
