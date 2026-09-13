export type RemakeIntent =
  | { mode: "niche" }
  | { mode: "same_topic" }
  | { mode: "custom"; angle: string };

export type RemakeIntentMedia = {
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  shortcode?: string | null;
  reelId?: number | null;
  platform?: "instagram" | "tiktok" | "youtube";
  videoPageUrl?: string | null;
  originalUrl?: string | null;
  durationSec?: number | null;
};

export function remakeIntentToTopic(intent: RemakeIntent): string {
  if (intent.mode === "niche") return "";
  if (intent.mode === "same_topic") return "SAME_TOPIC";
  return intent.angle.trim();
}

export function isValidRemakeIntent(intent: RemakeIntent | null | undefined): boolean {
  if (!intent) return false;
  if (intent.mode !== "custom") return true;
  return intent.angle.trim().length > 0;
}
