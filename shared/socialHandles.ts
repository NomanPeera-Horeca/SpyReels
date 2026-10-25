/**
 * Handle checks for public profile lookup.
 * Each rule matches what that platform actually accepts.
 * Callers should normalize first. Lookup still decides if the account exists.
 */

export const INSTAGRAM_HANDLE_INVALID_MESSAGE =
  "That's not a valid Instagram handle. Check for typos.";

export const TIKTOK_HANDLE_INVALID_MESSAGE =
  "That's not a valid TikTok username. Check for typos.";

export const YOUTUBE_HANDLE_INVALID_MESSAGE =
  "That's not a valid YouTube handle. Check for typos.";

/**
 * Instagram: 1-30 chars. Letters, numbers, periods, underscores.
 * Underscores can lead, trail, or repeat. A period cannot lead, trail, or repeat.
 */
const INSTAGRAM_HANDLE =
  /^(?!.*\.\.)(?!\.)(?!.*\.$)[a-z0-9._]{1,30}$/i;

/** TikTok: 2-24 chars. Letters, numbers, periods, and underscores anywhere. */
const TIKTOK_HANDLE = /^[a-z0-9._]{2,24}$/i;

/**
 * YouTube handles: letters in any language, numbers, periods, underscores,
 * hyphens, and the middle dot. 2-100 so short handles and longer custom URLs both pass.
 */
const YOUTUBE_HANDLE = /^[\p{L}\p{N}._\-\u00B7]{2,100}$/u;

export function normalizeInstagramHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/instagram\.com\/([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/^@+/, "").trim().toLowerCase();
}

export function isValidInstagramHandleNormalized(handle: string): boolean {
  return INSTAGRAM_HANDLE.test(handle);
}

export function normalizeTikTokHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(/tiktok\.com\/@([^/?#\s]+)/i);
  return (fromUrl ? fromUrl[1] : trimmed).replace(/^@+/, "").trim().toLowerCase();
}

export function isValidTikTokHandleNormalized(handle: string): boolean {
  return TIKTOK_HANDLE.test(handle);
}

export function normalizeYouTubeHandle(raw: string): string {
  const trimmed = raw.trim();
  const fromUrl = trimmed.match(
    /youtube\.com\/(?:@|channel\/|c\/|user\/)([^/?#\s]+)/i
  );
  const value = (fromUrl ? fromUrl[1] : trimmed).replace(/^@+/, "").trim();
  if (/^UC[A-Za-z0-9_-]{22}$/.test(value)) return value;
  return value.toLowerCase();
}

export function isValidYouTubeHandleNormalized(handle: string): boolean {
  if (!YOUTUBE_HANDLE.test(handle)) return false;
  return /[\p{L}\p{N}]/u.test(handle);
}
