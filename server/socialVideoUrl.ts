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

export type CollectedVideoUrlParseOptions = {
  /** Test seam for TikTok vm/vt and /t/ redirect expansion. */
  resolveRedirect?: (rawUrl: string) => Promise<string>;
};

const TIKTOK_VIDEO_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\/@[^/?#\s]+\/video\/(\d+)/i;
const TIKTOK_SHORT_RE =
  /(?:https?:\/\/)?(?:vm|vt)\.tiktok\.com\/([A-Za-z0-9]+)/i;
const YOUTUBE_SHORTS_RE =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_WATCH_RE =
  /(?:https?:\/\/)?(?:www\.|m\.|music\.)?youtube\.com\/watch\?(?:[^#\s]*&)?v=([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_LIVE_RE =
  /(?:https?:\/\/)?(?:www\.|m\.)?youtube\.com\/live\/([A-Za-z0-9_-]{6,})/i;
const YOUTUBE_BE_RE =
  /(?:https?:\/\/)?youtu\.be\/([A-Za-z0-9_-]{6,})/i;
const HTTP_URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

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

function cleanCandidateUrl(raw: string): string {
  return raw.trim().replace(/[.,;:!?)]+$/, "");
}

function candidateUrls(text: string): string[] {
  return text.match(HTTP_URL_RE)?.map(cleanCandidateUrl).filter(Boolean) ?? [];
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
  const shortsId = input.match(YOUTUBE_SHORTS_RE)?.[1];
  if (shortsId) {
    return {
      platform: "youtube",
      externalId: shortsId,
      canonicalUrl: `https://www.youtube.com/shorts/${shortsId}`,
    };
  }

  const id =
    input.match(YOUTUBE_WATCH_RE)?.[1] ||
    input.match(YOUTUBE_LIVE_RE)?.[1] ||
    input.match(YOUTUBE_BE_RE)?.[1] ||
    null;
  if (!id) return null;
  return {
    platform: "youtube",
    externalId: id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
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

/** Sync parse for known long-form URLs (no short-link expansion). */
export function parseCollectedVideoUrlSync(
  input: string
): ParsedCollectedVideoUrl | null {
  const s = input.trim();
  if (!s) return null;
  return parseTikTok(s) || parseYouTube(s) || parseInstagram(s);
}

/**
 * Parse a pasted or Telegram-shared URL. TikTok short links are resolved before
 * extracting the video id. Instagram and YouTube stay on the fast sync path.
 */
export async function parseCollectedVideoUrl(
  input: string,
  options: CollectedVideoUrlParseOptions = {}
): Promise<ParsedCollectedVideoUrl | null> {
  const s = input.trim();
  if (!s) return null;

  const direct = parseCollectedVideoUrlSync(s);
  if (direct) return direct;

  if (TIKTOK_SHORT_RE.test(s) || /tiktok\.com\/t\//i.test(s)) {
    const resolver = options.resolveRedirect ?? resolveRedirectUrl;
    const resolved = await resolver(s);
    return parseTikTok(resolved) || parseCollectedVideoUrlSync(resolved);
  }

  return null;
}

export function extractAllCollectedVideoUrls(text: string): ParsedCollectedVideoUrl[] {
  const found: ParsedCollectedVideoUrl[] = [];
  const seen = new Set<string>();

  for (const raw of candidateUrls(text)) {
    const parsed = parseCollectedVideoUrlSync(raw);
    if (!parsed) continue;
    const key = `${parsed.platform}:${parsed.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(parsed);
  }

  // Bare Instagram shortcodes still supported for Telegram paste quirks.
  if (found.length === 0) {
    const ig = parseInstagram(text.trim());
    if (ig) found.push(ig);
  }

  return found;
}

/**
 * Async multi-platform extractor for Telegram and other share surfaces.
 * Every candidate is passed through the canonical parser, so TikTok short links
 * work even when the same message also contains Instagram or YouTube links.
 */
export async function extractAllCollectedVideoUrlsAsync(
  text: string,
  options: CollectedVideoUrlParseOptions = {}
): Promise<ParsedCollectedVideoUrl[]> {
  const found: ParsedCollectedVideoUrl[] = [];
  const seen = new Set<string>();

  for (const raw of candidateUrls(text)) {
    const parsed = await parseCollectedVideoUrl(raw, options);
    if (!parsed) continue;
    const key = `${parsed.platform}:${parsed.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(parsed);
  }

  if (found.length === 0) {
    const ig = parseInstagram(text.trim());
    if (ig) found.push(ig);
  }

  return found;
}
