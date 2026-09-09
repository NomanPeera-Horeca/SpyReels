import { mirrorReelThumbnailsBounded } from "../discovery/mediaMirror";

/**
 * First day of the next calendar month in UTC, as an ISO string.
 * Used to compute when monthly quotas reset for messaging.
 */
export function firstDayOfNextMonthUtc(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 1)).toISOString();
}

/**
 * Mirror Search Reels thumbnails to R2 (same shortcode keyspace as Discovery/scrape).
 * First SEARCH_THUMB_MIRROR_SYNC results await so the visible grid gets durable URLs;
 * the rest mirror in the background so repeat searches hit R2 head cache.
 * Never throws: on mirror failure, original CDN URLs are kept.
 */
const SEARCH_THUMB_MIRROR_SYNC = 20;

export async function withSearchReelThumbnailMirroring<
  T extends { shortcode: string; thumbnailUrl: string },
>(reels: T[]): Promise<T[]> {
  if (reels.length === 0) return reels;

  const syncItems = reels.slice(0, SEARCH_THUMB_MIRROR_SYNC);
  const restItems = reels.slice(SEARCH_THUMB_MIRROR_SYNC);

  let stable = new Map<string, string>();
  try {
    stable = await mirrorReelThumbnailsBounded(
      syncItems.map((r) => ({
        shortcode: r.shortcode,
        thumbnailUrl: r.thumbnailUrl,
      }))
    );
  } catch (err) {
    console.error("[search] thumbnail mirror failed; serving CDN URLs", err);
  }

  if (restItems.length > 0) {
    void mirrorReelThumbnailsBounded(
      restItems.map((r) => ({
        shortcode: r.shortcode,
        thumbnailUrl: r.thumbnailUrl,
      }))
    ).catch((err) => {
      console.error("[search] background thumbnail mirror failed", err);
    });
  }

  return reels.map((r) => ({
    ...r,
    thumbnailUrl: stable.get(r.shortcode) ?? r.thumbnailUrl,
  }));
}
