/**
 * Public profile preview shown on onboarding step 2 ("Is this you?").
 *
 * Every field is optional except platform and handle: the preview renders
 * only what the provider actually returned and never fills gaps with
 * example numbers. A missing count is hidden, not shown as 0.
 */
import type { SocialPlatform } from "./model";

export type PublicProfilePost = {
  id: string;
  thumbnailUrl: string | null;
  /** Real view or play count from the provider, or null when unknown. */
  viewCount: number | null;
  isPinned?: boolean;
  /** Caption from the same profile payload, when the provider included one. */
  caption?: string | null;
};

export type PublicProfilePreview = {
  platform: SocialPlatform;
  /** Canonical handle without the leading @. */
  handle: string;
  displayName: string | null;
  bio: string | null;
  /** Instagram category line, e.g. "Entrepreneur". */
  category: string | null;
  externalUrl: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  isVerified: boolean;
  isPrivate: boolean;
  postCount: number | null;
  followerCount: number | null;
  followingCount: number | null;
  /** TikTok total likes. */
  likeCount: number | null;
  /** YouTube video count. */
  videoCount: number | null;
  /** Most recent public posts, newest first. Empty when not available. */
  recentPosts: PublicProfilePost[];
  /**
   * Captions already present in the profile payload, including posts that had
   * no thumbnail. Empty or omitted when the provider sent none. Not a scrape.
   */
  lookupCaptions?: string[];
};

function trimZero(s: string): string {
  return s.replace(/\.0$/, "");
}

function compactFrom(value: number, threshold: number): string {
  if (!Number.isFinite(value) || value < 0) return "";
  if (value >= 1_000_000) {
    const v = value / 1_000_000;
    return `${trimZero(v.toFixed(v >= 100 ? 0 : 1))}M`;
  }
  if (value >= threshold) {
    const v = value / 1_000;
    return `${trimZero(v.toFixed(v >= 100 ? 0 : 1))}K`;
  }
  return Math.round(value).toLocaleString("en-US");
}

/** Instagram and TikTok profile counts: 274, 1,075, 10.1K, 1.2M. */
export function formatProfileCount(value: number): string {
  return compactFrom(value, 10_000);
}

/** Grid view counts and YouTube: 860, 1.2K, 85K, 1.2M. */
export function formatViewCount(value: number): string {
  return compactFrom(value, 1_000);
}

/** "8 subscribers", "1 subscriber", "1.2K subscribers". */
export function formatUnit(value: number, singular: string, plural: string): string {
  return `${formatViewCount(value)} ${value === 1 ? singular : plural}`;
}

/** Bio as display lines; blank lines dropped, at most `max` lines. */
export function bioLines(bio: string | null, max = 4): string[] {
  if (!bio) return [];
  return bio
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Link shown like the apps do: no protocol, no trailing slash. */
export function displayUrl(url: string | null, maxLength = 36): string | null {
  if (!url) return null;
  const s = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
  if (!s) return null;
  return s.length > maxLength ? `${s.slice(0, maxLength - 3)}...` : s;
}
