import { scoreViralMetrics, TIER2_MIN_VIEWS } from "../discovery/scoring";
import { YOUTUBE_POOL_MIN_VIEWS } from "./youtubePoolDiscovery";

/**
 * Read-time and seed-admission check. Uses the gates Viral Posts already
 * uses for each platform. It does not add a Home-only view cutoff.
 *
 * TikTok search and Instagram Popular both require scoreViralMetrics
 * (tier 1 or tier 2). TikTok search also rejects a missing follower count.
 * Instagram hashtag discovery (scoreReelRelaxed) allows a missing follower
 * count only at the existing tier-2 view floor. YouTube search uses
 * YOUTUBE_POOL_MIN_VIEWS and does not require reach.
 */
export type IndexedViralMetrics = {
  platform: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  creatorFollowers: number | null;
};

function finiteOrZero(value: number | null): number {
  return value != null && Number.isFinite(value) && value > 0 ? value : 0;
}

export function passesIndexedViralQualification(input: IndexedViralMetrics): boolean {
  const platform = input.platform.trim().toLowerCase();
  const views = input.views;
  if (views == null || !Number.isFinite(views) || views <= 0) return false;

  if (platform === "youtube") return views >= YOUTUBE_POOL_MIN_VIEWS;

  const followers = input.creatorFollowers;
  if (followers != null && Number.isFinite(followers) && followers > 0) {
    return (
      scoreViralMetrics({
        views,
        likes: finiteOrZero(input.likes),
        comments: finiteOrZero(input.comments),
        followers,
      }) != null
    );
  }

  if (platform === "tiktok") return false;
  return views >= TIER2_MIN_VIEWS;
}

/** Seed scrapes must pass the same gate before a row is linked. */
export function qualifyAdaptedForSeedAdmission<T extends IndexedViralMetrics>(
  candidates: T[]
): T[] {
  return candidates.filter(candidate => passesIndexedViralQualification(candidate));
}
