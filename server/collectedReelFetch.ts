/**
 * Collected Reels metadata fetch with provider fallback (ScrapeCreators standard → download_media).
 */

import {
  fetchReelByShortcodeResult,
  reelFetchFailureMessage,
  type ReelFetchFailureReason,
  type ReelFullData,
} from "./instagram";

export type CollectedReelFetchProvider = "scrapecreators" | "scrapecreators_download";

export type CollectedReelFetchOutcome =
  | { ok: true; data: ReelFullData; provider: CollectedReelFetchProvider }
  | { ok: false; reason: ReelFetchFailureReason; message: string };

export async function fetchCollectedReelMetadata(
  shortcode: string,
  preferUrl?: string
): Promise<CollectedReelFetchOutcome> {
  const primary = await fetchReelByShortcodeResult(shortcode, { preferUrl });
  if (primary.ok) {
    return { ok: true, data: primary.data, provider: "scrapecreators" };
  }

  const withMedia = await fetchReelByShortcodeResult(shortcode, {
    preferUrl,
    downloadMedia: true,
  });
  if (withMedia.ok) {
    return { ok: true, data: withMedia.data, provider: "scrapecreators_download" };
  }

  return {
    ok: false,
    reason: primary.reason,
    message: reelFetchFailureMessage(primary.reason),
  };
}
