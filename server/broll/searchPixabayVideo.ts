/**
 * Pixabay video search (fallback when Pexels + relevance yield nothing).
 * Endpoint: https://pixabay.com/api/videos/
 * Auth: query param key= (not Authorization header).
 */

import { pickRelevantCandidate } from "./checkClipRelevance";
import type {
  StockProviderBeatResult,
  StockVideoResult,
} from "./stockVideoTypes";

const PIXABAY_VIDEO_SEARCH_URL = "https://pixabay.com/api/videos/";

type PixabayVideoSize = {
  url?: string;
  width?: number;
  height?: number;
  size?: number;
  thumbnail?: string;
};

type PixabayHit = {
  id?: number;
  pageURL?: string;
  duration?: number;
  user?: string;
  user_id?: number;
  picture_id?: string;
  videos?: {
    large?: PixabayVideoSize;
    medium?: PixabayVideoSize;
    small?: PixabayVideoSize;
    tiny?: PixabayVideoSize;
  };
};

function pickRendition(hit: PixabayHit): PixabayVideoSize | null {
  const videos = hit.videos;
  if (!videos) return null;
  for (const key of ["medium", "small", "large", "tiny"] as const) {
    const r = videos[key];
    if (r?.url) return r;
  }
  return null;
}

function isPortraitIsh(width: number, height: number): boolean {
  if (!(width > 0 && height > 0)) return true;
  return height >= width * 0.85;
}

function mapHit(hit: PixabayHit): StockVideoResult | null {
  if (hit.id == null) return null;
  const rendition = pickRendition(hit);
  if (!rendition?.url) return null;

  const width = rendition.width ?? 0;
  const height = rendition.height ?? 0;
  if (!isPortraitIsh(width, height)) return null;

  const thumbnailUrl =
    (rendition.thumbnail || "").trim() ||
    (hit.picture_id
      ? `https://i.vimeocdn.com/video/${hit.picture_id}_640x360.jpg`
      : "");
  if (!thumbnailUrl) return null;

  const sourceUrl = (hit.pageURL || "").trim();
  if (!sourceUrl) return null;

  const user = String(hit.user || "Pixabay").trim();
  const userId = hit.user_id;
  const photographerUrl =
    typeof userId === "number"
      ? `https://pixabay.com/users/${encodeURIComponent(user)}-${userId}/`
      : "https://pixabay.com/";

  return {
    id: hit.id,
    thumbnailUrl,
    previewUrl: rendition.url,
    durationSeconds: typeof hit.duration === "number" ? hit.duration : 0,
    width,
    height,
    sourceUrl,
    photographerName: user,
    photographerUrl,
    provider: "pixabay",
  };
}

/**
 * Search Pixabay videos. Returns up to `perPage` portrait-ish results.
 */
export async function searchPixabayVideos(
  query: string,
  options: {
    perPage?: number;
    page?: number;
    excludeUrls?: Set<string>;
  } = {}
): Promise<StockVideoResult[]> {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    console.warn("[searchPixabayVideo] PIXABAY_API_KEY not set");
    return [];
  }

  const q = query.trim();
  if (!q) return [];

  const perPage = Math.min(Math.max(options.perPage ?? 8, 1), 20);
  const page = Math.max(options.page ?? 1, 1);
  const excludeUrls = options.excludeUrls;

  try {
    const params = new URLSearchParams({
      key: apiKey,
      q,
      per_page: String(perPage),
      page: String(page),
      video_type: "film",
      safesearch: "true",
    });
    const response = await fetch(`${PIXABAY_VIDEO_SEARCH_URL}?${params}`);
    if (!response.ok) {
      console.warn(
        `[searchPixabayVideo] Pixabay video search failed (${response.status})`
      );
      return [];
    }

    const data = (await response.json()) as { hits?: PixabayHit[] };
    const results: StockVideoResult[] = [];
    for (const hit of data.hits ?? []) {
      const mapped = mapHit(hit);
      if (!mapped) continue;
      if (
        excludeUrls?.has(mapped.previewUrl) ||
        excludeUrls?.has(mapped.sourceUrl)
      ) {
        continue;
      }
      results.push(mapped);
    }
    return results;
  } catch (err) {
    console.warn("[searchPixabayVideo] Pixabay video search failed", err);
    return [];
  }
}

export type SearchPixabayForBeatOptions = {
  relevanceText?: string;
};

/**
 * Fetch Pixabay candidates and pick the first that passes relevance.
 * Same contract as searchPexelsVideoForBeat.
 */
export async function searchPixabayVideoForBeat(
  query: string,
  excludeUrls: Set<string>,
  options: SearchPixabayForBeatOptions = {}
): Promise<StockProviderBeatResult> {
  const relevanceText = (options.relevanceText ?? query).trim();

  const candidates = await searchPixabayVideos(query, {
    perPage: 4,
    page: 1,
    excludeUrls,
  });

  let pool = candidates;
  if (!pool.length) {
    pool = await searchPixabayVideos(query, {
      perPage: 4,
      page: 2,
      excludeUrls,
    });
  }
  if (!pool.length) return { status: "empty" };

  const pick = await pickRelevantCandidate(pool, relevanceText, 4);
  if (!pick) return { status: "empty" };

  return {
    status: pick.confidence,
    video: { ...pick.candidate, matchConfidence: pick.confidence },
  };
}
