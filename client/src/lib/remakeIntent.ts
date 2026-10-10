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

export type RemakeIntentMediaInput = {
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  shortcode?: string | null;
  reelId?: number | null;
  platform?: string | null;
  videoPageUrl?: string | null;
  originalUrl?: string | null;
  reelUrl?: string | null;
  sourceUrl?: string | null;
  durationSec?: number | null;
  duration?: number | null;
};

/** Normalize source preview fields for RemakeIntentDialog from any Remake entry surface. */
export function buildRemakeIntentMedia(
  input: RemakeIntentMediaInput | null | undefined
): RemakeIntentMedia | null {
  if (!input) return null;
  const platformRaw = (input.platform ?? "instagram").toString().trim().toLowerCase();
  const platform: RemakeIntentMedia["platform"] =
    platformRaw === "tiktok" || platformRaw === "youtube" ? platformRaw : "instagram";
  const pageUrl =
    (input.videoPageUrl ?? "").trim() ||
    (input.originalUrl ?? "").trim() ||
    (input.reelUrl ?? "").trim() ||
    (input.sourceUrl ?? "").trim() ||
    null;
  const thumbnailUrl = (input.thumbnailUrl ?? "").trim() || null;
  const videoUrl = (input.videoUrl ?? "").trim() || null;
  const shortcode = (input.shortcode ?? "").trim() || null;
  const reelId = input.reelId ?? null;
  const durationSec = input.durationSec ?? input.duration ?? null;
  if (!thumbnailUrl && !videoUrl && !shortcode && !pageUrl && reelId == null) {
    return null;
  }
  return {
    thumbnailUrl,
    videoUrl,
    shortcode,
    reelId,
    platform,
    videoPageUrl: pageUrl,
    originalUrl: pageUrl,
    durationSec,
  };
}

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
