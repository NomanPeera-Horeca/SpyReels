/**
 * Instagram data via ScrapeCreators API (https://api.scrapecreators.com).
 * Uses global fetch with x-api-key (no direct Instagram mobile API calls).
 */

import { parseInstagramReelShortcode } from "./instagramUrl";

const API_BASE = "https://api.scrapecreators.com";

function requireApiKey(): string {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) {
    throw new Error("SCRAPECREATORS_API_KEY is not configured.");
  }
  return key;
}

const SCRAPECREATORS_FETCH_MS = 30_000;

async function scGet(
  path: string,
  query: Record<string, string | undefined>
): Promise<{ status: number; data: any }> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") {
      url.searchParams.set(k, v);
    }
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), SCRAPECREATORS_FETCH_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "x-api-key": requireApiKey() },
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return { status: 408, data: { error: "scrapecreators_request_timeout" } };
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
  let data: any = null;
  const text = await res.text();
  if (text?.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  console.log(
    `[Bug #64 diag] scGet path=${path} status=${res.status} bodyLength=${text.length}`
  );
  return { status: res.status, data };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ReelData {
  shortcode: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  videoUrl: string;
  reelUrl: string;
  duration: number;
  postedAt: Date;
  ownerUsername: string;
}

/* ------------------------------------------------------------------ */
/*  Profile lookup                                                     */
/* ------------------------------------------------------------------ */

export interface ProfileInfo {
  userId: string;
  username: string;
  isPrivate: boolean;
  followerCount: number;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  postCount: number;
  followingCount: number;
  isVerified: boolean;
  category: string;
  externalUrl: string;
}

type VendorEnvelopeFailure = "rate_limit" | "not_found" | "private" | "generic";

function readVendorEnvelope(data: unknown): {
  vendorError: string;
  vendorMsg: string;
  errorStatus: number | undefined;
} {
  if (!data || typeof data !== "object") {
    return { vendorError: "", vendorMsg: "", errorStatus: undefined };
  }
  const d = data as Record<string, unknown>;
  return {
    vendorError: typeof d.error === "string" ? d.error : "",
    vendorMsg: typeof d.message === "string" ? d.message : "",
    errorStatus: typeof d.errorStatus === "number" ? d.errorStatus : undefined,
  };
}

/** Classify ScrapeCreators HTTP-200 error envelopes when `data.data.user` is missing. */
function classifyVendorEnvelopeFailure(data: unknown): VendorEnvelopeFailure | null {
  const { vendorError, vendorMsg, errorStatus } = readVendorEnvelope(data);
  const errLower = vendorError.toLowerCase();
  const msgLower = vendorMsg.toLowerCase();

  if (
    errorStatus === 429 ||
    /rate limit|429|too many requests|throttle|temporarily blocked/i.test(vendorMsg) ||
    /rate limit|429|too many requests|throttle|temporarily blocked/i.test(vendorError)
  ) {
    return "rate_limit";
  }

  if (
    errorStatus === 404 ||
    errLower.includes("not_found") ||
    /not found|does not exist|user not found|no such user/i.test(msgLower) ||
    /not found|does not exist|user not found|no such user/i.test(errLower)
  ) {
    return "not_found";
  }

  if (/private|protected/i.test(msgLower) || /private|protected/i.test(errLower)) {
    return "private";
  }

  if (vendorError || vendorMsg || errorStatus !== undefined) {
    return "generic";
  }

  return null;
}

function shouldRetryVendorFailure(kind: VendorEnvelopeFailure): boolean {
  return kind === "rate_limit" || kind === "generic";
}

export async function fetchProfile(handle: string): Promise<ProfileInfo> {
  const cleanHandle = handle.replace(/^@/, "").trim();
  // ScrapeCreators occasionally responds with HTTP 200 plus an inline
  // error envelope (e.g. `{error:"not_found", errorStatus:404,
  // message:"Profile is restricted"}`) when one of their scraper accounts
  // or proxies is blocked by Instagram for a given handle. The same call
  // succeeds on a different attempt because they rotate accounts. Retry a
  // moderate number of times before surfacing the error so verified public
  // profiles don't get mislabelled as "not found".
  //
  // Observed base success rate for "hard" handles is ~1/6, so 5 attempts
  // gets us to ~60% success per preview call. Backoff is short (600ms·N)
  // because preview runs inline on handle change and a 30s spinner feels
  // broken; the scrape worker can absorb extra latency separately by
  // retrying the whole job if needed.
  const MAX_TRIES = 5;
  const BACKOFF_MS = 600;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const { status, data } = await scGet("/v1/instagram/profile", {
      handle: cleanHandle,
    });

    if (status === 404) {
      throw new Error(
        `User "@${cleanHandle}" not found. Please check the username and try again.`
      );
    }
    if (status === 429) {
      if (attempt < MAX_TRIES) {
        await sleep(2000 * attempt);
        continue;
      }
      throw new Error(
        `Instagram rate limit reached. Please wait a few minutes and try again.`
      );
    }
    if (status !== 200 || !data) {
      if (attempt < MAX_TRIES) {
        await sleep(1000 * attempt);
        continue;
      }
      throw new Error(`Failed to fetch profile for "@${cleanHandle}": HTTP ${status}`);
    }

    const user = data?.data?.user;
    if (!user) {
      const failureKind = classifyVendorEnvelopeFailure(data);
      const { vendorError, vendorMsg } = readVendorEnvelope(data);

      if (failureKind === "not_found") {
        throw new Error(
          `User "@${cleanHandle}" not found. Please check the username and try again.`
        );
      }
      if (failureKind === "private") {
        throw new Error(
          `The account @${cleanHandle} is private. Only public accounts can be analyzed.`
        );
      }
      if (failureKind && shouldRetryVendorFailure(failureKind) && attempt < MAX_TRIES) {
        console.warn(
          `[Instagram] Vendor ${failureKind} envelope for @${cleanHandle} ` +
            `(attempt ${attempt}/${MAX_TRIES}): ${vendorError} ${vendorMsg}`.trim()
        );
        await sleep(BACKOFF_MS * attempt);
        continue;
      }
      if (failureKind === "rate_limit") {
        throw new Error(
          `Instagram is temporarily rate limiting access to "@${cleanHandle}". ` +
            `Please try again in a few minutes.`
        );
      }
      if (failureKind === "generic") {
        throw new Error(
          `We couldn't load @${cleanHandle}'s profile right now. Please try again in a few minutes.`
        );
      }
      throw new Error(`User "@${cleanHandle}" not found or the profile is not accessible.`);
    }

    return {
      userId: String(user.id ?? ""),
      username: user.username || cleanHandle,
      isPrivate: !!user.is_private,
      followerCount: user.edge_followed_by?.count ?? 0,
      fullName: user.full_name || "",
      biography: user.biography || "",
      profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || "",
      postCount: user.edge_owner_to_timeline_media?.count ?? user.media_count ?? 0,
      followingCount: user.edge_follow?.count ?? user.following_count ?? 0,
      isVerified: !!user.is_verified,
      category: user.category_name || user.category || "",
      externalUrl: user.external_url || "",
    };
  }

  throw new Error(
    `Failed to fetch profile for "@${cleanHandle}" after ${MAX_TRIES} attempts.`
  );
}

/* ------------------------------------------------------------------ */
/*  User reels pagination                                              */
/* ------------------------------------------------------------------ */

interface ClipsPage {
  items: any[];
  moreAvailable: boolean;
  maxId: string | null;
}

async function fetchUserReelsPage(
  handle: string,
  maxId: string | null
): Promise<ClipsPage> {
  const cleanHandle = handle.replace(/^@/, "").trim();
  const query: Record<string, string | undefined> = { handle: cleanHandle };
  if (maxId) {
    query.max_id = maxId;
  }

  // The vendor flakes on user/reels in two ways:
  //   1. HTTP 404 with `{error:"not_found", message:"Profile is restricted"}`
  //   2. HTTP 200 with `{items: [], paging_info: {...}}` — a clean "empty
  //      success" even when the account has 100+ reels.
  // Both happen on certain scraper-account/proxy assignments and resolve on
  // retry. We only retry on the first page (maxId === null); on subsequent
  // pages empty results legitimately mean "no more".
  //
  // Observed base success rate for "hard" handles is ~1/6, so 8 attempts
  // gets us to ~77% success on the first page. This only runs inside the
  // background scrape worker (or admin search), so the longer total wait
  // is acceptable — much better than failing a scrape and burning a quota
  // slot.
  const MAX_TRIES = maxId ? 1 : 8;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    let { status, data } = await scGet("/v1/instagram/user/reels", query);

    if (status === 429) {
      console.warn(
        `[Instagram] Rate limited on user/reels for @${cleanHandle} ` +
          `(attempt ${attempt}/${MAX_TRIES}), waiting 5s…`
      );
      await sleep(5000);
      const retry = await scGet("/v1/instagram/user/reels", query);
      status = retry.status;
      data = retry.data;
    }

    const vendorError =
      data && typeof data === "object" && typeof (data as any).error === "string"
        ? (data as any).error
        : "";
    const vendorMsg =
      data && typeof data === "object" && typeof (data as any).message === "string"
        ? (data as any).message
        : "";
    const isVendorRestriction =
      !!vendorError ||
      (data && typeof data === "object" && (data as any).errorStatus === 404) ||
      /restricted/i.test(vendorMsg);

    if (status === 404 || isVendorRestriction) {
      if (attempt < MAX_TRIES) {
        console.warn(
          `[Instagram] user/reels restricted for @${cleanHandle} ` +
            `(attempt ${attempt}/${MAX_TRIES}, status ${status}, ${vendorError} ${vendorMsg}), retrying…`
        );
        await sleep(1500 * attempt);
        continue;
      }
      console.warn(
        `[Instagram] user/reels remained restricted for @${cleanHandle} after ${MAX_TRIES} attempts.`
      );
      return { items: [], moreAvailable: false, maxId: null };
    }

    if (status !== 200 || !data) {
      if (attempt < MAX_TRIES) {
        await sleep(1000 * attempt);
        continue;
      }
      console.warn(
        `[Instagram] user/reels returned HTTP ${status} for @${cleanHandle}, stopping pagination.`
      );
      return { items: [], moreAvailable: false, maxId: null };
    }

    const items: any[] = Array.isArray((data as any).items) ? (data as any).items : [];
    const moreAvailable = (data as any)?.paging_info?.more_available || false;
    const nextMaxId = (data as any)?.paging_info?.max_id ?? null;

    if (!maxId && items.length === 0 && !moreAvailable && attempt < MAX_TRIES) {
      console.warn(
        `[Instagram] user/reels returned 0 items on first page for @${cleanHandle} ` +
          `(attempt ${attempt}/${MAX_TRIES}), retrying — likely vendor session flake…`
      );
      await sleep(1500 * attempt);
      continue;
    }

    return { items, moreAvailable, maxId: nextMaxId };
  }

  return { items: [], moreAvailable: false, maxId: null };
}

/* ------------------------------------------------------------------ */
/*  Timestamp normalization (clips + post payloads)                   */
/* ------------------------------------------------------------------ */

/** Instagram timestamps are usually unix seconds; APIs sometimes emit strings ("1736294201"),
 * which `new Date(...)` parses as Invalid Date and then fail every `postedAt >= cutoff` check.
 */
export function coerceInstagramTakenAtRaw(raw: unknown): Date | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      const ms = n < 1e12 ? n * 1000 : n;
      const d = new Date(ms);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function postedAtFromClipMedia(media: any): Date {
  const d =
    coerceInstagramTakenAtRaw(media?.taken_at) ??
    coerceInstagramTakenAtRaw(media?.taken_at_timestamp);
  if (d) return d;
  return new Date();
}

/** Extract reels `media` object from `/v1/instagram/user/reels` rows (handles minor shape drift). */
function extractClipMedia(item: any): any | null {
  if (!item) return null;
  if (item.media && typeof item.media === "object") return item.media;
  if (typeof item.code === "string" && item.code.length > 0) return item;
  return null;
}

/* ------------------------------------------------------------------ */
/*  Parse a clips item into ReelData                                   */
/* ------------------------------------------------------------------ */

function parseClipItem(item: any, ownerUsername: string): ReelData | null {
  const media = extractClipMedia(item);
  if (!media) return null;

  const shortcode = media.code || "";
  if (!shortcode) return null;

  const caption = media.caption?.text || "";
  const viewCount = media.play_count ?? media.view_count ?? 0;
  const likeCount = media.like_count ?? 0;
  const commentCount = media.comment_count ?? 0;
  const thumbnailUrl =
    media.image_versions2?.candidates?.[0]?.url ||
    media.thumbnail_src ||
    media.display_url ||
    "";
  const videoUrl = media.video_versions?.[0]?.url || media.video_url || "";
  const duration = Math.round(Number(media.video_duration) || 0);
  const postedAt = postedAtFromClipMedia(media);

  const reelUrl =
    typeof media.url === "string" && media.url
      ? media.url
      : `https://www.instagram.com/reel/${shortcode}/`;

  return {
    shortcode,
    caption,
    viewCount,
    likeCount,
    commentCount,
    thumbnailUrl,
    videoUrl,
    reelUrl,
    duration,
    postedAt,
    ownerUsername: media.user?.username || ownerUsername,
  };
}

/* ------------------------------------------------------------------ */
/*  Main scraper                                                       */
/* ------------------------------------------------------------------ */

export interface ScrapeResult {
  reels: ReelData[];
  followerCount: number;
  profilePicUrl: string;
  /** Total reel items vendor returned and we parsed, regardless of the
   * date-window filter. Lets the caller tell apart "vendor gave us
   * nothing" (0) from "account just hasn't posted recently" (>0 with
   * reels.length === 0). */
  totalParsedItems: number;
  /** Most recent posted date across ALL parsed items, regardless of the
   * date-window filter. Null when no items parsed. */
  mostRecentItemAt: Date | null;
}

export async function scrapeReels(
  handle: string,
  timeframeDays: number,
  onProgress?: (count: number) => void,
  options?: { maxReels?: number; timeoutMs?: number }
): Promise<ScrapeResult> {
  const maxReels = options?.maxReels || 500;
  const timeoutMs = options?.timeoutMs || 5 * 60 * 1000;
  const startTime = Date.now();

  const profile = await fetchProfile(handle);

  if (profile.isPrivate) {
    throw new Error(
      `The account @${profile.username} is private. Only public accounts can be scraped.`
    );
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

  const allReels: ReelData[] = [];
  const seenShortcodes = new Set<string>();

  let maxId: string | null = null;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = 100;
  let consecutiveEmptyPages = 0;
  let stoppedReason = "";
  /** API returned rows we could not map to ReelData (shape drift / new fields). */
  let pagesWithItemsButNoParses = 0;
  let warnedUnparseablePage = false;
  /** Most recent reel date across ALL parsed items, including those
   * outside the timeframe window — used by callers to surface a clear
   * "account hasn't posted in N days" message. */
  let mostRecentItemAt: Date | null = null;

  while (hasMore && pageCount < maxPages) {
    if (Date.now() - startTime > timeoutMs) {
      stoppedReason = `timeout after ${Math.round((Date.now() - startTime) / 1000)}s`;
      console.warn(
        `[Instagram] Scrape timeout for @${handle} after ${pageCount} pages, ${allReels.length} reels collected`
      );
      break;
    }

    if (allReels.length >= maxReels) {
      stoppedReason = `reached ${maxReels} reel cap`;
      console.log(
        `[Instagram] Reached reel cap (${maxReels}) for @${handle} after ${pageCount} pages`
      );
      break;
    }

    pageCount++;

    // Gentle pacing between ScrapeCreators pages (429 retry still applies).
    // 1–2s per page stacks to many minutes on wide windows; a shorter jitter
    // keeps rate-limit headroom without dominating wall time.
    if (pageCount > 1) {
      const delay = 350 + Math.random() * 400;
      await sleep(delay);
    }

    const page = await fetchUserReelsPage(profile.username, maxId);

    if (page.items.length === 0) {
      hasMore = false;
      break;
    }

    let foundInRangeThisPage = false;
    let parsedThisPage = 0;

    for (const item of page.items) {
      const reel = parseClipItem(item, profile.username);
      if (!reel) continue;
      parsedThisPage++;

      if (seenShortcodes.has(reel.shortcode)) continue;
      seenShortcodes.add(reel.shortcode);

      if (Number.isNaN(reel.postedAt.getTime())) continue;

      if (!mostRecentItemAt || reel.postedAt > mostRecentItemAt) {
        mostRecentItemAt = reel.postedAt;
      }

      if (reel.postedAt >= cutoffDate) {
        allReels.push(reel);
        foundInRangeThisPage = true;

        if (allReels.length >= maxReels) break;
      }
    }

    if (parsedThisPage === 0) {
      // Rows we couldn't parse: don't interpret as "past the date window".
      if (page.items.length > 0) {
        pagesWithItemsButNoParses++;
        if (!warnedUnparseablePage) {
          warnedUnparseablePage = true;
          const keys =
            page.items[0] && typeof page.items[0] === "object"
              ? Object.keys(page.items[0] as object).slice(0, 12).join(",")
              : "";
          console.warn(
            `[Instagram] @${profile.username} page ${pageCount}: ${page.items.length} items, 0 parseable (top-level keys: ${keys || "n/a"}). Possible ScrapeCreators payload change.`
          );
        }
      }
    } else if (foundInRangeThisPage) {
      consecutiveEmptyPages = 0;
    } else {
      consecutiveEmptyPages++;
    }

    if (onProgress) {
      onProgress(allReels.length);
    }

    if (!page.moreAvailable || !page.maxId || consecutiveEmptyPages >= 3) {
      hasMore = false;
    } else {
      maxId = page.maxId;
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const shapeWarning =
    pagesWithItemsButNoParses > 0
      ? `, unparseable_pages=${pagesWithItemsButNoParses}`
      : "";
  console.log(
    `[Instagram] Scraped ${allReels.length} reels for @${profile.username} in ${elapsed}s (${pageCount} pages, ${seenShortcodes.size} total seen, ${profile.followerCount} followers${stoppedReason ? `, stopped: ${stoppedReason}` : ""}${shapeWarning})`
  );

  return {
    reels: allReels,
    followerCount: profile.followerCount,
    profilePicUrl: profile.profilePicUrl,
    totalParsedItems: seenShortcodes.size,
    mostRecentItemAt,
  };
}

/* ------------------------------------------------------------------ */
/*  Fetch individual reel by shortcode (for transcription)             */
/* ------------------------------------------------------------------ */

export interface ReelFullData {
  videoUrl: string;
  thumbnailUrl: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: number;
  postedAt: Date;
  ownerUsername: string;
  ownerFullName: string;
  ownerProfilePicUrl: string;
  ownerFollowerCount: number;
}

function normalizeShortcode(raw: string): string {
  return parseInstagramReelShortcode(raw) ?? "";
}

/** Follow redirects for share / redirect links before ScrapeCreators fetch. */
async function resolveInstagramPostUrl(rawUrl: string): Promise<string> {
  const trimmed = rawUrl.trim();
  if (!/instagram\.com|instagr\.am/i.test(trimmed)) return trimmed;
  if (parseInstagramReelShortcode(trimmed)) return trimmed;

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

function extractPostMediaFromResponse(data: unknown): any | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const inner = root.data;
  if (!inner || typeof inner !== "object") return null;
  const d = inner as Record<string, unknown>;
  return (
    d.xdt_shortcode_media ??
    d.shortcode_media ??
    d.media ??
    d.item ??
    null
  );
}

function mapPostMediaToReelFull(item: any): ReelFullData | null {
  if (!item) return null;

  const owner = item.user || item.owner || {};
  const postedAt =
    coerceInstagramTakenAtRaw(item.taken_at_timestamp) ??
    coerceInstagramTakenAtRaw(item.taken_at) ??
    new Date();

  const captionEdge = item.edge_media_to_caption?.edges?.[0]?.node?.text;
  const caption =
    item.caption?.text ??
    captionEdge ??
    "";

  return {
    videoUrl: item.video_url || item.video_versions?.[0]?.url || "",
    thumbnailUrl:
      item.thumbnail_src ||
      item.display_url ||
      item.image_versions2?.candidates?.[0]?.url ||
      "",
    caption,
    viewCount: item.video_play_count ?? item.play_count ?? item.view_count ?? item.video_view_count ?? 0,
    likeCount: item.like_count ?? item.edge_media_preview_like?.count ?? 0,
    commentCount: item.comment_count ?? item.edge_media_to_parent_comment?.count ?? 0,
    duration: Math.round(Number(item.video_duration) || 0),
    postedAt,
    ownerUsername: owner.username || "",
    ownerFullName: owner.full_name || "",
    ownerProfilePicUrl: owner.profile_pic_url || "",
    ownerFollowerCount: owner.edge_followed_by?.count ?? owner.follower_count ?? 0,
  };
}

export type ReelFetchFailureReason =
  | "not_found"
  | "private"
  | "rate_limit"
  | "timeout"
  | "api_error"
  | "unknown";

export function reelFetchFailureMessage(reason: ReelFetchFailureReason): string {
  switch (reason) {
    case "not_found":
      return "Could not load this reel after several attempts. Open it in the Instagram app, copy the link again, and retry.";
    case "private":
      return "This reel is from a private or restricted account and cannot be fetched.";
    case "rate_limit":
      return "Instagram data provider is temporarily rate limited. Please retry in a few minutes.";
    case "timeout":
      return "Fetching reel data timed out. Please retry.";
    case "api_error":
      return "Instagram data provider returned an error. Please retry in a few minutes.";
    default:
      return "Could not fetch reel data from Instagram. Please retry.";
  }
}

export type FetchReelByShortcodeResult =
  | { ok: true; data: ReelFullData }
  | { ok: false; reason: ReelFetchFailureReason };

function postUrlsForShortcode(code: string, preferUrl?: string): string[] {
  const urls: string[] = [];
  const trimmedPrefer = preferUrl?.trim();
  if (trimmedPrefer && /instagram\.com|instagr\.am/i.test(trimmedPrefer)) {
    urls.push(trimmedPrefer);
  }
  urls.push(`https://www.instagram.com/reel/${code}/`);
  urls.push(`https://www.instagram.com/p/${code}/`);
  return [...new Set(urls)];
}

function regionForReelFetchAttempt(attempt: number): string | undefined {
  if (attempt >= 4) return "GB";
  if (attempt >= 3) return "US";
  return undefined;
}

/**
 * Fetch a single reel/post by shortcode (or full Instagram URL).
 * Retries transient ScrapeCreators failures (same pattern as fetchProfile).
 */
export async function fetchReelByShortcodeResult(
  shortcode: string,
  options?: { preferUrl?: string; downloadMedia?: boolean }
): Promise<FetchReelByShortcodeResult> {
  const resolvedPrefer = options?.preferUrl
    ? await resolveInstagramPostUrl(options.preferUrl)
    : undefined;
  const code = normalizeShortcode(resolvedPrefer || shortcode);
  if (!code) return { ok: false, reason: "not_found" };

  const urls = postUrlsForShortcode(code, resolvedPrefer);
  const MAX_TRIES = 6;
  const BACKOFF_MS = 600;

  let lastReason: ReelFetchFailureReason = "unknown";

  for (const postUrl of urls) {
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const region = regionForReelFetchAttempt(attempt);
      const { status, data } = await scGet("/v1/instagram/post", {
        url: postUrl,
        region,
        download_media: options?.downloadMedia ? "true" : undefined,
      });

      if (status === 408) {
        lastReason = "timeout";
        if (attempt < MAX_TRIES) {
          await sleep(BACKOFF_MS * attempt);
          continue;
        }
        break;
      }

      if (status === 429) {
        lastReason = "rate_limit";
        if (attempt < MAX_TRIES) {
          await sleep(2000 * attempt);
          continue;
        }
        break;
      }

      if (status === 404) {
        lastReason = "not_found";
        if (attempt < MAX_TRIES) {
          console.warn(
            `[Instagram] HTTP 404 for reel ${code} url=${postUrl} (attempt ${attempt}/${MAX_TRIES}), retrying`
          );
          await sleep(BACKOFF_MS * attempt);
          continue;
        }
        break;
      }

      if (status !== 200 || !data) {
        lastReason = status >= 500 ? "api_error" : "unknown";
        if (attempt < MAX_TRIES) {
          await sleep(status >= 500 ? 1000 * attempt : BACKOFF_MS * attempt);
          continue;
        }
        break;
      }

      const media = extractPostMediaFromResponse(data);
      if (media) {
        const mapped = mapPostMediaToReelFull(media);
        return mapped ? { ok: true, data: mapped } : { ok: false, reason: "unknown" };
      }

      const failureKind = classifyVendorEnvelopeFailure(data);
      const { vendorError, vendorMsg } = readVendorEnvelope(data);

      if (failureKind === "not_found") {
        lastReason = "not_found";
        if (attempt < MAX_TRIES) {
          console.warn(
            `[Instagram] Vendor not_found for reel ${code} (attempt ${attempt}/${MAX_TRIES}): ${vendorError} ${vendorMsg}`.trim()
          );
          await sleep(BACKOFF_MS * attempt);
          continue;
        }
        break;
      }
      if (failureKind === "private") {
        lastReason = "private";
        break;
      }
      if (failureKind === "rate_limit") {
        lastReason = "rate_limit";
        if (attempt < MAX_TRIES) {
          console.warn(
            `[Instagram] Vendor rate_limit for reel ${code} (attempt ${attempt}/${MAX_TRIES}): ${vendorError} ${vendorMsg}`.trim()
          );
          await sleep(2000 * attempt);
          continue;
        }
        break;
      }
      if (failureKind === "generic") {
        lastReason = "api_error";
        if (attempt < MAX_TRIES) {
          console.warn(
            `[Instagram] Vendor generic failure for reel ${code} (attempt ${attempt}/${MAX_TRIES}): ${vendorError} ${vendorMsg}`.trim()
          );
          await sleep(BACKOFF_MS * attempt);
          continue;
        }
        break;
      }

      lastReason = "unknown";
      if (attempt < MAX_TRIES) {
        await sleep(BACKOFF_MS * attempt);
        continue;
      }
      break;
    }
  }

  console.warn(
    `[Instagram] fetchReelByShortcode exhausted retries shortcode=${code} urls=${urls.length} reason=${lastReason}`
  );
  return { ok: false, reason: lastReason };
}

export async function fetchReelByShortcode(
  shortcode: string,
  options?: { preferUrl?: string }
): Promise<ReelFullData | null> {
  const result = await fetchReelByShortcodeResult(shortcode, options);
  return result.ok ? result.data : null;
}

/* ------------------------------------------------------------------ */
/*  Search reels                                                       */
/* ------------------------------------------------------------------ */

export interface SearchReelData {
  shortcode: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string;
  videoUrl: string;
  reelUrl: string;
  duration: number;
  postedAt: Date;
  ownerUsername: string;
  ownerFullName: string;
  ownerProfilePicUrl: string;
  ownerFollowerCount: number;
  engagementRate: number;
}

function parseSearchReelApiItem(r: any): SearchReelData | null {
  if (!r) return null;

  const shortcode = r.shortcode || "";
  if (!shortcode) return null;

  const owner = r.owner || {};
  const likeCount = r.like_count ?? 0;
  const commentCount = r.comment_count ?? 0;
  const viewCount = r.video_play_count ?? r.video_view_count ?? 0;
  const ownerFollowerCount = owner.follower_count ?? 0;
  const engagementRate =
    ownerFollowerCount > 0 ? ((likeCount + commentCount) / ownerFollowerCount) * 100 : 0;

  let postedAt =
    coerceInstagramTakenAtRaw(r.taken_at_timestamp) ??
    coerceInstagramTakenAtRaw(r.taken_at) ??
    new Date();

  return {
    shortcode,
    caption: r.caption || "",
    viewCount,
    likeCount,
    commentCount,
    thumbnailUrl: r.thumbnail_src || r.display_url || "",
    videoUrl: r.video_url || "",
    reelUrl: r.url || `https://www.instagram.com/reel/${shortcode}/`,
    duration: Math.round(Number(r.video_duration) || 0),
    postedAt,
    ownerUsername: owner.username || "",
    ownerFullName: owner.full_name || "",
    ownerProfilePicUrl: owner.profile_pic_url || "",
    ownerFollowerCount,
    engagementRate: Math.round(engagementRate * 100) / 100,
  };
}

/**
 * Search for reels by keyword via ScrapeCreators v2 search (Google-backed).
 */
export async function searchReelsByKeyword(
  keyword: string,
  maxResults: number = 50,
  onProgress?: (count: number) => void
): Promise<SearchReelData[]> {
  const cleanKeyword = keyword.replace(/[#@]/g, "").trim().toLowerCase().replace(/\s+/g, "");

  if (!cleanKeyword) {
    throw new Error("Please enter a valid search keyword.");
  }

  const allReels: SearchReelData[] = [];
  const seenShortcodes = new Set<string>();

  let page = 1;
  const maxPages = 15;

  while (allReels.length < maxResults && page <= maxPages) {
    if (page > 1) {
      await sleep(1500 + Math.random() * 1000);
    }

    const { status, data } = await scGet("/v2/instagram/reels/search", {
      query: cleanKeyword,
      page: String(page),
    });

    if (status === 404 || status === 400) {
      if (page === 1) {
        throw new Error(`No results found for "${keyword}". Try a different keyword or hashtag.`);
      }
      break;
    }
    if (status === 429) {
      throw new Error("Instagram rate limit reached. Please wait a few minutes and try again.");
    }
    if (status !== 200 || !data?.reels?.length) {
      if (page === 1) {
        throw new Error(`No results found for "${keyword}". Try a different keyword or hashtag.`);
      }
      break;
    }

    for (const raw of data.reels) {
      const reel = parseSearchReelApiItem(raw);
      if (reel && !seenShortcodes.has(reel.shortcode)) {
        seenShortcodes.add(reel.shortcode);
        allReels.push(reel);
        if (allReels.length >= maxResults) break;
      }
    }

    if (onProgress) {
      onProgress(allReels.length);
    }

    if (allReels.length >= maxResults) break;
    if (data.reels.length === 0) break;

    page++;
  }

  console.log(`[Instagram] Search for "${keyword}" found ${allReels.length} reels`);
  return allReels.slice(0, maxResults);
}

/**
 * Search for reels by handle via ScrapeCreators (paginates user reels).
 */
export async function searchReelsByHandle(
  handle: string,
  maxResults: number = 50,
  onProgress?: (count: number) => void
): Promise<{ reels: SearchReelData[]; profile: ProfileInfo }> {
  const profile = await fetchProfile(handle);

  if (profile.isPrivate) {
    throw new Error(
      `The account @${profile.username} is private. Only public accounts can be searched.`
    );
  }

  const allReels: SearchReelData[] = [];
  const seenShortcodes = new Set<string>();

  let maxId: string | null = null;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = Math.ceil(maxResults / 12) + 3;

  while (hasMore && pageCount < maxPages && allReels.length < maxResults) {
    pageCount++;

    if (pageCount > 1) {
      await sleep(350 + Math.random() * 400);
    }

    const page = await fetchUserReelsPage(profile.username, maxId);

    if (page.items.length === 0) break;

    for (const item of page.items) {
      const parsed = parseClipItem(item, profile.username);
      if (!parsed || seenShortcodes.has(parsed.shortcode)) continue;
      seenShortcodes.add(parsed.shortcode);

      const engagementRate =
        profile.followerCount > 0
          ? ((parsed.likeCount + parsed.commentCount) / profile.followerCount) * 100
          : 0;

      allReels.push({
        shortcode: parsed.shortcode,
        caption: parsed.caption,
        viewCount: parsed.viewCount,
        likeCount: parsed.likeCount,
        commentCount: parsed.commentCount,
        thumbnailUrl: parsed.thumbnailUrl,
        videoUrl: parsed.videoUrl,
        reelUrl: parsed.reelUrl,
        duration: parsed.duration,
        postedAt: parsed.postedAt,
        ownerUsername: profile.username,
        ownerFullName: profile.fullName,
        ownerProfilePicUrl: profile.profilePicUrl,
        ownerFollowerCount: profile.followerCount,
        engagementRate: Math.round(engagementRate * 100) / 100,
      });

      if (allReels.length >= maxResults) break;
    }

    if (onProgress) {
      onProgress(allReels.length);
    }

    hasMore = page.moreAvailable && !!page.maxId;
    maxId = page.maxId;
    if (!hasMore) break;
  }

  console.log(`[Instagram] Handle search for @${profile.username} found ${allReels.length} reels`);
  return { reels: allReels.slice(0, maxResults), profile };
}
