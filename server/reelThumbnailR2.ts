import { r2ObjectPublicUrl, storageHead, storagePut } from "./storage";

/**
 * R2 key for a reel thumbnail. Shared namespace between the user-job
 * scrape pipeline (`reels` table) and the featured-account scrape pipeline
 * (`featured_reels` table) — keyed by Instagram shortcode so the same reel
 * fetched through either pipeline dedups to one R2 object.
 */
export function reelThumbnailR2Key(shortcode: string): string {
  const safe = shortcode.replace(/[^a-zA-Z0-9_-]/g, "");
  return `reel-thumbs/${safe}.jpg`;
}

/**
 * Best-effort upload of an Instagram-CDN reel thumbnail to R2.
 *
 * Returns the stable R2 public URL on success, or the raw `sourceUrl`
 * on any failure (mirrors profilePicR2OrRaw — the UI handles expiry).
 *
 * Idempotent: if the canonical R2 object already exists, returns the
 * public URL without re-downloading.
 *
 * Why this exists: Instagram's `*.cdninstagram.com` / `*.fbcdn.net`
 * thumbnail URLs carry a signed query string that expires every 24–48h.
 * Persisting them to the `reels` or `featured_reels` tables means the
 * dashboard `<img>` 403s a day or two after the scrape. Uploading to
 * R2 at scrape time gives us a permanent URL we control.
 */
export async function ensureReelThumbnailOnR2(
  shortcode: string,
  sourceUrl: string | null | undefined
): Promise<string> {
  const src = (sourceUrl ?? "").trim();
  if (src === "") return "";

  const safe = shortcode.replace(/[^a-zA-Z0-9_-]/g, "");
  if (safe === "") return src;

  const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "")
    .replace(/\/+$/, "");
  if (publicBase && src.startsWith(publicBase)) return src;

  const key = reelThumbnailR2Key(safe);

  try {
    if (await storageHead(key)) {
      return r2ObjectPublicUrl(key);
    }

    const { gotScraping: gs } = await import("got-scraping");
    const res = await gs({
      url: src,
      responseType: "buffer",
      timeout: { request: 10_000 },
      retry: { limit: 0 },
    });

    if (res.statusCode !== 200 || !res.rawBody) return src;

    const raw = res.rawBody;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const { url } = await storagePut(key, buf, "image/jpeg");
    return url;
  } catch {
    return src;
  }
}
