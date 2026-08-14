/**
 * Parse Instagram / TikTok / YouTube short-form video URLs for Collected Reels.
 */

import {
  canonicalInstagramReelUrl,
  parseInstagramReelShortcode,
} from "./instagramUrl";

export type CollectedVideoPlatform = "instagram" | "tiktok" | "youtube";

export type ParsedCollectedVideoUrl = {
  platform: CollectedVideoPlatform;
  externalId: string;
  canonicalUrl: string;
};

const TIKTOK_VIDEO_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\/@[^/?#\s]+\/video\/(\d+)/i;
const TIKTOK_SHORT_RE =
  /(?:https?:\/\/)?(?:vm|vt)\.tiktok\.com\/([A-Za-z0-9]+)/i;
const YOUTUBE_SHORTS_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_WATCH_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#\s]*&)?v=([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_BE_RE =
  /(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{6,})/i;

async function resolveRedirectUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(trimmed, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
    });
    clearTimeout(t);
    return res.url?.trim() || trimmed;
  } catch {
    return trimmed;
  }
}

function parseTikTok(input: string): ParsedCollectedVideoUrl | null {
  const m = input.match(TIKTOK_VIDEO_RE);
  if (m?.[1]) {
    const awemeId = m[1];
    const userMatch = input.match(/tiktok\.com\/@([^/?#\s]+)\/video\//i);
    const user = userMatch?.[1] ? encodeURIComponent(userMatch[1]) : "video";
    return {
      platform: "tiktok",
      externalId: awemeId,
      canonicalUrl: `https://www.tiktok.com/@${user}/video/${awemeId}`,
    };
  }
  return null;
}

function parseYouTube(input: string): ParsedCollectedVideoUrl | null {
  const id =
    input.match(YOUTUBE_SHORTS_RE)?.[1] ||
    input.match(YOUTUBE_WATCH_RE)?.[1] ||
    input.match(YOUTUBE_BE_RE)?.[1] ||
    null;
  if (!id) return null;
  return {
    platform: "youtube",
    externalId: id,
    canonicalUrl: `https://www.youtube.com/shorts/${id}`,
  };
}

function parseInstagram(input: string): ParsedCollectedVideoUrl | null {
  const shortcode = parseInstagramReelShortcode(input);
  if (!shortcode) return null;
  return {
    platform: "instagram",
    externalId: shortcode,
    canonicalUrl: canonicalInstagramReelUrl(shortcode, input),
  };
}

/** Sync parse for known long-form URLs (no short-link expand). */
export function parseCollectedVideoUrlSync(
  input: string
): ParsedCollectedVideoUrl | null {
  const s = input.trim();
  if (!s) return null;
  return parseTikTok(s) || parseYouTube(s) || parseInstagram(s);
}

/**
 * Parse a pasted or Telegram-shared URL. Resolves TikTok short links (vm/vt)
 * via redirect before extracting the aweme id.
 */
export async function parseCollectedVideoUrl(
  input: string
): Promise<ParsedCollectedVideoUrl | null> {
  const s = input.trim();
  if (!s) return null;

  const direct = parseCollectedVideoUrlSync(s);
  if (direct) return direct;

  if (TIKTOK_SHORT_RE.test(s) || /tiktok\.com\/t\//i.test(s)) {
    const resolved = await resolveRedirectUrl(s);
    return parseTikTok(resolved) || parseCollectedVideoUrlSync(resolved);
  }

  return null;
}

export function extractAllCollectedVideoUrls(text: string): ParsedCollectedVideoUrl[] {
  const found: ParsedCollectedVideoUrl[] = [];
  const seen = new Set<string>();

  const candidates = text.match(
    /https?:\/\/[^\s<>"')\]]+/gi
  ) ?? [];

  for (const raw of candidates) {
    const cleaned = raw.replace(/[.,;:!?)]+$/, "");
    const parsed = parseCollectedVideoUrlSync(cleaned);
    if (!parsed) continue;
    const key = `${parsed.platform}:${parsed.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(parsed);
  }

  // Bare Instagram shortcodes still supported for Telegram paste quirks
  if (found.length === 0) {
    const ig = parseInstagram(text.trim());
    if (ig) found.push(ig);
  }

  return found;
}
