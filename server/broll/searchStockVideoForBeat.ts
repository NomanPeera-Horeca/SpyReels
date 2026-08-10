/**
 * Unified stock video search: Pexels first, Pixabay only when Pexels +
 * relevance return nothing usable. Sequential fallback (not parallel).
 * Within each provider, relevance checks run in parallel (capped at 4).
 */

import { searchPexelsVideoForBeat } from "./searchPexelsVideo";
import { searchPixabayVideoForBeat } from "./searchPixabayVideo";
import type { StockVideoResult } from "./stockVideoTypes";

export type SearchStockVideoForBeatOptions = {
  /** Beat / visual intent text for Haiku relevance on both providers. */
  relevanceText?: string;
};

/**
 * Try Pexels (with relevance). On null, try Pixabay with the same query and
 * the same relevance check. Returns null when neither provider has a match.
 */
export async function searchStockVideoForBeat(
  query: string,
  excludeUrls: Set<string>,
  options: SearchStockVideoForBeatOptions = {}
): Promise<StockVideoResult | null> {
  const relevanceText = (options.relevanceText ?? query).trim();
  const opts = { relevanceText };

  const fromPexels = await searchPexelsVideoForBeat(query, excludeUrls, opts);
  if (fromPexels) return fromPexels;

  return searchPixabayVideoForBeat(query, excludeUrls, opts);
}
