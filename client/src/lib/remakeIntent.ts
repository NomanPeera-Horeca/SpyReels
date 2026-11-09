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

/** What the creator picked and typed in the Remake popup, kept per video. */
export type RemakeDraft = { mode: RemakeIntent["mode"]; angle: string };

/** External videos open on "Use my idea" (unchanged default). */
export const DEFAULT_REMAKE_DRAFT: RemakeDraft = { mode: "custom", angle: "" };

export const REMAKE_IDEA_MAX = 2000;

export function draftToIntent(draft: RemakeDraft): RemakeIntent | null {
  if (draft.mode === "niche") return { mode: "niche" };
  if (draft.mode === "same_topic") return { mode: "same_topic" };
  const angle = draft.angle.trim();
  return angle ? { mode: "custom", angle } : null;
}

const DRAFT_STORAGE_PREFIX = "spyreels:remake-draft:";

function isDraft(v: unknown): v is RemakeDraft {
  const d = v as RemakeDraft;
  return (
    !!d &&
    (d.mode === "custom" || d.mode === "same_topic" || d.mode === "niche") &&
    typeof d.angle === "string"
  );
}

/** The saved draft for one video (this browser tab), or the default. */
export function loadRemakeDraft(key: string): RemakeDraft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_PREFIX + key);
    const parsed = raw ? JSON.parse(raw) : null;
    if (isDraft(parsed)) return { mode: parsed.mode, angle: parsed.angle.slice(0, REMAKE_IDEA_MAX) };
  } catch {
    // Private mode or blocked storage: fall back to the default.
  }
  return DEFAULT_REMAKE_DRAFT;
}

export function saveRemakeDraft(key: string, draft: RemakeDraft): void {
  try {
    window.sessionStorage.setItem(DRAFT_STORAGE_PREFIX + key, JSON.stringify(draft));
  } catch {
    // Kept in memory for this page only.
  }
}

/** Typed request choice sent to recreate.generate (server: REMAKE_CHOICES). */
export type RemakeRequestChoice = "use_my_idea" | "keep_topic" | "adapt_niche";

export function remakeIntentToRequest(intent: RemakeIntent): {
  choice: RemakeRequestChoice;
  idea?: string;
} {
  if (intent.mode === "niche") return { choice: "adapt_niche" };
  if (intent.mode === "same_topic") return { choice: "keep_topic" };
  return { choice: "use_my_idea", idea: intent.angle.trim() };
}

/** One id per "Create remake" press; a repeat of the same press is not a new remake. */
export function newRemakeRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
