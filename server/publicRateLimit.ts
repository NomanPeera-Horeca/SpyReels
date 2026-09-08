import type { Request } from "express";

/**
 * Shared in-memory IP rate limiter for unauthenticated public HTTP/tRPC
 * surfaces. Same knobs as `publicScriptShareRoute` (60 req / 60s / IP).
 *
 * Process-local only. Production runs as a single Render web service
 * (`srv-d79bfrshg0os73e4lo1g` in project docs) with one Node process, so the
 * effective limit matches the configured 60/min. If the service is ever
 * scaled horizontally, this map does not share state across instances
 * (effective limit becomes 60 x instance count) — there is no Redis/shared
 * store in this codebase to back it; use the edge/WAF or keep instance count
 * at 1.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

export function clientIpFromRequest(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function isPublicIpRateLimited(ip: string): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

/**
 * Sliding auth-endpoint limiter: 20 login/register/forgot/reset attempts per
 * IP per 10 minutes. Separate from the public limiter so a username spray can't
 * burn the anonymous preview budget (or vice versa). Same process-local
 * trade-off as `isPublicIpRateLimited` (see note above).
 */
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_REQUESTS_PER_WINDOW = 20;

const authRateBuckets = new Map<string, RateBucket>();

function consume(bucketMap: Map<string, RateBucket>, ip: string, windowMs: number, max: number) {
  const now = Date.now();
  let bucket = bucketMap.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    bucketMap.set(ip, bucket);
  }
  bucket.count += 1;
  return bucket.count > max;
}

export function isAuthIpRateLimited(ip: string): boolean {
  return consume(authRateBuckets, ip, AUTH_WINDOW_MS, AUTH_MAX_REQUESTS_PER_WINDOW);
}

/**
 * Rolling 24h anonymous B-roll preview limiter (script + video modes).
 * Process-local Map, same trade-offs as `isPublicIpRateLimited` (no Redis).
 */
const BROLL_PREVIEW_WINDOW_MS = 24 * 60 * 60 * 1000;

type DailyBucket = {
  count: number;
  resetAt: number;
};

const brollPreviewBuckets = new Map<string, DailyBucket>();

function getOrResetDailyBucket(
  map: Map<string, DailyBucket>,
  key: string,
  windowMs: number
): DailyBucket {
  const now = Date.now();
  let bucket = map.get(key);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    map.set(key, bucket);
  }
  return bucket;
}

/** Peek remaining anonymous B-roll previews without consuming. */
export function peekAnonymousBrollPreviewQuota(
  ip: string,
  limit: number
): { remaining: number; limit: number; resetAt: number } {
  const bucket = getOrResetDailyBucket(
    brollPreviewBuckets,
    ip,
    BROLL_PREVIEW_WINDOW_MS
  );
  return {
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt: bucket.resetAt,
  };
}

/**
 * Consume one anonymous B-roll preview credit.
 * Returns remaining after consume, or remaining: 0 + allowed: false when blocked.
 */
export function consumeAnonymousBrollPreview(
  ip: string,
  limit: number
): { allowed: boolean; remaining: number; limit: number; resetAt: number } {
  const bucket = getOrResetDailyBucket(
    brollPreviewBuckets,
    ip,
    BROLL_PREVIEW_WINDOW_MS
  );
  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetAt: bucket.resetAt,
    };
  }
  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limit - bucket.count),
    limit,
    resetAt: bucket.resetAt,
  };
}
