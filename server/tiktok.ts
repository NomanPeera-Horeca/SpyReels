/**
 * TikTok data via ScrapeCreators API (https://api.scrapecreators.com).
 * Uses global fetch with x-api-key.
 */

const API_BASE = "https://api.scrapecreators.com";
const SCRAPECREATORS_FETCH_MS = 30_000;

function requireApiKey(): string {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) {
    throw new Error("SCRAPECREATORS_API_KEY is not configured.");
  }
  return key;
}

async function scGet(
  path: string,
  query: Record<string, string | undefined>
): Promise<{ status: number; data: any }> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    SCRAPECREATORS_FETCH_MS
  );
  let response: Response;

  try {
    response = await fetch(url.toString(), {
      headers: { "x-api-key": requireApiKey() },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        status: 408,
        data: { error: "scrapecreators_request_timeout" },
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  let data: any = null;
  const text = await response.text();
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { status: response.status, data };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanTikTokHandle(handle: string): string {
  return handle.replace(/^@/, "").trim();
}

function toFiniteNumber(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function readErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  const candidates = [
    record.message,
    record.error,
    record.error_message,
    record.detail,
  ];
  const message = candidates.find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  return message ?? "";
}

function responseLooksNotFound(status: number, data: unknown): boolean {
  if (status === 404) return true;
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  const errorStatus = toFiniteNumber(record.errorStatus ?? record.status_code);
  const message = readErrorMessage(data);
  return (
    errorStatus === 404 ||
    /not found|does not exist|user not found|no such user/i.test(message)
  );
}

export interface TikTokProfileInfo {
  userId: string;
  uniqueId: string;
  nickname: string;
  isPrivate: boolean;
  followerCount: number;
  followingCount: number;
  videoCount: number;
  heartCount: number;
  avatarUrl: string;
  biography: string;
  isVerified: boolean;
}

export interface TikTokVideoData {
  awemeId: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  thumbnailUrl: string;
  videoUrl: string;
  videoPageUrl: string;
  durationSec: number;
  postedAt: Date;
  ownerUsername: string;
}

export interface TikTokScrapeResult {
  videos: TikTokVideoData[];
  followerCount: number;
  profilePicUrl: string;
}

async function fetchTikTokProfile(
  handle: string
): Promise<TikTokProfileInfo> {
  const cleanHandle = cleanTikTokHandle(handle);
  const maxTries = 5;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const { status, data } = await scGet("/v1/tiktok/profile", {
      handle: cleanHandle,
    });

    if (responseLooksNotFound(status, data)) {
      throw new Error(
        `User "@${cleanHandle}" not found. Please check the username and try again.`
      );
    }

    if (status === 429) {
      if (attempt < maxTries) {
        await sleep(2000 * attempt);
        continue;
      }
      throw new Error(
        "TikTok rate limit reached. Please wait a few minutes and try again."
      );
    }

    if (status !== 200 || !data || typeof data !== "object") {
      if (attempt < maxTries) {
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(
        `Failed to fetch TikTok profile for "@${cleanHandle}": HTTP ${status}`
      );
    }

    const user = (data as any).user;
    const stats = (data as any).statsV2;

    if (!user || !stats) {
      const vendorMessage = readErrorMessage(data);
      if (attempt < maxTries && !responseLooksNotFound(status, data)) {
        console.warn(
          `[TikTok] Invalid profile response for @${cleanHandle} ` +
            `(attempt ${attempt}/${maxTries})${vendorMessage ? `: ${vendorMessage}` : ""}`
        );
        await sleep(600 * attempt);
        continue;
      }
      throw new Error(
        vendorMessage
          ? `Failed to fetch TikTok profile for "@${cleanHandle}": ${vendorMessage}`
          : `User "@${cleanHandle}" not found or the profile is not accessible.`
      );
    }

    return {
      userId: String(user.id ?? ""),
      uniqueId: String(user.uniqueId || cleanHandle),
      nickname: String(user.nickname || ""),
      isPrivate: !!user.privateAccount,
      followerCount: toFiniteNumber(stats.followerCount),
      followingCount: toFiniteNumber(stats.followingCount),
      videoCount: toFiniteNumber(stats.videoCount),
      heartCount: toFiniteNumber(stats.heartCount),
      avatarUrl: String(
        user.avatarLarger || user.avatarMedium || user.avatarThumb || ""
      ),
      biography: String(user.signature || ""),
      isVerified: !!user.verified,
    };
  }

  throw new Error(
    `Failed to fetch TikTok profile for "@${cleanHandle}" after ${maxTries} attempts.`
  );
}

function parseTikTokVideo(
  item: any,
  fallbackHandle: string
): TikTokVideoData | null {
  const awemeId = String(item?.aweme_id ?? "");
  const postedAtSeconds = toFiniteNumber(item?.create_time);
  if (!awemeId || postedAtSeconds <= 0) return null;

  const postedAt = new Date(postedAtSeconds * 1000);
  if (Number.isNaN(postedAt.getTime())) return null;

  const video = item?.video;
  const statistics = item?.statistics;
  const videoUrl =
    video?.download_no_watermark_addr?.url_list?.[0] ||
    video?.play_addr?.url_list?.[0] ||
    "";
  const ownerUsername = String(
    item?.author?.unique_id || item?.author?.uniqueId || fallbackHandle
  );

  return {
    awemeId,
    caption: String(item?.desc || ""),
    viewCount: toFiniteNumber(statistics?.play_count),
    likeCount: toFiniteNumber(statistics?.digg_count),
    commentCount: toFiniteNumber(statistics?.comment_count),
    shareCount: toFiniteNumber(statistics?.share_count),
    thumbnailUrl: String(video?.cover?.url_list?.[0] || ""),
    videoUrl: String(videoUrl),
    videoPageUrl: String(
      item?.url ||
        `https://www.tiktok.com/@${ownerUsername}/video/${awemeId}`
    ),
    durationSec: toFiniteNumber(video?.duration) / 1000,
    postedAt,
    ownerUsername,
  };
}

async function fetchTikTokVideosPage(
  handle: string,
  maxCursor?: number
): Promise<{
  videos: TikTokVideoData[];
  nextCursor: number | null;
  hasMore: boolean;
}> {
  const cleanHandle = cleanTikTokHandle(handle);
  const maxTries = maxCursor === undefined ? 8 : 3;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const { status, data } = await scGet("/v3/tiktok/profile/videos", {
      handle: cleanHandle,
      sort_by: "latest",
      max_cursor:
        maxCursor === undefined ? undefined : String(maxCursor),
    });

    if (responseLooksNotFound(status, data)) {
      throw new Error(
        `User "@${cleanHandle}" not found. Please check the username and try again.`
      );
    }

    if (status === 429) {
      if (attempt < maxTries) {
        console.warn(
          `[TikTok] Rate limited on profile/videos for @${cleanHandle} ` +
            `(attempt ${attempt}/${maxTries}), waiting 5s`
        );
        await sleep(5000);
        continue;
      }
      throw new Error(
        "TikTok rate limit reached. Please wait a few minutes and try again."
      );
    }

    if (status !== 200 || !data || typeof data !== "object") {
      if (attempt < maxTries) {
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(
        `Failed to fetch TikTok videos for "@${cleanHandle}": HTTP ${status}`
      );
    }

    const rawItems = Array.isArray((data as any).aweme_list)
      ? (data as any).aweme_list
      : null;

    if (!rawItems) {
      const vendorMessage = readErrorMessage(data);
      if (attempt < maxTries) {
        console.warn(
          `[TikTok] Invalid profile/videos response for @${cleanHandle} ` +
            `(attempt ${attempt}/${maxTries})${vendorMessage ? `: ${vendorMessage}` : ""}`
        );
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(
        vendorMessage
          ? `Failed to fetch TikTok videos for "@${cleanHandle}": ${vendorMessage}`
          : `TikTok returned an invalid videos response for "@${cleanHandle}".`
      );
    }

    const videos = rawItems
      .map((item: any) => parseTikTokVideo(item, cleanHandle))
      .filter((video: TikTokVideoData | null): video is TikTokVideoData =>
        video !== null
      );
    const hasMore = toFiniteNumber((data as any).has_more) === 1;
    const rawCursor = toFiniteNumber((data as any).max_cursor);
    const nextCursor = hasMore && rawCursor > 0 ? rawCursor : null;

    if (
      maxCursor === undefined &&
      rawItems.length === 0 &&
      !hasMore &&
      attempt < maxTries
    ) {
      console.warn(
        `[TikTok] profile/videos returned 0 items on first page for @${cleanHandle} ` +
          `(attempt ${attempt}/${maxTries}), retrying`
      );
      await sleep(1500 * attempt);
      continue;
    }

    return { videos, nextCursor, hasMore };
  }

  return { videos: [], nextCursor: null, hasMore: false };
}

export async function scrapeTikTokVideos(
  handle: string,
  onProgress?: (count: number, pageBatch?: TikTokVideoData[]) => void,
  options?: { maxVideos?: number; timeoutMs?: number }
): Promise<TikTokScrapeResult> {
  const maxVideos = options?.maxVideos || 500;
  const timeoutMs = options?.timeoutMs || 5 * 60 * 1000;
  const startTime = Date.now();
  const profile = await fetchTikTokProfile(handle);

  if (profile.isPrivate) {
    throw new Error(
      `The account @${profile.uniqueId} is private. Only public accounts can be scraped.`
    );
  }

  const videos: TikTokVideoData[] = [];
  const seenAwemeIds = new Set<string>();
  const seenCursors = new Set<number>();
  let maxCursor: number | undefined;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = 100;
  let stoppedReason = "";

  while (hasMore && pageCount < maxPages) {
    if (Date.now() - startTime > timeoutMs) {
      stoppedReason = `timeout after ${Math.round((Date.now() - startTime) / 1000)}s`;
      console.warn(
        `[TikTok] Scrape timeout for @${profile.uniqueId} after ${pageCount} pages, ${videos.length} videos collected`
      );
      break;
    }

    if (videos.length >= maxVideos) {
      stoppedReason = `reached ${maxVideos} video cap`;
      console.log(
        `[TikTok] Reached video cap (${maxVideos}) for @${profile.uniqueId} after ${pageCount} pages`
      );
      break;
    }

    pageCount++;

    if (pageCount > 1) {
      const delay = 350 + Math.random() * 400;
      await sleep(delay);
    }

    const page = await fetchTikTokVideosPage(profile.uniqueId, maxCursor);
    const pageNewVideos: TikTokVideoData[] = [];

    for (const video of page.videos) {
      if (seenAwemeIds.has(video.awemeId)) continue;
      seenAwemeIds.add(video.awemeId);
      videos.push(video);
      pageNewVideos.push(video);
      if (videos.length >= maxVideos) break;
    }

    if (onProgress && pageNewVideos.length > 0) {
      onProgress(videos.length, pageNewVideos);
    }

    if (!page.hasMore || page.nextCursor === null) {
      hasMore = false;
    } else if (seenCursors.has(page.nextCursor)) {
      hasMore = false;
      stoppedReason = "repeated pagination cursor";
      console.warn(
        `[TikTok] Repeated max_cursor ${page.nextCursor} for @${profile.uniqueId}, stopping pagination`
      );
    } else {
      seenCursors.add(page.nextCursor);
      maxCursor = page.nextCursor;
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(
    `[TikTok] Scraped ${videos.length} videos for @${profile.uniqueId} in ${elapsed}s (${pageCount} pages, ${profile.followerCount} followers${stoppedReason ? `, stopped: ${stoppedReason}` : ""})`
  );

  return {
    videos,
    followerCount: profile.followerCount,
    profilePicUrl: profile.avatarUrl,
  };
}
