/**
 * Step 2 "Is this you?" profile lookup (REUSE of the existing provider
 * integrations, no new provider).
 *
 * - Instagram: resolveInstagramIdentity (same as scrape.profilePreview).
 *   Recent post thumbnails come from the SAME profile response.
 * - TikTok: fetchTikTokProfile (same as tiktokScrape.publicProfilePreview).
 * - YouTube: fetchYouTubeChannel (the existing channel call used by scraping).
 *
 * Cost protection: every lookup runs inside the ScrapeCreators meter with a
 * small request budget, and each user has a per-hour lookup limit. Nothing
 * here touches research credits.
 *
 * Data rule: only provider values are returned. Missing values stay null.
 */
import type { SocialPlatform } from "@shared/personalization/model";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import { withScrapeCreatorsMeter, type ScrapeCreatorsMeterReport } from "../../scrapeCreatorsMeter";

/** Provider requests allowed for one lookup (IG may need search + by-id). */
export const PROFILE_LOOKUP_REQUEST_BUDGET = 8;
/** Lookups per user per rolling hour. */
export const PROFILE_LOOKUPS_PER_HOUR = 20;

export type ProfileLookupFailure = "not_found" | "private" | "error" | "rate_limited";

export type ProfileLookupResult =
  | { ok: true; profile: PublicProfilePreview; meter: ScrapeCreatorsMeterReport }
  | { ok: false; reason: ProfileLookupFailure; meter: ScrapeCreatorsMeterReport | null };

export type ProfileLookupDeps = {
  instagram: (handle: string) => Promise<{
    username: string;
    fullName: string;
    biography: string;
    profilePicUrl: string;
    followerCount: number;
    followingCount: number;
    postCount: number;
    isVerified: boolean;
    isPrivate: boolean;
    category: string;
    externalUrl: string;
    userId: string;
    recentMedia?: Array<{
      shortcode: string;
      thumbnailUrl: string;
      viewCount: number | null;
      isPinned: boolean;
    }>;
  }>;
  tiktok: (handle: string) => Promise<{
    userId: string;
    uniqueId: string;
    nickname: string;
    biography?: string;
    isPrivate: boolean;
    followerCount: number;
    followingCount: number;
    videoCount: number;
    heartCount: number;
    avatarUrl: string;
    isVerified?: boolean;
  }>;
  youtube: (handle: string) => Promise<{
    channelId: string;
    handle: string;
    name: string;
    isVerified: boolean;
    subscriberCount: number;
    description: string;
    avatarUrl: string;
  }>;
  mirrorAvatar: (handle: string, url: string, platform: SocialPlatform) => Promise<string>;
  mirrorThumbnails: (
    items: Array<{ shortcode: string; thumbnailUrl: string }>
  ) => Promise<Map<string, string>>;
  /** Classifies a thrown provider error. */
  classify: (err: unknown) => "not_found" | "private" | "error";
};

const textOrNull = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/** Provider counts of 0 are kept (a real 0); negative or non-finite become null. */
const countOrNull = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

const lookupLog = new Map<number, number[]>();

/** Rolling one-hour limit per user. In memory: resets on deploy, bounded per instance. */
export function takeLookupSlot(userId: number, now = Date.now()): boolean {
  const hourAgo = now - 60 * 60 * 1000;
  const recent = (lookupLog.get(userId) ?? []).filter(t => t > hourAgo);
  if (recent.length >= PROFILE_LOOKUPS_PER_HOUR) {
    lookupLog.set(userId, recent);
    return false;
  }
  recent.push(now);
  lookupLog.set(userId, recent);
  return true;
}

export function resetLookupLimiterForTests(): void {
  lookupLog.clear();
}

async function fetchPreview(
  platform: SocialPlatform,
  handle: string,
  deps: ProfileLookupDeps
): Promise<PublicProfilePreview> {
  if (platform === "instagram") {
    const p = await deps.instagram(handle);
    const canonical = p.username.toLowerCase();
    const media = (p.recentMedia ?? []).slice(0, 6);
    const [avatar, thumbs] = await Promise.all([
      p.profilePicUrl ? deps.mirrorAvatar(canonical, p.profilePicUrl, "instagram") : Promise.resolve(""),
      media.length ? deps.mirrorThumbnails(media) : Promise.resolve(new Map<string, string>()),
    ]);
    return {
      platform,
      handle: canonical,
      displayName: textOrNull(p.fullName),
      bio: textOrNull(p.biography),
      category: textOrNull(p.category),
      externalUrl: textOrNull(p.externalUrl),
      avatarUrl: textOrNull(avatar),
      bannerUrl: null,
      isVerified: p.isVerified,
      isPrivate: p.isPrivate,
      postCount: countOrNull(p.postCount),
      followerCount: countOrNull(p.followerCount),
      followingCount: countOrNull(p.followingCount),
      likeCount: null,
      videoCount: null,
      recentPosts: media.map(m => ({
        id: m.shortcode,
        thumbnailUrl: textOrNull(thumbs.get(m.shortcode) ?? m.thumbnailUrl),
        viewCount: countOrNull(m.viewCount),
        isPinned: m.isPinned,
      })),
    };
  }
  if (platform === "tiktok") {
    const p = await deps.tiktok(handle);
    const canonical = (p.uniqueId || handle).toLowerCase();
    const avatar = p.avatarUrl ? await deps.mirrorAvatar(canonical, p.avatarUrl, "tiktok") : "";
    return {
      platform,
      handle: canonical,
      displayName: textOrNull(p.nickname),
      bio: textOrNull(p.biography),
      category: null,
      externalUrl: null,
      avatarUrl: textOrNull(avatar),
      bannerUrl: null,
      isVerified: Boolean(p.isVerified),
      isPrivate: p.isPrivate,
      postCount: countOrNull(p.videoCount),
      followerCount: countOrNull(p.followerCount),
      followingCount: countOrNull(p.followingCount),
      likeCount: countOrNull(p.heartCount),
      videoCount: null,
      recentPosts: [],
    };
  }
  const c = await deps.youtube(handle);
  const canonical = (c.handle || handle).toLowerCase();
  const avatar = c.avatarUrl ? await deps.mirrorAvatar(canonical, c.avatarUrl, "youtube") : "";
  return {
    platform,
    handle: canonical,
    displayName: textOrNull(c.name),
    bio: textOrNull(c.description),
    category: null,
    externalUrl: null,
    avatarUrl: textOrNull(avatar),
    bannerUrl: null,
    isVerified: c.isVerified,
    isPrivate: false,
    postCount: null,
    followerCount: countOrNull(c.subscriberCount),
    followingCount: null,
    likeCount: null,
    videoCount: null,
    recentPosts: [],
  };
}

export async function lookupPublicProfile(input: {
  userId: number;
  platform: SocialPlatform;
  handle: string;
  deps: ProfileLookupDeps;
  now?: number;
}): Promise<ProfileLookupResult> {
  if (!takeLookupSlot(input.userId, input.now)) {
    return { ok: false, reason: "rate_limited", meter: null };
  }
  const metered = await withScrapeCreatorsMeter(PROFILE_LOOKUP_REQUEST_BUDGET, () =>
    fetchPreview(input.platform, input.handle, input.deps)
  );
  if ("error" in metered) {
    return { ok: false, reason: input.deps.classify(metered.error), meter: metered.report };
  }
  if (metered.result.isPrivate) {
    return { ok: false, reason: "private", meter: metered.report };
  }
  return { ok: true, profile: metered.result, meter: metered.report };
}
