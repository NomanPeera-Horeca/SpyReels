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
