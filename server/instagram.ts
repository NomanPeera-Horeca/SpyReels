/**
 * Instagram data via ScrapeCreators API (https://api.scrapecreators.com).
 * Uses global fetch with x-api-key (no direct Instagram mobile API calls).
 */

import { MIN_SPY_DISPLAY_REELS } from "@shared/spyReelsLimits";
import { normalizeInstagramHandle } from "@shared/instagramHandle";
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

/** Interactive preview refresh: one ScrapeCreators attempt, fail fast for UI. */
export const INTERACTIVE_REEL_FETCH_TIMEOUT_MS = 8_000;

/** HTTP status returned when discovery pipeline ScrapeCreators call fuse trips. */
export const DISCOVERY_SC_CALL_FUSE_STATUS = 499;

export interface DiscoveryScCallTracker {
  count: number;
  readonly maxCalls: number;
  fuseLogged: boolean;
}

export function createDiscoveryScCallTracker(
  maxCalls: number
): DiscoveryScCallTracker {
  return { count: 0, maxCalls, fuseLogged: false };
}

let activeDiscoveryScCallTracker: DiscoveryScCallTracker | null = null;

/** Optional caller context attached to [Bug #64 diag] scGet lines. */
export interface ScrapeCallContext {
  source: string;
  jobId?: number;
  handle?: string;
}

let activeScrapeCallContext: ScrapeCallContext | null = null;

/** Tag ScrapeCreators calls with job/handle so Render logs are searchable. */
export async function runWithScrapeCallContext<T>(
  context: ScrapeCallContext,
  fn: () => Promise<T>
): Promise<T> {
  activeScrapeCallContext = context;
  try {
    return await fn();
  } finally {
    activeScrapeCallContext = null;
  }
}

function formatScrapeCallContextLogSuffix(): string {
  const ctx = activeScrapeCallContext;
  if (!ctx) return "";
  const parts = [`source=${ctx.source}`];
  if (ctx.jobId != null) parts.push(`jobId=${ctx.jobId}`);
  if (ctx.handle) {
    parts.push(`handle=@${ctx.handle.replace(/^@/, "").trim().toLowerCase()}`);
  }
  return ` ${parts.join(" ")}`;
}

/** Count every scGet during discovery toward the hard call fuse. */
export async function runWithDiscoveryScCallTracker<T>(
  tracker: DiscoveryScCallTracker,
  fn: () => Promise<T>
): Promise<T> {
  activeDiscoveryScCallTracker = tracker;
  try {
    return await fn();
  } finally {
    activeDiscoveryScCallTracker = null;
  }
}

function logDiscoveryFuseIfNeeded(tracker: DiscoveryScCallTracker): void {
  if (tracker.count >= tracker.maxCalls && !tracker.fuseLogged) {
    tracker.fuseLogged = true;
    console.log(
      `[discovery] call fuse hit at ${tracker.count} calls, stopping drills`
    );
  }
}

function discoveryScFuseTripped(
  tracker: DiscoveryScCallTracker | null
): boolean {
  return tracker !== null && tracker.count >= tracker.maxCalls;
}

async function scGet(
  path: string,
  query: Record<string, string | undefined>,
  opts?: { timeoutMs?: number }
): Promise<{ status: number; data: any }> {
  const tracker = activeDiscoveryScCallTracker;
  if (tracker && discoveryScFuseTripped(tracker)) {
    logDiscoveryFuseIfNeeded(tracker);
    return {
      status: DISCOVERY_SC_CALL_FUSE_STATUS,
      data: { error: "discovery_call_fuse" },
    };
  }
  if (tracker) {
    tracker.count++;
    if (tracker.count >= tracker.maxCalls) {
      logDiscoveryFuseIfNeeded(tracker);
    }
  }

  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") {
      url.searchParams.set(k, v);
    }
  }
  const timeoutMs = opts?.timeoutMs ?? SCRAPECREATORS_FETCH_MS;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
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
    `[Bug #64 diag] scGet path=${path} status=${res.status} bodyLength=${text.length}${formatScrapeCallContextLogSuffix()}`
  );
  return { status: res.status, data };
}

export interface HashtagReelsSearchResult {
  hashtag: string;
  success: boolean;
  httpStatus: number | null;
  error: string | null;
  data: unknown;
}

/** Hashtag reel search via ScrapeCreators (1 credit per request). */
export async function searchHashtagReels(
  hashtag: string
): Promise<HashtagReelsSearchResult> {
  const cleanTag = hashtag.replace(/^#/, "").trim();
  try {
    const { status, data } = await scGet("/v1/instagram/search/hashtag", {
      hashtag: cleanTag,
      media_type: "reels",
      date_posted: "last-month",
    });
    if (status >= 200 && status < 300) {
      return {
        hashtag: cleanTag,
        success: true,
        httpStatus: status,
        error: null,
        data,
      };
    }
    const errBody =
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : "";
    return {
      hashtag: cleanTag,
      success: false,
      httpStatus: status,
      error: `HTTP ${status}${errBody ? `: ${errBody}` : ""}`,
      data,
    };
  } catch (err) {
    return {
      hashtag: cleanTag,
      success: false,
      httpStatus: null,
      error: err instanceof Error ? err.message : String(err),
      data: null,
    };
  }
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
  /** True when collected only to reach MIN_SPY_DISPLAY_REELS (older than spy window). */
  outsideSpyWindow?: boolean;
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

export type InstagramResolutionMethod =
  | "profile_handle"
  | "native_search"
  | "user_id";

export interface InstagramIdentity extends ProfileInfo {
  requestedHandle: string;
  resolutionMethod: InstagramResolutionMethod;
  fallbackUsed: boolean;
  /** True only when profile/basic-profile has positive gating/restriction evidence. */
  mediaRestricted: boolean;
}

export const INSTAGRAM_RESTRICTED_MEDIA_MESSAGE =
  "Instagram is restricting access to this account's media. We found the creator, but can't retrieve their reels right now.";

const MEDIA_RESTRICTION_TEXT =
  /restrict|age.?gated|years old|log in|login|must be \d+/i;

/** Confirmed: every supported resolution strategy failed to find this handle. */
export class InstagramHandleNotFoundError extends Error {
  readonly failureClass = "handle_not_found" as const;
  constructor(handle: string) {
    super(
      `User "@${handle}" not found. Please check the username and try again.`
    );
    this.name = "InstagramHandleNotFoundError";
  }
}

/** Transient ScrapeCreators/Instagram failure. Retryable; not proof the account is missing. */
export class InstagramProviderError extends Error {
  readonly failureClass = "provider_resolution_failed" as const;
  readonly httpStatus: number | null;
  constructor(
    handle: string,
    opts?: { httpStatus?: number | null; detail?: string }
  ) {
    super(
      `Instagram could not resolve @${handle} right now. This is usually temporary. Please try again in a few minutes.`
    );
    this.name = "InstagramProviderError";
    this.httpStatus = opts?.httpStatus ?? null;
  }
}

export class InstagramPrivateAccountError extends Error {
  readonly failureClass = "account_private" as const;
  constructor(handle: string) {
    super(
      `The account @${handle} is private. Only public accounts can be analyzed.`
    );
    this.name = "InstagramPrivateAccountError";
  }
}

/** Identity succeeded, but Instagram is gating the media grid. */
export class InstagramRestrictedMediaError extends Error {
  readonly failureClass = "media_restricted" as const;
  constructor() {
    super(INSTAGRAM_RESTRICTED_MEDIA_MESSAGE);
    this.name = "InstagramRestrictedMediaError";
  }
}

export function isInstagramProviderError(
  error: unknown
): error is InstagramProviderError {
  return error instanceof InstagramProviderError;
}

export function isInstagramRestrictedMediaError(
  error: unknown
): error is InstagramRestrictedMediaError {
  return error instanceof InstagramRestrictedMediaError;
}

/**
 * Positive gating/restriction evidence from a profile or basic-profile payload.
 * Empty reels alone are not enough.
 */
export function hasInstagramMediaRestriction(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const root = data as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : null;
  const user =
    nested && nested.user && typeof nested.user === "object"
      ? (nested.user as Record<string, unknown>)
      : root;

  if (user.restricted_by_viewer === true) return true;

  const gatingCandidates = [root.gating, user.gating];
  for (const gating of gatingCandidates) {
    if (!gating || typeof gating !== "object") continue;
    const g = gating as Record<string, unknown>;
    const title = typeof g.title === "string" ? g.title : "";
    const description = typeof g.description === "string" ? g.description : "";
    if (MEDIA_RESTRICTION_TEXT.test(`${title} ${description}`)) return true;
  }
  return false;
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

type ProfileLookupResult =
  | {
      ok: true;
      profile: ProfileInfo;
      httpStatus: number;
      mediaRestricted: boolean;
    }
  | {
      ok: false;
      kind: "not_found" | "private" | "provider";
      httpStatus: number;
      detail: string;
    };

function profileFromGraphUser(user: any, fallbackHandle: string): ProfileInfo {
  return {
    userId: String(user.id ?? ""),
    username: user.username || fallbackHandle,
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

function profileFromBasicProfile(data: any, fallbackHandle: string): ProfileInfo {
  return {
    userId: String(data?.id ?? data?.pk ?? ""),
    username: data?.username || fallbackHandle,
    isPrivate: !!data?.is_private,
    followerCount: data?.follower_count ?? 0,
    fullName: data?.full_name || "",
    biography: data?.biography || "",
    profilePicUrl:
      data?.hd_profile_pic_url_info?.url || data?.profile_pic_url || "",
    postCount: data?.media_count ?? 0,
    followingCount: data?.following_count ?? 0,
    isVerified: !!data?.is_verified,
    category: data?.category || data?.category_name || "",
    externalUrl: data?.external_url || "",
  };
}

function extractNativeSearchUsers(data: unknown): Array<{
  id: string;
  username: string;
  fullName: string;
  profilePicUrl: string;
  isVerified: boolean;
}> {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : null;
  const raw = Array.isArray(nested?.users)
    ? nested.users
    : Array.isArray(root.users)
      ? root.users
      : [];

  const users: Array<{
    id: string;
    username: string;
    fullName: string;
    profilePicUrl: string;
    isVerified: boolean;
  }> = [];

  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const inner =
      r.user && typeof r.user === "object"
        ? (r.user as Record<string, unknown>)
        : r;
    const username = typeof inner.username === "string" ? inner.username : "";
    const id = String(inner.id ?? inner.pk ?? r.id ?? r.pk ?? "");
    if (!username || !id) continue;
    users.push({
      id,
      username,
      fullName: typeof inner.full_name === "string" ? inner.full_name : "",
      profilePicUrl:
        typeof inner.profile_pic_url === "string" ? inner.profile_pic_url : "",
      isVerified: !!inner.is_verified,
    });
  }
  return users;
}

/**
 * Direct /v1/instagram/profile lookup by handle.
 * 404 / vendor not_found is returned as `not_found` so callers can run the
 * native-search recovery path. Rate limits and generic vendor flakes retry.
 */
async function lookupProfileByHandle(
  handle: string
): Promise<ProfileLookupResult> {
  const cleanHandle = handle.replace(/^@/, "").trim();
  const MAX_TRIES = 5;
  const BACKOFF_MS = 600;
  let lastStatus = 0;
  let lastDetail = "";

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const { status, data } = await scGet("/v1/instagram/profile", {
      handle: cleanHandle,
    });
    lastStatus = status;

    if (status === 404) {
      return {
        ok: false,
        kind: "not_found",
        httpStatus: status,
        detail: "http_404",
      };
    }
    if (status === 429) {
      if (attempt < MAX_TRIES) {
        await sleep(2000 * attempt);
        continue;
      }
      return {
        ok: false,
        kind: "provider",
        httpStatus: status,
        detail: "rate_limit",
      };
    }
    if (status !== 200 || !data) {
      lastDetail = `http_${status}`;
      if (attempt < MAX_TRIES) {
        await sleep(1000 * attempt);
        continue;
      }
      return {
        ok: false,
        kind: "provider",
        httpStatus: status,
        detail: lastDetail,
      };
    }

    const user = data?.data?.user;
    if (user) {
      return {
        ok: true,
        profile: profileFromGraphUser(user, cleanHandle),
        httpStatus: status,
        mediaRestricted: hasInstagramMediaRestriction(data),
      };
    }

    const failureKind = classifyVendorEnvelopeFailure(data);
    const { vendorError, vendorMsg } = readVendorEnvelope(data);
    lastDetail = `${vendorError} ${vendorMsg}`.trim();

    if (failureKind === "not_found") {
      return {
        ok: false,
        kind: "not_found",
        httpStatus: status,
        detail: lastDetail || "vendor_not_found",
      };
    }
    if (failureKind === "private") {
      return {
        ok: false,
        kind: "private",
        httpStatus: status,
        detail: lastDetail || "private",
      };
    }
    if (failureKind && shouldRetryVendorFailure(failureKind) && attempt < MAX_TRIES) {
      console.warn(
        `[Instagram] Vendor ${failureKind} envelope for @${cleanHandle} ` +
          `(attempt ${attempt}/${MAX_TRIES}): ${lastDetail}`
      );
      await sleep(BACKOFF_MS * attempt);
      continue;
    }
    if (failureKind === "rate_limit") {
      return {
        ok: false,
        kind: "provider",
        httpStatus: status,
        detail: lastDetail || "rate_limit",
      };
    }
    return {
      ok: false,
      kind: "provider",
      httpStatus: status,
      detail: lastDetail || "missing_user",
    };
  }

  return {
    ok: false,
    kind: "provider",
    httpStatus: lastStatus,
    detail: lastDetail || "exhausted_retries",
  };
}

async function searchInstagramUsersNative(query: string): Promise<
  | {
      ok: true;
      users: ReturnType<typeof extractNativeSearchUsers>;
      httpStatus: number;
    }
  | {
      ok: false;
      kind: "provider";
      httpStatus: number;
      detail: string;
    }
> {
  const MAX_TRIES = 3;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    const { status, data } = await scGet("/v1/instagram/search", { query });
    lastStatus = status;

    if (status === 429) {
      if (attempt < MAX_TRIES) {
        await sleep(2000 * attempt);
        continue;
      }
      return {
        ok: false,
        kind: "provider",
        httpStatus: status,
        detail: "search_rate_limit",
      };
    }
    if (status !== 200 || !data) {
      if (attempt < MAX_TRIES) {
        await sleep(1000 * attempt);
        continue;
      }
      return {
        ok: false,
        kind: "provider",
        httpStatus: status,
        detail: `search_http_${status}`,
      };
    }

    return {
      ok: true,
      users: extractNativeSearchUsers(data),
      httpStatus: status,
    };
  }

  return {
    ok: false,
    kind: "provider",
    httpStatus: lastStatus,
    detail: "search_exhausted",
  };
}

async function fetchProfileByUserId(
  userId: string,
  fallbackHandle: string
): Promise<ProfileLookupResult> {
  const { status, data } = await scGet("/v1/instagram/basic-profile", {
    userId,
  });

  if (status === 404) {
    return {
      ok: false,
      kind: "not_found",
      httpStatus: status,
      detail: "basic_profile_404",
    };
  }
  if (status !== 200 || !data) {
    return {
      ok: false,
      kind: "provider",
      httpStatus: status,
      detail: `basic_profile_http_${status}`,
    };
  }

  const profile = profileFromBasicProfile(data, fallbackHandle);
  if (!profile.userId) {
    return {
      ok: false,
      kind: "provider",
      httpStatus: status,
      detail: "basic_profile_missing_id",
    };
  }
  if (profile.isPrivate) {
    return { ok: false, kind: "private", httpStatus: status, detail: "private" };
  }
  return {
    ok: true,
    profile,
    httpStatus: status,
    mediaRestricted: hasInstagramMediaRestriction(data),
  };
}

function logIdentityResolution(args: {
  requestedHandle: string;
  method: InstagramResolutionMethod | "failed";
  canonicalUsername?: string;
  userId?: string;
  fallbackUsed: boolean;
  httpStatus: number | null;
  failureClass?: string;
}): void {
  const handle = normalizeInstagramHandle(args.requestedHandle);
  const parts = [
    `requested=@${handle}`,
    `method=${args.method}`,
    `fallback=${args.fallbackUsed}`,
    `httpStatus=${args.httpStatus ?? "n/a"}`,
  ];
  if (args.canonicalUsername) {
    parts.push(`canonical=@${normalizeInstagramHandle(args.canonicalUsername)}`);
  }
  if (args.userId) parts.push(`userId=${args.userId}`);
  if (args.failureClass) parts.push(`failure=${args.failureClass}`);
  console.log(`[Instagram] identity ${parts.join(" ")}`);
}

/**
 * Resolve a typed Instagram handle to a stable identity.
 * Direct profile lookup first; native search only on 404 / not_found.
 * Exact normalized username match required. Never guesses similar names.
 */
export async function resolveInstagramIdentity(
  handle: string
): Promise<InstagramIdentity> {
  const requestedHandle = normalizeInstagramHandle(handle);
  const direct = await lookupProfileByHandle(requestedHandle);

  if (direct.ok) {
    logIdentityResolution({
      requestedHandle,
      method: "profile_handle",
      canonicalUsername: direct.profile.username,
      userId: direct.profile.userId,
      fallbackUsed: false,
      httpStatus: direct.httpStatus,
    });
    return {
      ...direct.profile,
      requestedHandle,
      resolutionMethod: "profile_handle",
      fallbackUsed: false,
      mediaRestricted: direct.mediaRestricted,
    };
  }

  if (direct.kind === "private") {
    logIdentityResolution({
      requestedHandle,
      method: "profile_handle",
      fallbackUsed: false,
      httpStatus: direct.httpStatus,
      failureClass: "account_private",
    });
    throw new InstagramPrivateAccountError(requestedHandle);
  }

  if (direct.kind === "provider") {
    logIdentityResolution({
      requestedHandle,
      method: "failed",
      fallbackUsed: false,
      httpStatus: direct.httpStatus,
      failureClass: "provider_resolution_failed",
    });
    throw new InstagramProviderError(requestedHandle, {
      httpStatus: direct.httpStatus,
      detail: direct.detail,
    });
  }

  const search = await searchInstagramUsersNative(requestedHandle);
  if (!search.ok) {
    logIdentityResolution({
      requestedHandle,
      method: "failed",
      fallbackUsed: true,
      httpStatus: search.httpStatus,
      failureClass: "provider_resolution_failed",
    });
    throw new InstagramProviderError(requestedHandle, {
      httpStatus: search.httpStatus,
      detail: search.detail,
    });
  }

  const exact = search.users.find(
    (u) => normalizeInstagramHandle(u.username) === requestedHandle
  );
  if (!exact) {
    logIdentityResolution({
      requestedHandle,
      method: "failed",
      fallbackUsed: true,
      httpStatus: search.httpStatus,
      failureClass: "handle_not_found",
    });
    throw new InstagramHandleNotFoundError(requestedHandle);
  }

  const byId = await fetchProfileByUserId(exact.id, exact.username);
  if (byId.ok) {
    logIdentityResolution({
      requestedHandle,
      method: "native_search",
      canonicalUsername: byId.profile.username,
      userId: byId.profile.userId || exact.id,
      fallbackUsed: true,
      httpStatus: byId.httpStatus,
    });
    return {
      ...byId.profile,
      userId: byId.profile.userId || exact.id,
      requestedHandle,
      resolutionMethod: "native_search",
      fallbackUsed: true,
      mediaRestricted: byId.mediaRestricted,
    };
  }
  if (byId.kind === "private") {
    logIdentityResolution({
      requestedHandle,
      method: "native_search",
      canonicalUsername: exact.username,
      userId: exact.id,
      fallbackUsed: true,
      httpStatus: byId.httpStatus,
      failureClass: "account_private",
    });
    throw new InstagramPrivateAccountError(
      normalizeInstagramHandle(exact.username)
    );
  }

  logIdentityResolution({
    requestedHandle,
    method: "native_search",
    canonicalUsername: exact.username,
    userId: exact.id,
    fallbackUsed: true,
    httpStatus: byId.httpStatus,
  });
  return {
    userId: exact.id,
    username: exact.username,
    isPrivate: false,
    followerCount: 0,
    fullName: exact.fullName,
    biography: "",
    profilePicUrl: exact.profilePicUrl,
    postCount: 0,
    followingCount: 0,
    isVerified: exact.isVerified,
    category: "",
    externalUrl: "",
    requestedHandle,
    resolutionMethod: "native_search",
    fallbackUsed: true,
    mediaRestricted: false,
  };
}

export async function fetchProfile(handle: string): Promise<ProfileInfo> {
  const cleanHandle = handle.replace(/^@/, "").trim();
  const result = await lookupProfileByHandle(cleanHandle);

  if (result.ok) return result.profile;
  if (result.kind === "not_found") {
    throw new Error(
      `User "@${cleanHandle}" not found. Please check the username and try again.`
    );
  }
  if (result.kind === "private") {
    throw new Error(
      `The account @${cleanHandle} is private. Only public accounts can be analyzed.`
    );
  }
  if (result.httpStatus === 429 || result.detail === "rate_limit") {
    throw new Error(
      `Instagram is temporarily rate limiting access to "@${cleanHandle}". ` +
        `Please try again in a few minutes.`
    );
  }
  if (result.httpStatus && result.httpStatus !== 200) {
    throw new Error(
      `Failed to fetch profile for "@${cleanHandle}": HTTP ${result.httpStatus}`
    );
  }
  throw new Error(
    `We couldn't load @${cleanHandle}'s profile right now. Please try again in a few minutes.`
  );
}

/**
 * Single-attempt, deadline-bounded profile lookup for creator discovery.
 * Search results do not include follower counts, so discovery enriches only
 * a capped shortlist of unique handles. Unlike interactive profile lookup,
 * this deliberately does not retry or fall back to extra provider calls.
 */
export async function fetchDiscoveryProfile(
  handle: string,
  timeoutMs: number
): Promise<ProfileInfo> {
  const cleanHandle = normalizeInstagramHandle(handle);
  if (!cleanHandle) {
    throw new Error("Creator discovery profile enrichment requires a handle");
  }

  const { status, data } = await scGet(
    "/v1/instagram/profile",
    { handle: cleanHandle },
    { timeoutMs: Math.max(1, timeoutMs) }
  );
  const user = data?.data?.user;

  if (status !== 200 || !user) {
    const { vendorError, vendorMsg } = readVendorEnvelope(data);
    const detail = `${vendorError} ${vendorMsg}`.trim();
    throw new Error(
      `Creator discovery profile enrichment failed for @${cleanHandle}: HTTP ${status}${detail ? ` (${detail})` : ""}`
    );
  }

  return profileFromGraphUser(user, cleanHandle);
}

/* ------------------------------------------------------------------ */
/*  User reels pagination                                              */
/* ------------------------------------------------------------------ */

interface ClipsPage {
  items: any[];
  moreAvailable: boolean;
  maxId: string | null;
}

export function buildInstagramUserReelsQuery(
  identity: { handle: string; userId?: string },
  maxId: string | null
): Record<string, string | undefined> {
  const cleanHandle = identity.handle.replace(/^@/, "").trim();
  const query: Record<string, string | undefined> = identity.userId
    ? { user_id: identity.userId }
    : { handle: cleanHandle };
  if (maxId) {
    query.max_id = maxId;
  }
  return query;
}

async function fetchUserReelsPage(
  identity: { handle: string; userId?: string },
  maxId: string | null,
  opts?: { emptyFirstPageTries?: number }
): Promise<ClipsPage> {
  const cleanHandle = identity.handle.replace(/^@/, "").trim();
  const query = buildInstagramUserReelsQuery(identity, maxId);

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
  const MAX_TRIES = maxId
    ? 1
    : Math.max(1, opts?.emptyFirstPageTries ?? 8);

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
  /** Count of reels inside the user-selected timeframe (excludes backfill). */
  reelsInWindow: number;
  canonicalUsername: string;
  instagramUserId: string;
}

export async function scrapeReels(
  handle: string,
  timeframeDays: number,
  onProgress?: (count: number, pageBatch?: ReelData[]) => void,
  options?: { maxReels?: number; timeoutMs?: number }
): Promise<ScrapeResult> {
  const maxReels = options?.maxReels || 500;
  const timeoutMs = options?.timeoutMs || 5 * 60 * 1000;
  const startTime = Date.now();

  const profile = await resolveInstagramIdentity(handle);

  if (profile.isPrivate) {
    throw new InstagramPrivateAccountError(profile.username);
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

  const inWindowReels: ReelData[] = [];
  const backfillReels: ReelData[] = [];
  const seenShortcodes = new Set<string>();

  const combinedCount = () => inWindowReels.length + backfillReels.length;

  let maxId: string | null = null;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = 100;
  let consecutiveInWindowEmptyPages = 0;
  let stoppedReason = "";
  /** API returned rows we could not map to ReelData (shape drift / new fields). */
  let pagesWithItemsButNoParses = 0;
  let warnedUnparseablePage = false;
  /** Most recent reel date across ALL parsed items, including those
   * outside the timeframe window — used by callers to surface a clear
   * "account hasn't posted in N days" message. */
  let mostRecentItemAt: Date | null = null;

  while (hasMore && pageCount < maxPages) {
    if (discoveryScFuseTripped(activeDiscoveryScCallTracker)) {
      stoppedReason = "discovery call fuse";
      break;
    }

    if (Date.now() - startTime > timeoutMs) {
      stoppedReason = `timeout after ${Math.round((Date.now() - startTime) / 1000)}s`;
      console.warn(
        `[Instagram] Scrape timeout for @${handle} after ${pageCount} pages, ${combinedCount()} reels collected`
      );
      break;
    }

    if (combinedCount() >= maxReels) {
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

    const page = await fetchUserReelsPage(
      { handle: profile.username, userId: profile.userId || undefined },
      maxId,
      { emptyFirstPageTries: profile.mediaRestricted ? 1 : 8 }
    );

    if (page.items.length === 0) {
      hasMore = false;
      break;
    }

    let foundInWindowThisPage = false;
    let parsedThisPage = 0;
    const pageNewReels: ReelData[] = [];

    for (const item of page.items) {
      const reel = parseClipItem(item, profile.username);
      if (!reel) continue;
      parsedThisPage++;

      if (seenShortcodes.has(reel.shortcode)) continue;

      if (Number.isNaN(reel.postedAt.getTime())) continue;

      seenShortcodes.add(reel.shortcode);

      if (!mostRecentItemAt || reel.postedAt > mostRecentItemAt) {
        mostRecentItemAt = reel.postedAt;
      }

      const inWindow = reel.postedAt >= cutoffDate;
      if (inWindow) {
        inWindowReels.push(reel);
        pageNewReels.push(reel);
        foundInWindowThisPage = true;

        if (combinedCount() >= maxReels) break;
        continue;
      }

      // Hold out-of-window candidates in memory only. Do not emit them via
      // onProgress yet: pinned posts often appear first on page 1 while
      // combinedCount is still low, and progressive inserts would persist
      // them before we know the in-window count. After the loop we append
      // backfill only if inWindowReels.length < MIN_SPY_DISPLAY_REELS.
      if (combinedCount() < MIN_SPY_DISPLAY_REELS) {
        const backfillReel: ReelData = { ...reel, outsideSpyWindow: true };
        backfillReels.push(backfillReel);

        if (combinedCount() >= maxReels) break;
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
    } else if (foundInWindowThisPage) {
      consecutiveInWindowEmptyPages = 0;
    } else {
      consecutiveInWindowEmptyPages++;
    }

    // Progress / progressive insert: in-window only. Backfill is flushed once
    // after the loop if the window is still below the minimum sample.
    if (onProgress && pageNewReels.length > 0) {
      onProgress(inWindowReels.length, pageNewReels);
    }

    if (!page.moreAvailable || !page.maxId) {
      hasMore = false;
    } else if (
      inWindowReels.length > 0 &&
      consecutiveInWindowEmptyPages >= 3 &&
      combinedCount() >= MIN_SPY_DISPLAY_REELS
    ) {
      hasMore = false;
      stoppedReason = "in-window window exhausted with minimum sample met";
    } else {
      maxId = page.maxId;
    }
  }

  // Drop unnecessary backfill once the window itself meets the minimum.
  // Otherwise flush held candidates so progressive inserters (and the final
  // Instagram insert of the returned set) persist them.
  const neededBackfill =
    inWindowReels.length < MIN_SPY_DISPLAY_REELS ? backfillReels : [];
  if (neededBackfill.length > 0 && onProgress) {
    onProgress(
      inWindowReels.length + neededBackfill.length,
      neededBackfill
    );
  }

  const allReels = [...inWindowReels, ...neededBackfill];
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const shapeWarning =
    pagesWithItemsButNoParses > 0
      ? `, unparseable_pages=${pagesWithItemsButNoParses}`
      : "";
  const backfillNote =
    neededBackfill.length > 0
      ? `, in_window=${inWindowReels.length}, backfill=${neededBackfill.length}`
      : inWindowReels.length >= MIN_SPY_DISPLAY_REELS && backfillReels.length > 0
        ? `, in_window=${inWindowReels.length}, backfill_discarded=${backfillReels.length}`
        : "";
  console.log(
    `[Instagram] Scraped ${allReels.length} reels for @${profile.username} in ${elapsed}s (${pageCount} pages, ${seenShortcodes.size} total seen, ${profile.followerCount} followers${backfillNote}${stoppedReason ? `, stopped: ${stoppedReason}` : ""}${shapeWarning})`
  );

  if (
    allReels.length === 0 &&
    seenShortcodes.size === 0 &&
    !profile.isPrivate &&
    profile.followerCount > 0
  ) {
    let mediaRestricted = profile.mediaRestricted;
    if (!mediaRestricted && profile.userId) {
      const extra = await fetchProfileByUserId(profile.userId, profile.username);
      mediaRestricted = extra.ok && extra.mediaRestricted;
    }
    if (mediaRestricted) {
      console.log(
        `[Instagram] media restricted requested=@${normalizeInstagramHandle(profile.username)} userId=${profile.userId} followers=${profile.followerCount}`
      );
      throw new InstagramRestrictedMediaError();
    }
  }

  return {
    reels: allReels,
    followerCount: profile.followerCount,
    profilePicUrl: profile.profilePicUrl,
    totalParsedItems: seenShortcodes.size,
    mostRecentItemAt,
    reelsInWindow: inWindowReels.length,
    canonicalUsername: profile.username,
    instagramUserId: profile.userId,
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

function looksLikePostMedia(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  return Boolean(
    o.display_url ||
      o.thumbnail_src ||
      o.image_versions2 ||
      o.carousel_media ||
      o.edge_sidecar_to_children ||
      o.video_url ||
      o.video_versions
  );
}

function extractPostMediaFromResponse(data: unknown): any | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const inner = root.data;
  if (inner && typeof inner === "object") {
    const d = inner as Record<string, unknown>;
    const nested =
      d.xdt_shortcode_media ??
      d.shortcode_media ??
      d.media ??
      d.item ??
      null;
    if (nested) return nested;
    if (looksLikePostMedia(d)) return d;
  }
  if (looksLikePostMedia(root.media)) return root.media;
  if (looksLikePostMedia(root.item)) return root.item;
  if (looksLikePostMedia(root)) return root;
  return null;
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

function isHttpImageUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

/**
 * Prefer the highest-resolution candidate when width/height exist.
 * Falls back to candidates[0] (same cover-image pattern as mapPostMediaToReelFull).
 */
function pickBestCandidateUrl(candidates: unknown): string {
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  let bestUrl = "";
  let bestScore = -1;
  for (const raw of candidates) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const url = typeof c.url === "string" ? c.url : "";
    if (!isHttpImageUrl(url)) continue;
    const width = Number(c.width) || 0;
    const height = Number(c.height) || 0;
    const score = width * height;
    if (score > bestScore) {
      bestScore = score;
      bestUrl = url.trim();
    }
  }
  if (bestUrl) return bestUrl;
  const first = candidates[0] as { url?: unknown } | undefined;
  return isHttpImageUrl(first?.url) ? first.url.trim() : "";
}

function imageUrlFromMediaNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const item = node as Record<string, unknown>;
  const versions = item.image_versions2;
  const candidates =
    versions && typeof versions === "object"
      ? (versions as { candidates?: unknown }).candidates
      : undefined;
  const fromCandidates = pickBestCandidateUrl(candidates);
  if (fromCandidates) return fromCandidates;

  const displayResources = item.display_resources;
  if (Array.isArray(displayResources) && displayResources.length > 0) {
    let bestSrc = "";
    let bestWidth = -1;
    for (const raw of displayResources) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const src = typeof r.src === "string" ? r.src : "";
      if (!isHttpImageUrl(src)) continue;
      const width = Number(r.config_width) || 0;
      if (width >= bestWidth) {
        bestWidth = width;
        bestSrc = src.trim();
      }
    }
    if (bestSrc) return bestSrc;
  }

  const fallbacks = [
    item.display_url,
    item.thumbnail_src,
    item.thumbnail_url,
    item.image_url,
    item.original_image_url,
    item.downloaded_url,
    item.media_url,
  ];
  for (const value of fallbacks) {
    if (isHttpImageUrl(value)) return value.trim();
  }
  return "";
}

function unwrapSidecarChild(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return row.node ?? row.media ?? row.item ?? raw;
}

/**
 * Sidecar/carousel child arrays observed or documented across IG GraphQL,
 * private-API, and ScrapeCreators-shaped payloads. Tried in this order:
 * edge_sidecar_to_children.edges, carousel_media, carousel_media.items,
 * resources, sidecar_children, children, carousel_media_items.
 */
function collectSidecarChildren(item: unknown): unknown[] {
  if (!item || typeof item !== "object") return [];
  const media = item as Record<string, unknown>;

  const sidecar = media.edge_sidecar_to_children;
  if (sidecar && typeof sidecar === "object") {
    const edges = (sidecar as { edges?: unknown }).edges;
    if (Array.isArray(edges) && edges.length > 0) {
      return edges.map(unwrapSidecarChild).filter(Boolean);
    }
  }

  const carousel = media.carousel_media;
  if (Array.isArray(carousel) && carousel.length > 0) {
    return carousel.map(unwrapSidecarChild).filter(Boolean);
  }
  if (carousel && typeof carousel === "object") {
    const nestedItems = (carousel as { items?: unknown }).items;
    if (Array.isArray(nestedItems) && nestedItems.length > 0) {
      return nestedItems.map(unwrapSidecarChild).filter(Boolean);
    }
  }

  for (const key of [
    "resources",
    "sidecar_children",
    "children",
    "carousel_media_items",
  ] as const) {
    const value = media[key];
    if (Array.isArray(value) && value.length > 0) {
      return value.map(unwrapSidecarChild).filter(Boolean);
    }
  }

  return [];
}

function pushUniqueImageUrl(urls: string[], seen: Set<string>, url: string): void {
  const trimmed = url.trim();
  if (!trimmed || seen.has(trimmed)) return;
  seen.add(trimmed);
  urls.push(trimmed);
}

/**
 * Ordered slide image URLs from a post/reel media object.
 * Carousel/sidecar children first (deduped, original order). Single image or
 * video posts return a one-item cover array. Empty when no image URL exists.
 */
export function extractCarouselSlideImageUrls(
  media: unknown,
  rawEnvelope?: unknown
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const children = collectSidecarChildren(media);
  for (const child of children) {
    pushUniqueImageUrl(urls, seen, imageUrlFromMediaNode(child));
  }

  if (urls.length === 0 && rawEnvelope && rawEnvelope !== media) {
    const envelopeChildren = collectSidecarChildren(rawEnvelope);
    for (const child of envelopeChildren) {
      pushUniqueImageUrl(urls, seen, imageUrlFromMediaNode(child));
    }
    if (urls.length === 0 && rawEnvelope && typeof rawEnvelope === "object") {
      const root = rawEnvelope as Record<string, unknown>;
      if (root.data && root.data !== media) {
        for (const child of collectSidecarChildren(root.data)) {
          pushUniqueImageUrl(urls, seen, imageUrlFromMediaNode(child));
        }
      }
    }
  }

  if (urls.length === 0) {
    pushUniqueImageUrl(urls, seen, imageUrlFromMediaNode(media));
  }

  return urls;
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

type FetchInstagramPostOptions = {
  preferUrl?: string;
  downloadMedia?: boolean;
  mode?: "default" | "interactive";
};

type FetchInstagramPostPayloadResult =
  | { ok: true; media: unknown; raw: unknown }
  | { ok: false; reason: ReelFetchFailureReason };

/**
 * Shared ScrapeCreators `/v1/instagram/post` fetch. Used by reel mapping and
 * carousel slide-image extraction so callers share retry / URL fallbacks.
 */
async function fetchInstagramPostPayload(
  shortcode: string,
  options?: FetchInstagramPostOptions
): Promise<FetchInstagramPostPayloadResult> {
  const resolvedPrefer = options?.preferUrl
    ? await resolveInstagramPostUrl(options.preferUrl)
    : undefined;
  const code = normalizeShortcode(resolvedPrefer || shortcode);
  if (!code) return { ok: false, reason: "not_found" };

  const interactive = options?.mode === "interactive";
  let urls = postUrlsForShortcode(code, resolvedPrefer);
  if (interactive) {
    urls = urls.slice(0, 1);
  }
  const MAX_TRIES = interactive ? 1 : 6;
  const BACKOFF_MS = 600;
  const requestTimeoutMs = interactive
    ? INTERACTIVE_REEL_FETCH_TIMEOUT_MS
    : undefined;

  let lastReason: ReelFetchFailureReason = "unknown";

  for (const postUrl of urls) {
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      const region = regionForReelFetchAttempt(attempt);
      const { status, data } = await scGet(
        "/v1/instagram/post",
        {
          url: postUrl,
          region,
          download_media: options?.downloadMedia ? "true" : undefined,
        },
        requestTimeoutMs != null ? { timeoutMs: requestTimeoutMs } : undefined
      );

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
        return { ok: true, media, raw: data };
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

/**
 * Fetch a single reel/post by shortcode (or full Instagram URL).
 * Retries transient ScrapeCreators failures (same pattern as fetchProfile).
 *
 * Pass `mode: "interactive"` for modal preview refresh: one URL, one attempt,
 * INTERACTIVE_REEL_FETCH_TIMEOUT_MS (8s) worst case. Background callers omit
 * mode and keep the default 6-try / 30s-per-attempt behavior.
 */
export async function fetchReelByShortcodeResult(
  shortcode: string,
  options?: {
    preferUrl?: string;
    downloadMedia?: boolean;
    mode?: "default" | "interactive";
  }
): Promise<FetchReelByShortcodeResult> {
  const payload = await fetchInstagramPostPayload(shortcode, options);
  if (!payload.ok) return payload;
  const mapped = mapPostMediaToReelFull(payload.media);
  return mapped ? { ok: true, data: mapped } : { ok: false, reason: "unknown" };
}

export async function fetchReelByShortcode(
  shortcode: string,
  options?: { preferUrl?: string; mode?: "default" | "interactive" }
): Promise<ReelFullData | null> {
  const result = await fetchReelByShortcodeResult(shortcode, options);
  return result.ok ? result.data : null;
}

/**
 * Ordered image URLs for every slide in an Instagram carousel post.
 * Single image/video posts return a one-item array (cover). Returns null
 * when the post cannot be fetched or no image URL can be parsed.
 */
export async function fetchCarouselSlideImages(
  url: string,
  options?: { downloadMedia?: boolean }
): Promise<string[] | null> {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const payload = await fetchInstagramPostPayload(trimmed, {
    preferUrl: trimmed,
    downloadMedia: options?.downloadMedia,
  });
  if (!payload.ok) return null;
  const urls = extractCarouselSlideImageUrls(payload.media, payload.raw);
  return urls.length > 0 ? urls : null;
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
  onProgress?: (count: number) => void,
  timeoutMs?: number
): Promise<SearchReelData[]> {
  const cleanKeyword = keyword.replace(/[#@]/g, "").trim().toLowerCase().replace(/\s+/g, "");

  if (!cleanKeyword) {
    throw new Error("Please enter a valid search keyword.");
  }

  const allReels: SearchReelData[] = [];
  const seenShortcodes = new Set<string>();
  const deadlineAt =
    timeoutMs !== undefined ? Date.now() + Math.max(1, timeoutMs) : null;

  const remainingMs = (required: boolean): number | undefined => {
    if (deadlineAt === null) return undefined;
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0 && required) {
      throw new Error(
        `Instagram keyword search timed out after ${timeoutMs}ms for "${keyword}"`
      );
    }
    return Math.max(0, remaining);
  };

  let page = 1;
  const maxPages = 15;

  while (allReels.length < maxResults && page <= maxPages) {
    const required = page === 1;

    if (!required) {
      const delayMs = 1500 + Math.random() * 1000;
      const remaining = remainingMs(false);
      if (remaining !== undefined && remaining <= delayMs) {
        console.info(
          `[Instagram] Optional pagination stopped at page ${page} for "${keyword}": deadline budget exhausted`
        );
        break;
      }
      await sleep(delayMs);
    }

    let status: number;
    let data: any;
    try {
      ({ status, data } = await scGet(
        "/v2/instagram/reels/search",
        {
          query: cleanKeyword,
          page: String(page),
        },
        { timeoutMs: remainingMs(required) }
      ));
    } catch (err) {
      if (required) throw err;
      console.warn(
        `[Instagram] Optional pagination failed at page ${page} for "${keyword}":`,
        err
      );
      break;
    }

    if (status === 408) {
      if (required) {
        throw new Error(
          `Instagram keyword search timed out after ${timeoutMs}ms for "${keyword}"`
        );
      }
      console.info(
        `[Instagram] Optional pagination timed out at page ${page} for "${keyword}"; keeping ${allReels.length} first-page reels`
      );
      break;
    }

    if (status === 404 || status === 400) {
      if (required) {
        throw new Error(`No results found for "${keyword}". Try a different keyword or hashtag.`);
      }
      break;
    }
    if (status === 429) {
      if (required) {
        throw new Error("Instagram rate limit reached. Please wait a few minutes and try again.");
      }
      console.info(
        `[Instagram] Optional pagination rate-limited at page ${page} for "${keyword}"; keeping ${allReels.length} first-page reels`
      );
      break;
    }
    if (status !== 200 || !data?.reels?.length) {
      if (required) {
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

    if (required && allReels.length === 0) {
      throw new Error(
        `Instagram keyword search returned no usable reels for "${keyword}"`
      );
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
  const profile = await resolveInstagramIdentity(handle);

  if (profile.isPrivate) {
    throw new InstagramPrivateAccountError(profile.username);
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

    const page = await fetchUserReelsPage(
      { handle: profile.username, userId: profile.userId || undefined },
      maxId,
      { emptyFirstPageTries: profile.mediaRestricted ? 1 : 8 }
    );

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

/* ------------------------------------------------------------------ */
/*  Hybrid search parsers (no invented metrics)                        */
/* ------------------------------------------------------------------ */

export type InstagramSearchPost = {
  shortcode: string;
  caption: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: Date | null;
  ownerUsername: string;
  ownerFollowerCount: number | null;
  ownerIsVerified: boolean | null;
  ownerIsPrivate: boolean | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  sourceUrl: string;
};

export type InstagramSearchResult = {
  posts: InstagramSearchPost[];
  rawCount: number;
};

function asSearchRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function optionalPositiveSearchMetric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function firstSearchString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function searchCaption(raw: unknown): string {
  if (typeof raw === "string") return raw;
  const record = asSearchRecord(raw);
  return firstSearchString(record.text, record.caption);
}

export function extractInstagramSearchRows(data: unknown): unknown[] {
  const root = asSearchRecord(data);
  for (const key of ["posts", "reels", "items", "results"]) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  const nested = asSearchRecord(root.data);
  for (const key of ["posts", "reels", "items", "results"]) {
    if (Array.isArray(nested[key])) return nested[key] as unknown[];
  }
  return [];
}

/**
 * Normalize Popular, keyword Reel, and hashtag search rows.
 * Missing views/followers stay null. Does not invent metrics.
 */
export function parseInstagramSearchPost(raw: unknown): InstagramSearchPost | null {
  const post = asSearchRecord(raw);
  const shortcode = firstSearchString(post.shortcode, post.code, post.id).replace(
    /^POLARIS_/,
    ""
  );
  if (!shortcode) return null;

  const owner = asSearchRecord(post.owner ?? post.user);
  const ownerUsername = firstSearchString(
    owner.username,
    owner.user_name,
    post.ownerUsername
  ).replace(/^@/, "");
  const sourceUrl =
    firstSearchString(post.url, post.reel_url, post.permalink) ||
    `https://www.instagram.com/reel/${shortcode}/`;

  const verified = owner.is_verified ?? owner.isVerified;
  const isPrivate = owner.is_private ?? owner.isPrivate;

  return {
    shortcode,
    caption: searchCaption(post.caption) || firstSearchString(post.description, post.title),
    views: optionalPositiveSearchMetric(
      post.play_count ?? post.video_play_count ?? post.video_view_count ?? post.view_count
    ),
    likes: optionalPositiveSearchMetric(post.like_count ?? post.likes),
    comments: optionalPositiveSearchMetric(post.comment_count ?? post.comments),
    publishedAt: coerceInstagramTakenAtRaw(
      post.taken_at_timestamp ?? post.taken_at ?? post.timestamp ?? post.device_timestamp
    ),
    ownerUsername,
    ownerFollowerCount: optionalPositiveSearchMetric(
      owner.follower_count ??
        owner.followersCount ??
        owner.followerCount ??
        owner.followers ??
        asSearchRecord(owner.edge_followed_by).count
    ),
    ownerIsVerified: typeof verified === "boolean" ? verified : null,
    ownerIsPrivate: typeof isPrivate === "boolean" ? isPrivate : null,
    thumbnailUrl:
      firstSearchString(post.display_url, post.thumbnail_url, post.thumbnail_src) || null,
    videoUrl: firstSearchString(post.video_url) || null,
    sourceUrl,
  };
}

/**
 * Parse `/v1/instagram/post` media. Accepts a full envelope or xdt_shortcode_media.
 * Missing video_play_count / follower count stay null.
 */
export function parseInstagramPostDetail(raw: unknown): InstagramSearchPost | null {
  const media = extractPostMediaFromResponse(raw) ?? raw;
  const item = asSearchRecord(media);
  const shortcode = firstSearchString(item.shortcode, item.code);
  if (!shortcode) return null;

  const owner = asSearchRecord(item.user ?? item.owner);
  const captionEdge = (item.edge_media_to_caption as { edges?: Array<{ node?: { text?: unknown } }> } | undefined)
    ?.edges?.[0]?.node?.text;
  const ownerUsername = firstSearchString(owner.username).replace(/^@/, "");
  const verified = owner.is_verified ?? owner.isVerified;
  const isPrivate = owner.is_private ?? owner.isPrivate;

  return {
    shortcode,
    caption:
      searchCaption(item.caption) ||
      (typeof captionEdge === "string" ? captionEdge : ""),
    views: optionalPositiveSearchMetric(
      item.video_play_count ?? item.play_count ?? item.view_count ?? item.video_view_count
    ),
    likes: optionalPositiveSearchMetric(
      item.like_count ?? asSearchRecord(item.edge_media_preview_like).count
    ),
    comments: optionalPositiveSearchMetric(
      item.comment_count ?? asSearchRecord(item.edge_media_to_parent_comment).count
    ),
    publishedAt: coerceInstagramTakenAtRaw(item.taken_at_timestamp ?? item.taken_at),
    ownerUsername,
    ownerFollowerCount: optionalPositiveSearchMetric(
      asSearchRecord(owner.edge_followed_by).count ?? owner.follower_count
    ),
    ownerIsVerified: typeof verified === "boolean" ? verified : null,
    ownerIsPrivate: typeof isPrivate === "boolean" ? isPrivate : null,
    thumbnailUrl:
      firstSearchString(
        item.thumbnail_src,
        item.display_url,
        asSearchRecord(
          Array.isArray(asSearchRecord(item.image_versions2).candidates)
            ? (asSearchRecord(item.image_versions2).candidates as unknown[])[0]
            : null
        ).url
      ) || null,
    videoUrl:
      firstSearchString(
        item.video_url,
        asSearchRecord(Array.isArray(item.video_versions) ? item.video_versions[0] : null).url
      ) || null,
    sourceUrl: `https://www.instagram.com/reel/${shortcode}/`,
  };
}

export async function searchInstagramPopular(
  query: string
): Promise<InstagramSearchResult> {
  const { status, data } = await scGet("/v1/instagram/search/popular", { query });
  if (status < 200 || status >= 300) {
    throw new Error(`Instagram Popular search failed: HTTP ${status}`);
  }
  const rows = extractInstagramSearchRows(data);
  const posts = rows
    .map((row) => parseInstagramSearchPost(row))
    .filter((post): post is InstagramSearchPost => post !== null);
  return { posts, rawCount: rows.length };
}

export async function searchInstagramKeywordReels(
  query: string,
  opts?: { datePosted?: string; page?: string }
): Promise<InstagramSearchResult> {
  const { status, data } = await scGet("/v2/instagram/reels/search", {
    query,
    date_posted: opts?.datePosted || "last-month",
    page: opts?.page || "1",
  });
  if (status < 200 || status >= 300) {
    throw new Error(`Instagram keyword Reel search failed: HTTP ${status}`);
  }
  const rows = extractInstagramSearchRows(data);
  const posts = rows
    .map((row) => parseInstagramSearchPost(row))
    .filter((post): post is InstagramSearchPost => post !== null);
  return { posts, rawCount: rows.length };
}

/**
 * Single-attempt `/v1/instagram/post` enrichment so one selected Reel costs
 * one credit. Reuses the existing post payload wrapper.
 */
export async function enrichInstagramPostByUrl(
  url: string
): Promise<InstagramSearchPost | null> {
  const payload = await fetchInstagramPostPayload(url, {
    preferUrl: url,
    mode: "interactive",
  });
  if (!payload.ok) return null;
  return parseInstagramPostDetail(payload.media);
}
