import { r2ObjectPublicUrl, storageHead, storagePut } from "./storage";

/**
 * R2 key for a TikTok video thumbnail, keyed by aweme_id.
 */
export function tiktokThumbnailR2Key(awemeId: string): string {
  const safe = awemeId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `tiktok-thumbs/${safe}.jpg`;
}

/**
 * Best-effort upload of a TikTok-CDN video cover thumbnail to R2.
 *
 * Returns the stable R2 public URL on success, or the raw `sourceUrl`
 * on any failure. Idempotent: if the canonical R2 object already exists,
 * returns the public URL without re-downloading.
 *
 * TikTok CDN thumbnail URLs carry signed query params (x-expires) that
 * expire, same reasoning as Instagram thumbnails: mirror to R2 at scrape
 * time so the dashboard image does not 403 later.
 */
export async function ensureTiktokThumbnailOnR2(
  awemeId: string,
  sourceUrl: string | null | undefined
): Promise<string> {
  const src = (sourceUrl ?? "").trim();
  if (src === "") return "";

  const safe = awemeId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (safe === "") return src;

  const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "")
    .replace(/\/+$/, "");
  if (publicBase && src.startsWith(publicBase)) return src;

  const key = tiktokThumbnailR2Key(safe);

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
