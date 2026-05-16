/**
 * Shared logic for adding collected reels (Telegram, URL paste, etc.).
 * Failed or stuck pending rows can be re-fetched; only ready rows count as duplicates.
 */

import type { CollectedReel } from "../drizzle/schema";
import {
  createCollectedReel,
  getCollectedReelByShortcode,
  updateCollectedReel,
} from "./db";

export type CollectedReelSource = "telegram" | "url_paste" | "extension";

export type CollectedReelIngestResult =
  | { action: "created"; id: number }
  | { action: "retried"; id: number }
  | { action: "duplicate"; id: number };

/** Only successfully fetched reels block re-adding the same shortcode. */
export function collectedReelBlocksDuplicate(existing: CollectedReel): boolean {
  return existing.status === "ready";
}

export async function ingestCollectedReelByShortcode(opts: {
  userId: number;
  shortcode: string;
  reelUrl: string;
  source: CollectedReelSource;
  queueFetch: (reelId: number, shortcode: string, preferUrl: string) => void;
}): Promise<CollectedReelIngestResult> {
  const { userId, shortcode, reelUrl, source, queueFetch } = opts;
  const existing = await getCollectedReelByShortcode(userId, shortcode);

  if (existing && collectedReelBlocksDuplicate(existing)) {
    return { action: "duplicate", id: existing.id };
  }

  if (existing) {
    await updateCollectedReel(existing.id, {
      status: "pending",
      errorMessage: null,
      reelUrl,
      source,
    });
    queueFetch(existing.id, shortcode, reelUrl);
    return { action: "retried", id: existing.id };
  }

  const id = await createCollectedReel({
    userId,
    shortcode,
    reelUrl,
    source,
    status: "pending",
  });
  queueFetch(id, shortcode, reelUrl);
  return { action: "created", id };
}
