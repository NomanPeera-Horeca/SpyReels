/**
 * Pixabay video search (fallback when Pexels + relevance yield nothing).
 * Endpoint: https://pixabay.com/api/videos/
 * Auth: query param key= (not Authorization header).
 */

import {
  orderCandidatesForRelevance,
  pickFromScoredCandidates,
  scoreCandidatesForRelevance,
} from "./checkClipRelevance";
import type {
  StockProviderBeatResult,
  StockVideoResult,
} from "./stockVideoTypes";

const PAGE_SIZE = 4;
const MAX_CANDIDATES_PER_PROVIDER = 8;

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
 * Fetch Pixabay candidates and pick by relevance score.
 * Same deepen-on-all-reject contract as searchPexelsVideoForBeat.
 */
export async function searchPixabayVideoForBeat(
  query: string,
  excludeUrls: Set<string>,
  options: SearchPixabayForBeatOptions = {}
): Promise<StockProviderBeatResult> {
  const relevanceText = (options.relevanceText ?? query).trim();

  const page1 = await searchPixabayVideos(query, {
    perPage: PAGE_SIZE,
    page: 1,
    excludeUrls,
  });

  if (!page1.length) {
    const page2Only = await searchPixabayVideos(query, {
      perPage: PAGE_SIZE,
      page: 2,
      excludeUrls,
    });
    if (!page2Only.length) return { status: "empty" };
    const scored = await scoreCandidatesForRelevance(
      page2Only,
      relevanceText,
      PAGE_SIZE
    );
    const pick = pickFromScoredCandidates(scored);
    if (!pick) return { status: "empty" };
    return {
      status: pick.confidence,
      video: { ...pick.candidate, matchConfidence: pick.confidence },
    };
  }

  const scored1 = await scoreCandidatesForRelevance(
    page1,
    relevanceText,
    PAGE_SIZE
  );
  const early = pickFromScoredCandidates(scored1);
  if (early?.confidence === "high") {
    return {
      status: "high",
      video: { ...early.candidate, matchConfidence: "high" },
    };
  }

  const page2 = await searchPixabayVideos(query, {
    perPage: PAGE_SIZE,
    page: 2,
    excludeUrls,
  });
  const seen = new Set(page1.map((c) => c.previewUrl));
  const page2New = page2.filter((c) => !seen.has(c.previewUrl));

  if (!page2New.length) {
    if (!early) return { status: "empty" };
    return {
      status: "approximate",
      video: { ...early.candidate, matchConfidence: "approximate" },
    };
  }

  const scored2 = await scoreCandidatesForRelevance(
    page2New,
    relevanceText,
    PAGE_SIZE
  );
  const scoreByUrl = new Map<string, number>();
  for (const row of [...scored1, ...scored2]) {
    scoreByUrl.set(row.candidate.previewUrl, row.score);
  }
  const combinedOrdered = orderCandidatesForRelevance([
    ...page1,
    ...page2New,
  ]).slice(0, MAX_CANDIDATES_PER_PROVIDER);
  const scoredCombined = combinedOrdered.map((candidate) => ({
    candidate,
    score: scoreByUrl.get(candidate.previewUrl) ?? 0,
  }));
  const pick = pickFromScoredCandidates(scoredCombined);
  if (!pick) return { status: "empty" };
  return {
    status: pick.confidence,
    video: { ...pick.candidate, matchConfidence: pick.confidence },
  };
}
