/**
 * Pexels video search helper (parallel to photo search in resolveSlideImage.ts).
 * Endpoint: https://api.pexels.com/videos/search
 */

const PEXELS_VIDEO_SEARCH_URL = "https://api.pexels.com/videos/search";

export type PexelsVideoResult = {
  id: number;
  thumbnailUrl: string;
  previewUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  sourceUrl: string;
  photographerName: string;
  photographerUrl: string;
};

type PexelsVideoFile = {
  id?: number;
  quality?: string;
  file_type?: string;
  width?: number | null;
  height?: number | null;
  link?: string;
};

type PexelsVideoPicture = {
  id?: number;
  picture?: string;
  nr?: number;
};

type PexelsVideo = {
  id?: number;
  width?: number;
  height?: number;
  url?: string;
  image?: string;
  duration?: number;
  user?: { id?: number; name?: string; url?: string };
  video_files?: PexelsVideoFile[];
  video_pictures?: PexelsVideoPicture[];
};

function pickPreviewFile(files: PexelsVideoFile[] | undefined): string | null {
  if (!files?.length) return null;
  const mp4 = files.filter(
    (f) => f.link && (!f.file_type || f.file_type.includes("mp4"))
  );
  if (!mp4.length) return files.find((f) => f.link)?.link ?? null;

  // Prefer a mid-size SD file for preview (faster than UHD).
  const sd = mp4
    .filter((f) => (f.quality || "").toLowerCase() === "sd")
    .sort((a, b) => (b.width || 0) - (a.width || 0));
  if (sd[0]?.link) return sd[0].link;

  const byWidth = [...mp4].sort((a, b) => (a.width || 0) - (b.width || 0));
  // Mid-ish file: skip tiny thumbnails when possible.
  const mid = byWidth.find((f) => (f.width || 0) >= 640) ?? byWidth[byWidth.length - 1];
  return mid?.link ?? null;
}

function mapVideo(video: PexelsVideo): PexelsVideoResult | null {
  if (video.id == null) return null;
  const previewUrl = pickPreviewFile(video.video_files);
  if (!previewUrl) return null;

  const thumbnailUrl =
    video.image ||
    video.video_pictures?.[0]?.picture ||
    "";
  if (!thumbnailUrl) return null;

  const sourceUrl = (video.url || "").trim();
  if (!sourceUrl) return null;

  const photographerName = (video.user?.name || "Pexels").trim();
  const photographerUrl = (video.user?.url || "https://www.pexels.com").trim();

  return {
    id: video.id,
    thumbnailUrl,
    previewUrl,
    durationSeconds: typeof video.duration === "number" ? video.duration : 0,
    width: video.width ?? 0,
    height: video.height ?? 0,
    sourceUrl,
    photographerName,
    photographerUrl,
  };
}

/**
 * Search Pexels videos. Returns up to `perPage` results (default 5).
 * Skips clips whose preview URL is in `excludeUrls` (in-job dedupe).
 */
export async function searchPexelsVideos(
  query: string,
  options: {
    perPage?: number;
    page?: number;
    orientation?: "portrait" | "landscape" | "square";
    excludeUrls?: Set<string>;
  } = {}
): Promise<PexelsVideoResult[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.warn("[searchPexelsVideo] PEXELS_API_KEY not set");
    return [];
  }

  const q = query.trim();
  if (!q) return [];

  const perPage = Math.min(Math.max(options.perPage ?? 5, 1), 15);
  const page = Math.max(options.page ?? 1, 1);
  const orientation = options.orientation ?? "portrait";
  const excludeUrls = options.excludeUrls;

  try {
    const params = new URLSearchParams({
      query: q,
      per_page: String(perPage),
      page: String(page),
      orientation,
    });
    const response = await fetch(`${PEXELS_VIDEO_SEARCH_URL}?${params}`, {
      headers: { Authorization: apiKey },
    });
    if (!response.ok) {
      console.warn(
        `[searchPexelsVideo] Pexels video search failed (${response.status})`
      );
      return [];
    }

    const data = (await response.json()) as { videos?: PexelsVideo[] };
    const results: PexelsVideoResult[] = [];
    for (const video of data.videos ?? []) {
      const mapped = mapVideo(video);
      if (!mapped) continue;
      if (excludeUrls?.has(mapped.previewUrl) || excludeUrls?.has(mapped.sourceUrl)) {
        continue;
      }
      results.push(mapped);
    }
    return results;
  } catch (err) {
    console.warn("[searchPexelsVideo] Pexels video search failed", err);
    return [];
  }
}

/**
 * Pick the first unused video for a beat, preferring shorter clips suitable for B-roll.
 */
export async function searchPexelsVideoForBeat(
  query: string,
  excludeUrls: Set<string>
): Promise<PexelsVideoResult | null> {
  // Fetch a small page so we can skip already-used clips in-job.
  const candidates = await searchPexelsVideos(query, {
    perPage: 8,
    page: 1,
    excludeUrls,
  });
  if (!candidates.length) {
    // Retry without exclude filter on a later page if everything was deduped.
    const fallback = await searchPexelsVideos(query, {
      perPage: 8,
      page: 2,
      excludeUrls,
    });
    return fallback[0] ?? null;
  }

  // Prefer clips under ~20s when available.
  const short = candidates.find((c) => c.durationSeconds > 0 && c.durationSeconds <= 20);
  return short ?? candidates[0] ?? null;
}
