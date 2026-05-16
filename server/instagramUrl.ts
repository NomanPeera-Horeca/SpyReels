/**
 * Parse Instagram reel/post URLs from pasted text, Telegram messages, etc.
 * Supports username paths: instagram.com/{user}/reel/{shortcode}/
 */

const SHORTCODE = "([A-Za-z0-9_-]+)";
const IG_MEDIA_PATH = `(?:reels?|p|tv)\\/${SHORTCODE}`;
/** Optional profile segment before /reel/ or /p/ */
const IG_OPTIONAL_USER = "(?:[^/?#]+\\/)?";

export const INSTAGRAM_REEL_URL_REGEXES = [
  new RegExp(`instagram\\.com\\/${IG_OPTIONAL_USER}${IG_MEDIA_PATH}`, "i"),
  new RegExp(`instagr\\.am\\/${IG_OPTIONAL_USER}${IG_MEDIA_PATH}`, "i"),
];

export function parseInstagramReelShortcode(input: string): string | null {
  const s = input.trim();
  for (const pattern of INSTAGRAM_REEL_URL_REGEXES) {
    const m = s.match(pattern);
    if (m?.[1]) return m[1];
  }
  if (/^[A-Za-z0-9_-]{5,32}$/.test(s) && !s.includes("/") && !s.includes(".")) {
    return s;
  }
  return null;
}

export function extractAllInstagramReelShortcodes(text: string): string[] {
  const shortcodes = new Set<string>();
  for (const pattern of INSTAGRAM_REEL_URL_REGEXES) {
    const global = new RegExp(pattern.source, pattern.flags + "g");
    let match: RegExpExecArray | null;
    while ((match = global.exec(text)) !== null) {
      if (match[1]) shortcodes.add(match[1]);
    }
  }
  return Array.from(shortcodes);
}

export function canonicalInstagramReelUrl(shortcode: string, preferUrl?: string): string {
  const trimmed = preferUrl?.trim();
  if (trimmed && /instagram\.com|instagr\.am/i.test(trimmed)) {
    return trimmed;
  }
  return `https://www.instagram.com/reel/${shortcode}/`;
}
