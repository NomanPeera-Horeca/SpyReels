/**
 * Lightweight onboarding preview loops. The original finder files stay on R2.
 * These derivatives are short, muted, and small enough to paint with the form.
 */
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
