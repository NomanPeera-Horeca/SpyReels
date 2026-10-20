import { needsVideoUrlRefresh } from "./mediaUrl";

export const ONBOARDING_STACK_QUOTA = {
  instagram: 2,
  tiktok: 2,
  youtube: 1,
} as const;

/** Display order across the five tilted cards. */
export const ONBOARDING_STACK_ORDER = [
  "instagram",
  "tiktok",
  "youtube",
  "instagram",
  "tiktok",
] as const;

export type OnboardingStackPlatform = "instagram" | "tiktok" | "youtube";

export type OnboardingStackCandidate = {
  platform: OnboardingStackPlatform;
  id: string;
  creatorKey: string;
  thumbnailUrl: string;
  /** Durable file URL. Null for YouTube and for rows that cannot play a file. */
  videoUrl: string | null;
  youtubeVideoId: string | null;
  durationSec: number | null;
  views: number;
};

export type OnboardingStackAttempt = {
  id: string;
  thumbnailUrl: string;
  videoUrl: string | null;
  youtubeVideoId: string | null;
};

export type OnboardingStackSlot = {
  platform: OnboardingStackPlatform;
  attempts: OnboardingStackAttempt[];
};

export type OnboardingViralStack = {
  slots: OnboardingStackSlot[];
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,}$/;
const PREVIEW_ASSET =
  /^\/onboarding-previews\/(?:instagram|tiktok)\/[A-Za-z0-9_-]+\.(?:mp4|jpg)$/;

/** Same-origin preview loops and posters, or an https finder URL. */
export function onboardingStackAssetUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value || value.includes("..") || value.includes("\\")) return null;
  if (PREVIEW_ASSET.test(value)) return value;
  return httpsUrl(value);
}

function isCompact(row: OnboardingStackCandidate): boolean {
  const cap = row.platform === "youtube" ? 60 : 90;
  return row.durationSec != null && row.durationSec > 0 && row.durationSec <= cap;
}

function httpsUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isPlayableStackCandidate(row: OnboardingStackCandidate): boolean {
  const thumb = onboardingStackAssetUrl(row.thumbnailUrl);
  if (!thumb) return false;
  if (row.platform === "youtube") {
    const id = (row.youtubeVideoId ?? "").trim();
    return YOUTUBE_ID.test(id);
  }
  const video = onboardingStackAssetUrl(row.videoUrl);
  if (!video || !video.endsWith(".mp4")) return false;
  if (video.startsWith("/onboarding-previews/")) return true;
  return !needsVideoUrlRefresh(video);
}

function sortCandidates(rows: OnboardingStackCandidate[]): OnboardingStackCandidate[] {
  return [...rows].sort((a, b) => {
    if (a.platform !== "youtube" && b.platform !== "youtube") {
      const aShort = isCompact(a) ? 0 : 1;
      const bShort = isCompact(b) ? 0 : 1;
      if (aShort !== bShort) return aShort - bShort;
    }
    if (a.platform === "youtube" && b.platform === "youtube") {
      const aShort = isCompact(a) ? 0 : 1;
      const bShort = isCompact(b) ? 0 : 1;
      if (aShort !== bShort) return aShort - bShort;
    }
    if (b.views !== a.views) return b.views - a.views;
    const aDur = a.durationSec ?? Number.POSITIVE_INFINITY;
    const bDur = b.durationSec ?? Number.POSITIVE_INFINITY;
    return aDur - bDur;
  });
}

function takeQuota(
  rows: OnboardingStackCandidate[],
  quota: number
): OnboardingStackCandidate[] {
  const playable = sortCandidates(rows.filter(isPlayableStackCandidate));
  const picked: OnboardingStackCandidate[] = [];
  const creators = new Set<string>();
  for (const row of playable) {
    if (picked.length >= quota) break;
    const creator = row.creatorKey.trim().toLowerCase();
    if (!creator || creators.has(creator)) continue;
    creators.add(creator);
    picked.push(row);
  }
  for (const row of playable) {
    if (picked.length >= quota) break;
    if (picked.some((item) => item.id === row.id)) continue;
    picked.push(row);
  }
  return picked;
}

function toAttempt(row: OnboardingStackCandidate): OnboardingStackAttempt {
  return {
    id: row.id,
    thumbnailUrl: onboardingStackAssetUrl(row.thumbnailUrl) ?? "",
    videoUrl: row.platform === "youtube" ? null : onboardingStackAssetUrl(row.videoUrl),
    youtubeVideoId: row.platform === "youtube" ? (row.youtubeVideoId ?? "").trim() : null,
  };
}

/**
 * Always five positions in Figma order. A missing platform stays an empty
 * slot so the cards beside it do not shift into its place.
 */
export function alignOnboardingStackSlots(
  slots: OnboardingStackSlot[]
): Array<OnboardingStackSlot | null> {
  const queues: Record<OnboardingStackPlatform, OnboardingStackSlot[]> = {
    instagram: [],
    tiktok: [],
    youtube: [],
  };
  for (const slot of slots) queues[slot.platform].push(slot);
  const cursor: Record<OnboardingStackPlatform, number> = {
    instagram: 0,
    tiktok: 0,
    youtube: 0,
  };
  return ONBOARDING_STACK_ORDER.map((platform) => {
    const slot = queues[platform][cursor[platform]] ?? null;
    cursor[platform] += 1;
    return slot;
  });
}

/**
 * Pick 2 Instagram, 2 TikTok and 1 YouTube from already-playable finder rows.
 * Each slot keeps one same-platform spare so a failed file can swap without
 * another request. Ephemeral CDN URLs are not playable.
 */
export function selectOnboardingViralStack(
  rows: OnboardingStackCandidate[]
): OnboardingViralStack {
  const byPlatform: Record<OnboardingStackPlatform, OnboardingStackCandidate[]> = {
    instagram: [],
    tiktok: [],
    youtube: [],
  };
  for (const row of rows) {
    byPlatform[row.platform].push(row);
  }

  const picked: Record<OnboardingStackPlatform, OnboardingStackCandidate[]> = {
    instagram: takeQuota(byPlatform.instagram, ONBOARDING_STACK_QUOTA.instagram + 2),
    tiktok: takeQuota(byPlatform.tiktok, ONBOARDING_STACK_QUOTA.tiktok + 2),
    youtube: takeQuota(byPlatform.youtube, ONBOARDING_STACK_QUOTA.youtube + 1),
  };
  const primaries: Record<OnboardingStackPlatform, OnboardingStackCandidate[]> = {
    instagram: picked.instagram.slice(0, ONBOARDING_STACK_QUOTA.instagram),
    tiktok: picked.tiktok.slice(0, ONBOARDING_STACK_QUOTA.tiktok),
    youtube: picked.youtube.slice(0, ONBOARDING_STACK_QUOTA.youtube),
  };
  const spares: Record<OnboardingStackPlatform, OnboardingStackCandidate[]> = {
    instagram: picked.instagram.slice(ONBOARDING_STACK_QUOTA.instagram),
    tiktok: picked.tiktok.slice(ONBOARDING_STACK_QUOTA.tiktok),
    youtube: picked.youtube.slice(ONBOARDING_STACK_QUOTA.youtube),
  };
  const primaryCursor: Record<OnboardingStackPlatform, number> = {
    instagram: 0,
    tiktok: 0,
    youtube: 0,
  };
  const spareCursor: Record<OnboardingStackPlatform, number> = {
    instagram: 0,
    tiktok: 0,
    youtube: 0,
  };

  const slots: OnboardingStackSlot[] = [];
  for (const platform of ONBOARDING_STACK_ORDER) {
    const primary = primaries[platform][primaryCursor[platform]];
    if (!primary) continue;
    primaryCursor[platform] += 1;
    const spare = spares[platform][spareCursor[platform]];
    if (spare) spareCursor[platform] += 1;
    slots.push({
      platform,
      attempts: spare ? [toAttempt(primary), toAttempt(spare)] : [toAttempt(primary)],
    });
  }

  return { slots };
}
