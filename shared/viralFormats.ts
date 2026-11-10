/** Format labels for viral library videos: how the video is made, not what it is about. */
export const VIRAL_VIDEO_FORMATS = [
  "tutorial",
  "listicle",
  "story",
  "talking_head_opinion",
  "skit",
  "before_after",
  "reaction",
  "day_in_the_life",
  "product_demo",
  "interview",
  "voiceover_broll",
  "trend_challenge",
  "other",
] as const;

export type ViralVideoFormat = (typeof VIRAL_VIDEO_FORMATS)[number];

export function cleanViralFormat(value: unknown): ViralVideoFormat {
  const v = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  return (VIRAL_VIDEO_FORMATS as readonly string[]).includes(v) ? (v as ViralVideoFormat) : "other";
}
