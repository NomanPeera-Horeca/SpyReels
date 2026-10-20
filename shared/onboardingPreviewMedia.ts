/**
 * Lightweight onboarding preview loops. The original finder files stay on R2.
 * These derivatives are short, muted, and small enough to paint with the form.
 * Posters are frames from those same videos, including the verified YouTube thumb.
 */
import type { OnboardingStackAttempt, OnboardingStackSlot } from "./onboardingViralStack";

const PREVIEW_IDS = {
  instagram: ["DbZX-NDMfpK", "DOnRzGjjNEI"],
  tiktok: ["7694438544479128845", "7693423551843519757"],
} as const;

export type OnboardingPreviewMedia = {
  videoUrl: string;
  posterUrl: string;
};

export function onboardingPreviewMedia(
  platform: "instagram" | "tiktok",
  id: string
): OnboardingPreviewMedia | null {
  const safe = id.trim();
  if (!(PREVIEW_IDS[platform] as readonly string[]).includes(safe)) return null;
  const base = `/onboarding-previews/${platform}/${safe}`;
  return { videoUrl: `${base}.mp4`, posterUrl: `${base}.jpg` };
}

/** Genuine posters for the five Figma positions, used before the catalog responds. */
export const ONBOARDING_VERIFIED_POSTERS: readonly OnboardingStackAttempt[] = [
  {
    id: "DbZX-NDMfpK",
    thumbnailUrl: "/onboarding-previews/instagram/DbZX-NDMfpK.jpg",
    videoUrl: "/onboarding-previews/instagram/DbZX-NDMfpK.mp4",
    youtubeVideoId: null,
  },
  {
    id: "7694438544479128845",
    thumbnailUrl: "/onboarding-previews/tiktok/7694438544479128845.jpg",
    videoUrl: "/onboarding-previews/tiktok/7694438544479128845.mp4",
    youtubeVideoId: null,
  },
  {
    id: "f7y2XikE7sY",
    thumbnailUrl: "/onboarding-previews/youtube/f7y2XikE7sY.jpg",
    videoUrl: null,
    youtubeVideoId: "f7y2XikE7sY",
  },
  {
    id: "DOnRzGjjNEI",
    thumbnailUrl: "/onboarding-previews/instagram/DOnRzGjjNEI.jpg",
    videoUrl: "/onboarding-previews/instagram/DOnRzGjjNEI.mp4",
    youtubeVideoId: null,
  },
  {
    id: "7693423551843519757",
    thumbnailUrl: "/onboarding-previews/tiktok/7693423551843519757.jpg",
    videoUrl: "/onboarding-previews/tiktok/7693423551843519757.mp4",
    youtubeVideoId: null,
  },
];

/**
 * Catalog attempts when they include a real thumbnail, with the verified
 * poster kept behind them. An empty catalog slot still returns that poster.
 */
export function attemptsForStackSlot(
  slot: OnboardingStackSlot | null | undefined,
  index: number
): OnboardingStackAttempt[] {
  const fallback = ONBOARDING_VERIFIED_POSTERS[index];
  if (!fallback) return [];
  const remote = (slot?.attempts ?? []).filter((attempt) => {
    const thumb = attempt.thumbnailUrl.trim();
    return thumb.length > 0 && thumb !== fallback.thumbnailUrl;
  });
  if (remote.length === 0) return [{ ...fallback }];
  if (remote.some((attempt) => attempt.id === fallback.id)) return remote;
  return [...remote, { ...fallback }];
}
