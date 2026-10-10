/**
 * TikTok data via ScrapeCreators API (https://api.scrapecreators.com).
 * Uses global fetch with x-api-key.
 */

import { MIN_SPY_DISPLAY_REELS } from "@shared/spyReelsLimits";

const API_BASE = "https://api.scrapecreators.com";
const SCRAPECREATORS_FETCH_MS = 30_000;

/** Interactive preview refresh: short timeout, a couple of tries for UI. */
export const INTERACTIVE_TIKTOK_FETCH_TIMEOUT_MS = 15_000;

function requireApiKey(): string {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) {
    throw new Error("SCRAPECREATORS_API_KEY is not configured.");
  }
  return key;
}

async function scGet(
  path: string,
  query: Record<string, string | undefined>,
  opts?: { timeoutMs?: number }
): Promise<{ status: number; data: any }> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const timeoutMs = opts?.timeoutMs ?? SCRAPECREATORS_FETCH_MS;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
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
  /** Present on keyword/Top search when the provider includes author stats. */
  creatorFollowerCount?: number | null;
  /** Present on keyword/Top search when the provider includes collect_count. */
  saveCount?: number | null;
  /** ScrapeCreators `is_top` (0|1). Pinned; may appear out of chrono order. */
  isTop?: boolean;
  /** True when collected only to reach MIN_SPY_DISPLAY_REELS (older than spy window). */
  outsideSpyWindow?: boolean;
}

export interface TikTokVideoInfo {
  videoUrl: string;
}

/** Full single-video payload for Collected Reels ingest. */
export interface TikTokVideoDetails {
  awemeId: string;
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSec: number;
  postedAt: Date | null;
  ownerUsername: string;
  ownerFullName: string;
  ownerProfilePicUrl: string;
  videoPageUrl: string;
}

export interface TikTokScrapeResult {
  videos: TikTokVideoData[];
  followerCount: number;
  profilePicUrl: string;
}

function firstUrlFromList(value: unknown): string {
  if (!Array.isArray(value)) return "";
  for (const entry of value) {
    if (typeof entry === "string" && entry.trim()) return entry.trim();
  }
  return "";
}

function looksLikeHeicUrl(url: string): boolean {
  return /\.heic(\?|$)/i.test(url) || /[?&]format=heic\b/i.test(url);
}

/** Prefer JPEG/webp cover variants; skip HEIC when a better URL exists. */
function firstPreferredImageUrlFromList(value: unknown): string {
  if (!Array.isArray(value)) return "";
  let heicFallback = "";
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const url = entry.trim();
    if (looksLikeHeicUrl(url)) {
      if (!heicFallback) heicFallback = url;
      continue;
    }
    return url;
  }
  return heicFallback;
}

/**
 * ScrapeCreators often leaves top-level play_addr.url_list empty while
 * bit_rate[].play_addr still has playable CDN links. Prefer no-watermark.
 */
export function extractTikTokPlayUrl(video: any): string {
  if (!video || typeof video !== "object") return "";

  const noWm = firstUrlFromList(video.download_no_watermark_addr?.url_list);
  if (noWm) return noWm;

  const topPlay = firstUrlFromList(video.play_addr?.url_list);
  if (topPlay && video.has_watermark === false) return topPlay;

  if (Array.isArray(video.bit_rate)) {
    for (const tier of video.bit_rate) {
      const fromBit = firstUrlFromList(tier?.play_addr?.url_list);
      if (fromBit) return fromBit;
    }
  }

  if (topPlay) return topPlay;

  const download = firstUrlFromList(video.download_addr?.url_list);
  if (download) return download;

  const h264 = firstUrlFromList(video.play_addr_h264?.url_list);
  if (h264) return h264;

  return "";
}

function extractTikTokCoverUrl(video: any): string {
  if (!video || typeof video !== "object") return "";
  return (
    firstPreferredImageUrlFromList(video.cover?.url_list) ||
    firstPreferredImageUrlFromList(video.origin_cover?.url_list) ||
    firstPreferredImageUrlFromList(video.dynamic_cover?.url_list) ||
    ""
  );
}

function mapAwemeDetailToTikTokDetails(
  data: any,
  fallbackUrl: string
): TikTokVideoDetails | null {
  const detail = data?.aweme_detail ?? data?.aweme_details ?? null;
  if (!detail || typeof detail !== "object") return null;

  const awemeId = String(detail.aweme_id ?? detail.id ?? "").trim();
  const video = detail.video;
  const videoUrl = extractTikTokPlayUrl(video);
  const thumbnailUrl = extractTikTokCoverUrl(video);
  if (!awemeId && !videoUrl && !thumbnailUrl) return null;

  const author = detail.author || {};
  const ownerUsername = String(
    author.unique_id || author.uniqueId || ""
  ).replace(/^@/, "");
  const postedAtSeconds = toFiniteNumber(detail.create_time);
  const postedAt =
    postedAtSeconds > 0 ? new Date(postedAtSeconds * 1000) : null;
  const statistics = detail.statistics || {};

  return {
    awemeId: awemeId || "",
    videoUrl,
    thumbnailUrl,
    caption: String(detail.desc || ""),
    viewCount: toFiniteNumber(statistics.play_count),
    likeCount: toFiniteNumber(statistics.digg_count),
    commentCount: toFiniteNumber(statistics.comment_count),
    durationSec: toFiniteNumber(video?.duration) / 1000,
    postedAt:
      postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
    ownerUsername,
    ownerFullName: String(author.nickname || author.unique_id || ""),
    ownerProfilePicUrl: String(
      firstUrlFromList(author.avatar_larger?.url_list) ||
        firstUrlFromList(author.avatar_thumb?.url_list) ||
        author.avatarLarger ||
        author.avatarThumb ||
        ""
    ),
    videoPageUrl:
      String(detail.share_url || detail.url || "").trim() ||
      (ownerUsername && awemeId
        ? `https://www.tiktok.com/@${ownerUsername}/video/${awemeId}`
        : fallbackUrl),
  };
}

export async function fetchTikTokVideoInfo(
  videoPageUrl: string,
  options?: { mode?: "default" | "interactive" }
): Promise<TikTokVideoInfo | null> {
  const details = await fetchTikTokVideoDetails(videoPageUrl, options);
  if (!details?.videoUrl) return null;
  return { videoUrl: details.videoUrl };
}

export async function fetchTikTokVideoDetails(
  videoPageUrl: string,
  options?: { mode?: "default" | "interactive" }
): Promise<TikTokVideoDetails | null> {
  const url = videoPageUrl.trim();
  if (!url) return null;

  const interactive = options?.mode === "interactive";
  // Preview UI used to fail on a single 8s timeout; give it a second shot.
  const maxTries = interactive ? 2 : 5;
  const requestTimeoutMs = interactive
    ? INTERACTIVE_TIKTOK_FETCH_TIMEOUT_MS
    : undefined;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const { status, data } = await scGet(
        "/v2/tiktok/video",
        { url },
        requestTimeoutMs != null ? { timeoutMs: requestTimeoutMs } : undefined
      );
      if (
        status === 200 &&
        data &&
        typeof data === "object" &&
        (data as any).success !== false
      ) {
        const details = mapAwemeDetailToTikTokDetails(data, url);
        if (details?.videoUrl) {
          return details;
        }
        // Last-chance direct extract if mapping skipped an odd payload shape
        const video = (data as any).aweme_detail?.video;
        const videoUrl = extractTikTokPlayUrl(video);
        if (videoUrl) {
          return {
            awemeId: String((data as any).aweme_detail?.aweme_id || ""),
            videoUrl,
            thumbnailUrl: extractTikTokCoverUrl(video),
            caption: String((data as any).aweme_detail?.desc || ""),
            viewCount: 0,
            likeCount: 0,
            commentCount: 0,
            durationSec: 0,
            postedAt: null,
            ownerUsername: "",
            ownerFullName: "",
            ownerProfilePicUrl: "",
            videoPageUrl: url,
          };
        }
      }

      if (status === 404 || responseLooksNotFound(status, data)) {
        return null;
      }

      if (attempt < maxTries) {
        await sleep(status === 429 ? 2000 * attempt : 1000 * attempt);
      }
    } catch (error) {
      if (attempt >= maxTries) {
        console.warn(
          `[TikTok] Failed to fetch video info for ${url}:`,
          error instanceof Error ? error.message : error
        );
        return null;
      }
      await sleep(1000 * attempt);
    }
  }

  return null;
}

export async function fetchTikTokProfile(
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
  const videoUrl = extractTikTokPlayUrl(video);
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
    thumbnailUrl: extractTikTokCoverUrl(video),
    videoUrl: String(videoUrl),
    videoPageUrl: String(
      item?.url ||
        `https://www.tiktok.com/@${ownerUsername}/video/${awemeId}`
    ),
    durationSec: toFiniteNumber(video?.duration) / 1000,
    postedAt,
    ownerUsername,
    isTop: toFiniteNumber(item?.is_top) === 1,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function optionalPositiveMetric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function firstSearchArray(data: unknown, keys: string[]): unknown[] {
  const root = asRecord(data);
  for (const key of keys) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  const nested = asRecord(root.data);
  for (const key of keys) {
    if (Array.isArray(nested[key])) return nested[key] as unknown[];
  }
  return [];
}

/**
 * Normalize ScrapeCreators TikTok keyword (`aweme_info`) and Top search rows.
 * Does not invent views, followers, or saves when the provider omitted them.
 */
export function parseTikTokSearchVideo(raw: unknown): TikTokVideoData | null {
  const wrapper = asRecord(raw);
  const item = asRecord(wrapper.aweme_info ?? wrapper.awemeInfo ?? wrapper);
  const awemeId = String(item.aweme_id ?? item.awemeId ?? item.id ?? "").trim();
  if (!awemeId) return null;

  const author = asRecord(item.author);
  const stats = asRecord(item.statistics ?? item.stats);
  const ownerUsername = String(
    author.unique_id ?? author.uniqueId ?? author.username ?? ""
  ).replace(/^@/, "");
  const postedAtSeconds = toFiniteNumber(item.create_time ?? item.createTime);
  const postedAt =
    postedAtSeconds > 0 ? new Date(postedAtSeconds * 1000) : new Date(0);
  if (Number.isNaN(postedAt.getTime()) || postedAt.getTime() <= 0) {
    return null;
  }

  const views = optionalPositiveMetric(stats.play_count ?? stats.playCount ?? stats.view_count);
  const likes = optionalPositiveMetric(stats.digg_count ?? stats.like_count ?? stats.likes);
  const comments = optionalPositiveMetric(stats.comment_count ?? stats.comments);
  const shares = optionalPositiveMetric(stats.share_count ?? stats.shares);
  const saves = optionalPositiveMetric(stats.collect_count ?? stats.save_count ?? stats.saves);
  const followers = optionalPositiveMetric(
    author.follower_count ??
      author.followerCount ??
      asRecord(author.stats).followerCount ??
      asRecord(author.stats).follower_count
  );

  const video = item.video;
  return {
    awemeId,
    caption: String(item.desc ?? item.caption ?? item.title ?? ""),
    viewCount: views ?? 0,
    likeCount: likes ?? 0,
    commentCount: comments ?? 0,
    shareCount: shares ?? 0,
    saveCount: saves,
    creatorFollowerCount: followers,
    thumbnailUrl: extractTikTokCoverUrl(video),
    videoUrl: extractTikTokPlayUrl(video),
    videoPageUrl: String(
      item.share_url ??
        item.url ??
        (ownerUsername
          ? `https://www.tiktok.com/@${ownerUsername}/video/${awemeId}`
          : `https://www.tiktok.com/video/${awemeId}`)
    ),
    durationSec: toFiniteNumber(asRecord(video).duration) / 1000,
    postedAt,
    ownerUsername,
  };
}

export type TikTokSearchResult = {
  videos: TikTokVideoData[];
  rawCount: number;
};

async function searchTikTokPath(
  path: string,
  query: Record<string, string | undefined>,
  rowKeys: string[]
): Promise<TikTokSearchResult> {
  const { status, data } = await scGet(path, query);
  if (status < 200 || status >= 300) {
    throw new Error(`TikTok search ${path} failed: HTTP ${status}`);
  }
  const rows = firstSearchArray(data, rowKeys);
  const videos = rows
    .map((row) => parseTikTokSearchVideo(row))
    .filter((video): video is TikTokVideoData => video !== null);
  return { videos, rawCount: rows.length };
}

export async function searchTikTokKeyword(
  query: string,
  opts?: { datePosted?: string; sortBy?: string; region?: string }
): Promise<TikTokSearchResult> {
  return searchTikTokPath(
    "/v1/tiktok/search/keyword",
    {
      query,
      date_posted: opts?.datePosted || "last-3-months",
      sort_by: opts?.sortBy || "relevance",
      region: opts?.region || "US",
      trim: "false",
    },
    ["search_item_list", "items", "videos", "results"]
  );
}

export async function searchTikTokTop(
  query: string,
  opts?: { publishTime?: string; sortBy?: string; region?: string }
): Promise<TikTokSearchResult> {
  return searchTikTokPath(
    "/v1/tiktok/search/top",
    {
      query,
      publish_time: opts?.publishTime || "last-3-months",
      sort_by: opts?.sortBy || "relevance",
      region: opts?.region || "US",
    },
    ["items", "search_item_list", "videos", "results"]
  );
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
  options?: { maxVideos?: number; timeoutMs?: number; sinceDate?: Date }
): Promise<TikTokScrapeResult> {
  const maxVideos = options?.maxVideos || 500;
  const timeoutMs = options?.timeoutMs || 5 * 60 * 1000;
  const sinceDate = options?.sinceDate;
  const startTime = Date.now();
  const profile = await fetchTikTokProfile(handle);

  if (profile.isPrivate) {
    throw new Error(
      `The account @${profile.uniqueId} is private. Only public accounts can be scraped.`
    );
  }

  // Mirror Instagram scrapeReels: in-window + min-sample backfill.
  const inWindowVideos: TikTokVideoData[] = [];
  const backfillVideos: TikTokVideoData[] = [];
  const seenAwemeIds = new Set<string>();
  const seenCursors = new Set<number>();
  const combinedCount = () => inWindowVideos.length + backfillVideos.length;

  let maxCursor: number | undefined;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = 100;
  let consecutiveInWindowEmptyPages = 0;
  let stoppedReason = "";

  while (hasMore && pageCount < maxPages) {
    if (Date.now() - startTime > timeoutMs) {
      stoppedReason = `timeout after ${Math.round((Date.now() - startTime) / 1000)}s`;
      console.warn(
        `[TikTok] Scrape timeout for @${profile.uniqueId} after ${pageCount} pages, ${combinedCount()} videos collected`
      );
      break;
    }

    if (combinedCount() >= maxVideos) {
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
    let foundInWindowThisPage = false;
    const pageNewVideos: TikTokVideoData[] = [];

    for (const video of page.videos) {
      if (seenAwemeIds.has(video.awemeId)) continue;
      if (Number.isNaN(video.postedAt.getTime())) continue;
      seenAwemeIds.add(video.awemeId);

      // is_top harden (scrapeTikTokVideos classification loop):
      // Pinned items (is_top === 1) are collected normally (in-window or
      // backfill by postedAt). They are excluded from the timeframe cutoff
      // decision: we never early-stop on `postedAt < sinceDate` for isTop
      // items. Stop uses Instagram's consecutiveInWindowEmptyPages shape only.
      const inWindow = !sinceDate || video.postedAt >= sinceDate;
      if (inWindow) {
        inWindowVideos.push(video);
        pageNewVideos.push(video);
        foundInWindowThisPage = true;
        if (combinedCount() >= maxVideos) break;
        continue;
      }

      // Out-of-window (including pinned): hold in memory only until the loop
      // ends. Progressive inserts must not persist pins that appear before
      // in-window posts when the window later meets MIN_SPY_DISPLAY_REELS.
      if (combinedCount() < MIN_SPY_DISPLAY_REELS) {
        const backfillVideo: TikTokVideoData = {
          ...video,
          outsideSpyWindow: true,
        };
        backfillVideos.push(backfillVideo);
        if (combinedCount() >= maxVideos) break;
      }
    }

    if (foundInWindowThisPage) {
      consecutiveInWindowEmptyPages = 0;
    } else {
      consecutiveInWindowEmptyPages++;
    }

    if (onProgress && pageNewVideos.length > 0) {
      onProgress(inWindowVideos.length, pageNewVideos);
    }

    if (!page.hasMore || page.nextCursor === null) {
      hasMore = false;
    } else if (seenCursors.has(page.nextCursor)) {
      hasMore = false;
      stoppedReason = "repeated pagination cursor";
      console.warn(
        `[TikTok] Repeated max_cursor ${page.nextCursor} for @${profile.uniqueId}, stopping pagination`
      );
    } else if (
      sinceDate &&
      inWindowVideos.length > 0 &&
      consecutiveInWindowEmptyPages >= 3 &&
      combinedCount() >= MIN_SPY_DISPLAY_REELS
    ) {
      hasMore = false;
      stoppedReason = "in-window window exhausted with minimum sample met";
    } else {
      seenCursors.add(page.nextCursor);
      maxCursor = page.nextCursor;
    }
  }

  const neededBackfill =
    inWindowVideos.length < MIN_SPY_DISPLAY_REELS ? backfillVideos : [];
  if (neededBackfill.length > 0 && onProgress) {
    onProgress(
      inWindowVideos.length + neededBackfill.length,
      neededBackfill
    );
  }

  const videos = [...inWindowVideos, ...neededBackfill];
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const backfillNote =
    neededBackfill.length > 0
      ? `, in_window=${inWindowVideos.length}, backfill=${neededBackfill.length}`
      : inWindowVideos.length >= MIN_SPY_DISPLAY_REELS && backfillVideos.length > 0
        ? `, in_window=${inWindowVideos.length}, backfill_discarded=${backfillVideos.length}`
        : "";
  console.log(
    `[TikTok] Scraped ${videos.length} videos for @${profile.uniqueId} in ${elapsed}s (${pageCount} pages, ${profile.followerCount} followers${backfillNote}${stoppedReason ? `, stopped: ${stoppedReason}` : ""})`
  );

  return {
    videos,
    followerCount: profile.followerCount,
    profilePicUrl: profile.avatarUrl,
  };
}
