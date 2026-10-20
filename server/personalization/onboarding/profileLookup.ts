/**
 * Step 2 "Is this you?" profile lookup.
 *
 * This identifies the public profile. It does not run AI analysis, recommendations,
 * or viral-video discovery. Those start later, after the customer confirms,
 * through the existing durable analysis job.
 *
 * Recent posts are included only when they already arrived in the profile
 * payload. Avatar and thumbnail mirroring never blocks the response.
 */
import type { SocialPlatform } from "@shared/personalization/model";
import type { PublicProfilePreview } from "@shared/personalization/publicProfilePreview";
import {
  PROFILE_LOOKUP_ATTEMPT_TIMEOUT_MS,
  PROFILE_LOOKUP_CACHE_TTL_MS,
  PROFILE_LOOKUP_DEADLINE_MS,
  PROFILE_LOOKUP_MAX_ATTEMPTS,
} from "@shared/personalization/profileLookup";
import {
  withScrapeCreatorsMeter,
  type ScrapeCreatorsMeterReport,
} from "../../scrapeCreatorsMeter";
import type { LookupBudgetOptions } from "../../providerLookupBudget";

/** Provider requests allowed for one lookup (IG may need search + by-id). */
export const PROFILE_LOOKUP_REQUEST_BUDGET = 8;
/** Lookups per user per rolling hour. */
export const PROFILE_LOOKUPS_PER_HOUR = 20;

export type ProfileLookupFailure =
  | "not_found"
  | "private"
  | "error"
  | "rate_limited"
  | "timeout";

export type ProfileLookupResult =
  | { ok: true; profile: PublicProfilePreview; meter: ScrapeCreatorsMeterReport }
  | { ok: false; reason: ProfileLookupFailure; meter: ScrapeCreatorsMeterReport | null };

export class ProfileLookupDeadlineError extends Error {
  constructor() {
    super("profile_lookup_deadline");
    this.name = "ProfileLookupDeadlineError";
  }
}

export type ProfileLookupCall = LookupBudgetOptions & { signal: AbortSignal };

type InstagramLookup = {
  username: string;
  fullName: string;
  biography: string;
  profilePicUrl: string;
  followerCount: number;
  followingCount: number;
  postCount: number;
  isVerified: boolean;
  isPrivate: boolean;
  category: string;
  externalUrl: string;
  userId: string;
  countsKnown?: boolean;
  recentMedia?: Array<{
    shortcode: string;
    thumbnailUrl: string;
    viewCount: number | null;
    isPinned: boolean;
  }>;
};

export type ProfileLookupDeps = {
  instagram: (handle: string, call?: ProfileLookupCall) => Promise<InstagramLookup>;
  tiktok: (
    handle: string,
    call?: ProfileLookupCall
  ) => Promise<{
    userId: string;
    uniqueId: string;
    nickname: string;
    biography?: string;
    isPrivate: boolean;
    followerCount: number;
    followingCount: number;
    videoCount: number;
    heartCount: number;
    avatarUrl: string;
    isVerified?: boolean;
  }>;
  youtube: (
    handle: string,
    call?: ProfileLookupCall
  ) => Promise<{
    channelId: string;
    handle: string;
    name: string;
    isVerified: boolean;
    subscriberCount: number;
    description: string;
    avatarUrl: string;
  }>;
  mirrorAvatar: (handle: string, url: string, platform: SocialPlatform) => Promise<string>;
  mirrorThumbnails: (
    items: Array<{ shortcode: string; thumbnailUrl: string }>
  ) => Promise<Map<string, string>>;
  /** Classifies a thrown provider error. */
  classify: (err: unknown) => ProfileLookupFailure;
};

const textOrNull = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/** Provider counts of 0 are kept (a real 0); negative or non-finite become null. */
const countOrNull = (v: number | null | undefined) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

const lookupLog = new Map<number, number[]>();

/** Rolling one-hour limit per user. In memory: resets on deploy, bounded per instance. */
export function takeLookupSlot(userId: number, now = Date.now()): boolean {
  const hourAgo = now - 60 * 60 * 1000;
  const recent = (lookupLog.get(userId) ?? []).filter(t => t > hourAgo);
  if (recent.length >= PROFILE_LOOKUPS_PER_HOUR) {
    lookupLog.set(userId, recent);
    return false;
  }
  recent.push(now);
  lookupLog.set(userId, recent);
  return true;
}

export function resetLookupLimiterForTests(): void {
  lookupLog.clear();
}

type CacheEntry = { profile: PublicProfilePreview; at: number; generation: number };

const successCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ProfileLookupResult>>();

export function publicProfileCacheKey(platform: SocialPlatform, handle: string): string {
  return `${platform}:${handle.trim().toLowerCase()}`;
}

export function recallCachedPublicProfile(
  platform: SocialPlatform,
  handle: string,
  now = Date.now()
): PublicProfilePreview | null {
  const hit = successCache.get(publicProfileCacheKey(platform, handle));
  if (!hit || now - hit.at >= PROFILE_LOOKUP_CACHE_TTL_MS) return null;
  return hit.profile;
}

export function resetProfileLookupCacheForTests(): void {
  successCache.clear();
  inflight.clear();
}

function emptyMeter(): ScrapeCreatorsMeterReport {
  return {
    requests: 0,
    blockedByBudget: 0,
    byStatus: {},
    budget: PROFILE_LOOKUP_REQUEST_BUDGET,
    estimatedUsd: 0,
  };
}

function remember(
  key: string,
  profile: PublicProfilePreview,
  at: number
): number {
  const generation = (successCache.get(key)?.generation ?? 0) + 1;
  const entry = { profile, at, generation };
  successCache.set(key, entry);
  const canonical = publicProfileCacheKey(profile.platform, profile.handle);
  if (canonical !== key) successCache.set(canonical, { ...entry });
  while (successCache.size > 5000) {
    const oldest = successCache.keys().next().value;
    if (!oldest) break;
    successCache.delete(oldest);
  }
  return generation;
}

async function fetchPreview(
  platform: SocialPlatform,
  handle: string,
  deps: ProfileLookupDeps,
  call: ProfileLookupCall
): Promise<PublicProfilePreview> {
  if (platform === "instagram") {
    const p = await deps.instagram(handle, call);
    const canonical = p.username.toLowerCase();
    const countsKnown = p.countsKnown !== false;
    const media = (p.recentMedia ?? []).slice(0, 6);
    return {
      platform,
      handle: canonical,
      displayName: textOrNull(p.fullName),
      bio: textOrNull(p.biography),
      category: textOrNull(p.category),
      externalUrl: textOrNull(p.externalUrl),
      avatarUrl: textOrNull(p.profilePicUrl),
      bannerUrl: null,
      isVerified: p.isVerified,
      isPrivate: p.isPrivate,
      postCount: countsKnown ? countOrNull(p.postCount) : null,
      followerCount: countsKnown ? countOrNull(p.followerCount) : null,
      followingCount: countsKnown ? countOrNull(p.followingCount) : null,
      likeCount: null,
      videoCount: null,
      recentPosts: media.map(m => ({
        id: m.shortcode,
        thumbnailUrl: textOrNull(m.thumbnailUrl),
        viewCount: countOrNull(m.viewCount),
        isPinned: m.isPinned,
      })),
    };
  }
  if (platform === "tiktok") {
    const p = await deps.tiktok(handle, call);
    const canonical = (p.uniqueId || handle).toLowerCase();
    return {
      platform,
      handle: canonical,
      displayName: textOrNull(p.nickname),
      bio: textOrNull(p.biography),
      category: null,
      externalUrl: null,
      avatarUrl: textOrNull(p.avatarUrl),
      bannerUrl: null,
      isVerified: Boolean(p.isVerified),
      isPrivate: p.isPrivate,
      postCount: countOrNull(p.videoCount),
      followerCount: countOrNull(p.followerCount),
      followingCount: countOrNull(p.followingCount),
      likeCount: countOrNull(p.heartCount),
      videoCount: null,
      recentPosts: [],
    };
  }
  const c = await deps.youtube(handle, call);
  const canonical = (c.handle || handle).toLowerCase();
  return {
    platform,
    handle: canonical,
    displayName: textOrNull(c.name),
    bio: textOrNull(c.description),
    category: null,
    externalUrl: null,
    avatarUrl: textOrNull(c.avatarUrl),
    bannerUrl: null,
    isVerified: c.isVerified,
    isPrivate: false,
    postCount: null,
    followerCount: countOrNull(c.subscriberCount),
    followingCount: null,
    likeCount: null,
    videoCount: null,
    recentPosts: [],
  };
}

/**
 * Resolves on the deadline without leaving a late provider rejection unhandled.
 * Aborting the signal is how the provider attempt actually stops.
 */
async function withLookupDeadline<T>(
  deadlineMs: number,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ ok: false; error: ProfileLookupDeadlineError }>(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, error: new ProfileLookupDeadlineError() });
    }, deadlineMs);
  });
  const work = run(controller.signal).then(
    value => ({ ok: true as const, value }),
    (error: unknown) => ({
      ok: false as const,
      error: controller.signal.aborted ? new ProfileLookupDeadlineError() : error,
    })
  );
  try {
    const outcome = await Promise.race([work, deadline]);
    if (!outcome.ok) throw outcome.error;
    return outcome.value;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const WARM_MEDIA_MS = 3_000;

function firstSettled<T>(run: Promise<T>, fallback: T, ms: number): Promise<T> {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    run.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}

function warmMedia(
  key: string,
  generation: number,
  profile: PublicProfilePreview,
  deps: ProfileLookupDeps
): void {
  void (async () => {
    const avatar = profile.avatarUrl
      ? await firstSettled(
          deps.mirrorAvatar(profile.handle, profile.avatarUrl, profile.platform).catch(() => profile.avatarUrl),
          profile.avatarUrl,
          WARM_MEDIA_MS
        )
      : profile.avatarUrl;
    const sources = profile.recentPosts
      .filter(post => post.thumbnailUrl)
      .map(post => ({ shortcode: post.id, thumbnailUrl: post.thumbnailUrl ?? "" }));
    const thumbs = sources.length
      ? await firstSettled(
          deps.mirrorThumbnails(sources).catch(() => new Map<string, string>()),
          new Map<string, string>(),
          WARM_MEDIA_MS
        )
      : new Map<string, string>();
    const current = successCache.get(key);
    if (!current || current.generation !== generation) return;
    const updated: PublicProfilePreview = {
      ...current.profile,
      avatarUrl: textOrNull(avatar) ?? current.profile.avatarUrl,
      recentPosts: current.profile.recentPosts.map(post => ({
        ...post,
        thumbnailUrl: textOrNull(thumbs.get(post.id) ?? post.thumbnailUrl),
      })),
    };
    const write = (cacheKey: string) => {
      const entry = successCache.get(cacheKey);
      if (!entry || entry.generation !== generation) return;
      successCache.set(cacheKey, { ...entry, profile: updated });
    };
    write(key);
    write(publicProfileCacheKey(profile.platform, profile.handle));
  })();
}

export async function lookupPublicProfile(input: {
  userId: number;
  platform: SocialPlatform;
  handle: string;
  deps: ProfileLookupDeps;
  now?: number;
  /** Test override. Production uses PROFILE_LOOKUP_DEADLINE_MS. */
  deadlineMs?: number;
  /** Copy provider media to stable storage after the response is ready. */
  warmMedia?: boolean;
}): Promise<ProfileLookupResult> {
  const now = input.now ?? Date.now();
  const key = publicProfileCacheKey(input.platform, input.handle);
  const cached = recallCachedPublicProfile(input.platform, input.handle, now);
  if (cached) return { ok: true, profile: cached, meter: emptyMeter() };

  const pending = inflight.get(key);
  if (pending) return pending;

  if (!takeLookupSlot(input.userId, now)) {
    return { ok: false, reason: "rate_limited", meter: null };
  }

  const deadlineMs = input.deadlineMs ?? PROFILE_LOOKUP_DEADLINE_MS;
  const started = Date.now();
  const work = (async (): Promise<ProfileLookupResult> => {
    const metered = await withScrapeCreatorsMeter(PROFILE_LOOKUP_REQUEST_BUDGET, () =>
      withLookupDeadline(deadlineMs, signal =>
        fetchPreview(input.platform, input.handle, input.deps, {
          timeoutMs: Math.min(PROFILE_LOOKUP_ATTEMPT_TIMEOUT_MS, deadlineMs),
          maxAttempts: PROFILE_LOOKUP_MAX_ATTEMPTS,
          deadlineMs,
          signal,
        })
      )
    );
    if ("error" in metered) {
      const reason =
        metered.error instanceof ProfileLookupDeadlineError
          ? "timeout"
          : input.deps.classify(metered.error);
      console.log(
        `[onboarding.lookup] platform=${input.platform} ms=${Date.now() - started} ok=false reason=${reason}`
      );
      return { ok: false, reason, meter: metered.report };
    }
    if (metered.result.isPrivate) {
      console.log(
        `[onboarding.lookup] platform=${input.platform} ms=${Date.now() - started} ok=false reason=private`
      );
      return { ok: false, reason: "private", meter: metered.report };
    }
    const generation = remember(key, metered.result, now);
    if (input.warmMedia) warmMedia(key, generation, metered.result, input.deps);
    console.log(
      `[onboarding.lookup] platform=${input.platform} ms=${Date.now() - started} ok=true requests=${metered.report.requests}`
    );
    return { ok: true, profile: metered.result, meter: metered.report };
  })();

  inflight.set(key, work);
  try {
    return await work;
  } finally {
    if (inflight.get(key) === work) inflight.delete(key);
  }
}
