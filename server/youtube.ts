/**
 * YouTube Shorts data via ScrapeCreators API (https://api.scrapecreators.com).
 * Uses global fetch with x-api-key (same pattern as server/tiktok.ts).
 */

import {
  meterScrapeCreatorsRequest,
  meterScrapeCreatorsResponse,
} from "./scrapeCreatorsMeter";
import { MIN_SPY_DISPLAY_REELS } from "@shared/spyReelsLimits";
import {
  attemptTimeoutMs,
  budgetExpiredOrTight,
  createLookupBudget,
  linkAbortSignal,
  type LookupBudget,
  type LookupBudgetOptions,
} from "./providerLookupBudget";

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
  query: Record<string, string | undefined>,
  opts?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<{ status: number; data: any }> {
  if (opts?.signal?.aborted) {
    return { status: 408, data: { error: "scrapecreators_request_timeout" } };
  }
  const metered = meterScrapeCreatorsRequest();
  if (metered) return metered;
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const unlink = linkAbortSignal(controller, opts?.signal);
  const timeout = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? SCRAPECREATORS_FETCH_MS
  );
  let response: Response;

  try {
    response = await fetch(url.toString(), {
      headers: { "x-api-key": requireApiKey() },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      meterScrapeCreatorsResponse(408);
      return {
        status: 408,
        data: { error: "scrapecreators_request_timeout" },
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    unlink();
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

  meterScrapeCreatorsResponse(response.status);
  return { status: response.status, data };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanYouTubeHandle(handle: string): string {
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
    /not found|does not exist|no such channel|channel not found/i.test(message)
  );
}

export interface YouTubeChannelInfo {
  channelId: string;
  handle: string;
  name: string;
  isVerified: boolean;
  subscriberCount: number;
  description: string;
  avatarUrl: string;
}

export interface YouTubeVideoData {
  videoId: string;
  title: string;
  description: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  videoPageUrl: string;
  durationSec: number;
  postedAt: Date;
  ownerHandle: string;
  /** True when collected only to reach MIN_SPY_DISPLAY_REELS (older than spy window). */
  outsideSpyWindow?: boolean;
}

export interface YouTubeScrapeResult {
  videos: YouTubeVideoData[];
  subscriberCount: number;
  profilePicUrl: string;
}

export interface YouTubeTranscriptResult {
  transcript: string;
  segments: Array<{ start: number; end: number; text: string }>;
}

export async function fetchYouTubeChannel(
  handle: string,
  options?: LookupBudgetOptions
): Promise<YouTubeChannelInfo> {
  const cleanHandle = cleanYouTubeHandle(handle);
  const budget = options ? createLookupBudget(options) : undefined;
  const maxTries = budget?.maxAttempts ?? 5;
  try {
    return await fetchYouTubeChannelBudgeted(cleanHandle, budget, maxTries);
  } finally {
    budget?.stop();
  }
}

async function fetchYouTubeChannelBudgeted(
  cleanHandle: string,
  budget: LookupBudget | undefined,
  maxTries: number
): Promise<YouTubeChannelInfo> {
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    if (budgetExpiredOrTight(budget)) {
      throw new Error("scrapecreators_request_timeout");
    }
    const { status, data } = await scGet(
      "/v1/youtube/channel",
      { handle: cleanHandle },
      budget
        ? {
            timeoutMs: attemptTimeoutMs(budget, SCRAPECREATORS_FETCH_MS),
            signal: budget.signal,
          }
        : undefined
    );

    if (status === 408 || data?.error === "scrapecreators_request_timeout") {
      if (attempt < maxTries && !budgetExpiredOrTight(budget)) {
        if (budget) await budget.sleep(400);
        else await sleep(1000 * attempt);
        continue;
      }
      throw new Error("scrapecreators_request_timeout");
    }

    if (responseLooksNotFound(status, data)) {
      throw new Error(
        `Channel "@${cleanHandle}" not found. Please check the handle and try again.`
      );
    }

    if (status === 429) {
      if (attempt < maxTries && !budgetExpiredOrTight(budget)) {
        if (budget) await budget.sleep(400);
        else await sleep(2000 * attempt);
        continue;
      }
      throw new Error(
        "YouTube rate limit reached. Please wait a few minutes and try again."
      );
    }

    if (
      status !== 200 ||
      !data ||
      typeof data !== "object" ||
      (data as any).success === false
    ) {
      if (attempt < maxTries && !budgetExpiredOrTight(budget)) {
        if (budget) await budget.sleep(400);
        else await sleep(1000 * attempt);
        continue;
      }
      const vendorMessage = readErrorMessage(data);
      throw new Error(
        vendorMessage
          ? `Failed to fetch YouTube channel for "@${cleanHandle}": ${vendorMessage}`
          : `Failed to fetch YouTube channel for "@${cleanHandle}": HTTP ${status}`
      );
    }

    const channelId = String((data as any).channelId ?? "");
    if (!channelId) {
      const vendorMessage = readErrorMessage(data);
      if (attempt < maxTries && !budgetExpiredOrTight(budget)) {
        console.warn(
          `[YouTube] Invalid channel response for @${cleanHandle} ` +
            `(attempt ${attempt}/${maxTries})${vendorMessage ? `: ${vendorMessage}` : ""}`
        );
        if (budget) await budget.sleep(400);
        else await sleep(600 * attempt);
        continue;
      }
      throw new Error(
        vendorMessage
          ? `Failed to fetch YouTube channel for "@${cleanHandle}": ${vendorMessage}`
          : `Channel "@${cleanHandle}" not found or is not accessible.`
      );
    }

    const avatarSources = (data as any).avatar?.image?.sources;
    const avatarUrl =
      Array.isArray(avatarSources) && avatarSources[0]?.url
        ? String(avatarSources[0].url)
        : "";

    return {
      channelId,
      handle: cleanYouTubeHandle(String((data as any).handle || cleanHandle)),
      name: String((data as any).name || ""),
      isVerified: !!(data as any).isVerified,
      subscriberCount: toFiniteNumber((data as any).subscriberCount),
      description: String((data as any).description || ""),
      avatarUrl,
    };
  }

  throw new Error(
    `Failed to fetch YouTube channel for "@${cleanHandle}" after ${maxTries} attempts.`
  );
}

function parseYouTubeShort(
  item: any,
  fallbackHandle: string
): YouTubeVideoData | null {
  const videoId = String(item?.id ?? "");
  if (!videoId) return null;

  const postedAt = new Date(String(item?.publishDate ?? ""));
  if (Number.isNaN(postedAt.getTime())) return null;

  const durationMs = toFiniteNumber(item?.durationMs);
  const videoPageUrl = String(
    item?.url || `https://www.youtube.com/watch?v=${videoId}`
  );

  return {
    videoId,
    title: String(item?.title || ""),
    description: String(item?.description || ""),
    viewCount: toFiniteNumber(item?.viewCountInt),
    likeCount: toFiniteNumber(item?.likeCountInt),
    commentCount: toFiniteNumber(item?.commentCountInt),
    thumbnailUrl: String(item?.thumbnail || ""),
    videoPageUrl,
    durationSec: Math.round(durationMs / 1000),
    postedAt,
    ownerHandle: fallbackHandle,
  };
}

async function fetchYouTubeShortsPage(
  handle: string,
  continuationToken?: string
): Promise<{
  videos: YouTubeVideoData[];
  nextContinuationToken: string | null;
}> {
  const cleanHandle = cleanYouTubeHandle(handle);
  const maxTries = continuationToken === undefined ? 8 : 3;

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const { status, data } = await scGet("/v1/youtube/channel/shorts", {
      handle: cleanHandle,
      sort: "newest",
      continuationToken:
        continuationToken === undefined ? undefined : continuationToken,
    });

    if (responseLooksNotFound(status, data)) {
      throw new Error(
        `Channel "@${cleanHandle}" not found. Please check the handle and try again.`
      );
    }

    if (status === 429) {
      if (attempt < maxTries) {
        console.warn(
          `[YouTube] Rate limited on channel/shorts for @${cleanHandle} ` +
            `(attempt ${attempt}/${maxTries}), waiting 5s`
        );
        await sleep(5000);
        continue;
      }
      throw new Error(
        "YouTube rate limit reached. Please wait a few minutes and try again."
      );
    }

    if (
      status !== 200 ||
      !data ||
      typeof data !== "object" ||
      (data as any).success === false
    ) {
      if (attempt < maxTries) {
        await sleep(1000 * attempt);
        continue;
      }
      const vendorMessage = readErrorMessage(data);
      throw new Error(
        vendorMessage
          ? `Failed to fetch YouTube shorts for "@${cleanHandle}": ${vendorMessage}`
          : `Failed to fetch YouTube shorts for "@${cleanHandle}": HTTP ${status}`
      );
    }

    const rawItems = Array.isArray((data as any).shorts)
      ? (data as any).shorts
      : null;

    if (!rawItems) {
      const vendorMessage = readErrorMessage(data);
      if (attempt < maxTries) {
        console.warn(
          `[YouTube] Invalid channel/shorts response for @${cleanHandle} ` +
            `(attempt ${attempt}/${maxTries})${vendorMessage ? `: ${vendorMessage}` : ""}`
        );
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(
        vendorMessage
          ? `Failed to fetch YouTube shorts for "@${cleanHandle}": ${vendorMessage}`
          : `YouTube returned an invalid shorts response for "@${cleanHandle}".`
      );
    }

    const videos = rawItems
      .map((item: any) => parseYouTubeShort(item, cleanHandle))
      .filter((video: YouTubeVideoData | null): video is YouTubeVideoData =>
        video !== null
      );

    const rawToken = (data as any).continuationToken;
    const nextContinuationToken =
      typeof rawToken === "string" && rawToken.trim() ? rawToken.trim() : null;

    if (
      continuationToken === undefined &&
      rawItems.length === 0 &&
      !nextContinuationToken &&
      attempt < maxTries
    ) {
      console.warn(
        `[YouTube] channel/shorts returned 0 items on first page for @${cleanHandle} ` +
          `(attempt ${attempt}/${maxTries}), retrying`
      );
      await sleep(1500 * attempt);
      continue;
    }

    return { videos, nextContinuationToken };
  }

  return { videos: [], nextContinuationToken: null };
}

export async function scrapeYouTubeShorts(
  handle: string,
  onProgress?: (count: number, pageBatch?: YouTubeVideoData[]) => void,
  options?: { maxVideos?: number; timeoutMs?: number; sinceDate?: Date }
): Promise<YouTubeScrapeResult> {
  const maxVideos = options?.maxVideos || 500;
  const timeoutMs = options?.timeoutMs || 5 * 60 * 1000;
  const sinceDate = options?.sinceDate;
  const startTime = Date.now();
  const channel = await fetchYouTubeChannel(handle);

  // Mirror Instagram scrapeReels: in-window + min-sample backfill.
  const inWindowVideos: YouTubeVideoData[] = [];
  const backfillVideos: YouTubeVideoData[] = [];
  const seenVideoIds = new Set<string>();
  const seenTokens = new Set<string>();
  const combinedCount = () => inWindowVideos.length + backfillVideos.length;

  let continuationToken: string | undefined;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = 100;
  let consecutiveInWindowEmptyPages = 0;
  let stoppedReason = "";

  while (hasMore && pageCount < maxPages) {
    if (Date.now() - startTime > timeoutMs) {
      stoppedReason = `timeout after ${Math.round((Date.now() - startTime) / 1000)}s`;
      console.warn(
        `[YouTube] Scrape timeout for @${channel.handle} after ${pageCount} pages, ${combinedCount()} videos collected`
      );
      break;
    }

    if (combinedCount() >= maxVideos) {
      stoppedReason = `reached ${maxVideos} video cap`;
      console.log(
        `[YouTube] Reached video cap (${maxVideos}) for @${channel.handle} after ${pageCount} pages`
      );
      break;
    }

    pageCount++;

    if (pageCount > 1) {
      const delay = 350 + Math.random() * 400;
      await sleep(delay);
    }

    const page = await fetchYouTubeShortsPage(
      channel.handle,
      continuationToken
    );
    let foundInWindowThisPage = false;
    const pageNewVideos: YouTubeVideoData[] = [];

    for (const video of page.videos) {
      if (seenVideoIds.has(video.videoId)) continue;
      if (Number.isNaN(video.postedAt.getTime())) continue;
      seenVideoIds.add(video.videoId);

      const inWindow = !sinceDate || video.postedAt >= sinceDate;
      if (inWindow) {
        inWindowVideos.push(video);
        pageNewVideos.push(video);
        foundInWindowThisPage = true;
        if (combinedCount() >= maxVideos) break;
        continue;
      }

      // Hold out-of-window candidates in memory only; flush after the loop
      // only if the in-window count is still below MIN_SPY_DISPLAY_REELS.
      if (combinedCount() < MIN_SPY_DISPLAY_REELS) {
        const backfillVideo: YouTubeVideoData = {
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

    if (!page.nextContinuationToken) {
      hasMore = false;
    } else if (seenTokens.has(page.nextContinuationToken)) {
      hasMore = false;
      stoppedReason = "repeated pagination token";
      console.warn(
        `[YouTube] Repeated continuationToken for @${channel.handle}, stopping pagination`
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
      seenTokens.add(page.nextContinuationToken);
      continuationToken = page.nextContinuationToken;
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
    `[YouTube] Scraped ${videos.length} shorts for @${channel.handle} in ${elapsed}s (${pageCount} pages, ${channel.subscriberCount} subscribers${backfillNote}${stoppedReason ? `, stopped: ${stoppedReason}` : ""})`
  );

  return {
    videos,
    subscriberCount: channel.subscriberCount,
    profilePicUrl: channel.avatarUrl,
  };
}

export async function fetchYouTubeTranscript(
  videoPageUrl: string
): Promise<YouTubeTranscriptResult | null> {
  const url = videoPageUrl.trim();
  if (!url) return null;

  // Some Shorts only expose auto-captions without a language pin; try en then any.
  for (const language of ["en", undefined] as const) {
    const maxTries = language === "en" ? 3 : 2;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const { status, data } = await scGet("/v1/youtube/video/transcript", {
          url,
          language,
        });

        if (status === 404 || responseLooksNotFound(status, data)) {
          break;
        }

        if (
          status === 200 &&
          data &&
          typeof data === "object" &&
          (data as any).success !== false
        ) {
          const rawTranscript = (data as any).transcript;
          const combined = (data as any).transcript_only_text;

          if (rawTranscript == null || combined == null) {
            break;
          }

          if (!Array.isArray(rawTranscript)) {
            break;
          }

          const segments = rawTranscript
            .map((segment: any) => {
              const text = String(segment?.text ?? "").trim();
              const startMs = toFiniteNumber(segment?.startMs);
              const endMs = toFiniteNumber(segment?.endMs);
              if (!text) return null;
              return {
                start: startMs / 1000,
                end: endMs / 1000,
                text,
              };
            })
            .filter(
              (
                segment: { start: number; end: number; text: string } | null
              ): segment is { start: number; end: number; text: string } =>
                segment !== null
            );

          const transcript = String(combined).trim();
          if (!transcript || segments.length === 0) {
            break;
          }

          return { transcript, segments };
        }

        if (attempt < maxTries) {
          await sleep(status === 429 ? 2000 * attempt : 1000 * attempt);
        }
      } catch (error) {
        if (attempt >= maxTries) {
          console.warn(
            `[YouTube] Failed to fetch transcript for ${url}:`,
            error instanceof Error ? error.message : error
          );
          break;
        }
        await sleep(1000 * attempt);
      }
    }
  }

  return null;
}

export interface YouTubeVideoDetails {
  videoId: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  durationSec: number;
  postedAt: Date | null;
  ownerUsername: string;
  ownerFullName: string;
  videoPageUrl: string;
}

/**
 * Single YouTube video/Short metadata via ScrapeCreators.
 * Does not return a downloadable MP4 (YouTube remake uses caption transcripts).
 */
export async function fetchYouTubeVideoDetails(
  videoPageUrl: string
): Promise<YouTubeVideoDetails | null> {
  const url = videoPageUrl.trim();
  if (!url) return null;

  const maxTries = 5;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    try {
      const { status, data } = await scGet("/v1/youtube/video", { url });

      if (status === 404 || responseLooksNotFound(status, data)) {
        return null;
      }

      if (
        status === 200 &&
        data &&
        typeof data === "object" &&
        (data as any).success !== false
      ) {
        const videoId = String((data as any).id || "").trim();
        if (!videoId) return null;

        const channel = (data as any).channel || {};
        const durationMs = toFiniteNumber((data as any).durationMs);
        const publishRaw = (data as any).publishDate;
        let postedAt: Date | null = null;
        if (typeof publishRaw === "string" && publishRaw.trim()) {
          const d = new Date(publishRaw);
          if (!Number.isNaN(d.getTime())) postedAt = d;
        }

        return {
          videoId,
          title: String((data as any).title || ""),
          description: String((data as any).description || ""),
          thumbnailUrl: String(
            (data as any).thumbnail ||
              `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
          ),
          viewCount: toFiniteNumber((data as any).viewCountInt),
          likeCount: toFiniteNumber((data as any).likeCountInt),
          commentCount: toFiniteNumber((data as any).commentCountInt),
          durationSec: durationMs > 0 ? Math.round(durationMs / 1000) : 0,
          postedAt,
          ownerUsername: String(channel.handle || channel.id || "").replace(
            /^@/,
            ""
          ),
          ownerFullName: String(channel.title || ""),
          videoPageUrl: String((data as any).url || url),
        };
      }

      if (attempt < maxTries) {
        await sleep(status === 429 ? 2000 * attempt : 1000 * attempt);
      }
    } catch (error) {
      if (attempt >= maxTries) {
        console.warn(
          `[YouTube] Failed to fetch video details for ${url}:`,
          error instanceof Error ? error.message : error
        );
        return null;
      }
      await sleep(1000 * attempt);
    }
  }

  return null;
}
