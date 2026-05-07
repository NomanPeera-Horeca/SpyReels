import { r2ObjectPublicUrl, storageHead, storagePut } from "./storage";

/** Do not buffer larger videos server-side — mirrors best-effort only. */
const MAX_VIDEO_DOWNLOAD_BYTES = 120 * 1024 * 1024; // 120 MiB

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export function reelVideoR2Key(shortcode: string): string {
  const safe = shortcode.replace(/[^a-zA-Z0-9_-]/g, "");
  return `reel-videos/${safe}.mp4`;
}

/**
 * Copy an Instagram-hosted reel MP4 to R2; return a durable public URL.
 * On unavailable R2 credentials, CDN failure, oversize payload, or any
 * unexpected error → returns original `sourceUrl` so callers can persist
 * ephemeral links (same semantics as thumbnails).
 *
 * Dedupes storage by reel shortcode (shared with user + featured ingest).
 *
 * Oversize videos (above the mirroring cap in this module) skip upload to
 * avoid pinning large buffers in memory on small worker boxes.
 */
export async function ensureReelVideoOnR2(
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

  const key = reelVideoR2Key(safe);

  try {
    if (await storageHead(key)) return r2ObjectPublicUrl(key);

    const { gotScraping: gs } = await import("got-scraping");
    const res = await gs({
      url: src,
      responseType: "buffer",
      timeout: { request: DOWNLOAD_TIMEOUT_MS },
      retry: { limit: 0 },
    });

    if (res.statusCode !== 200 || !res.rawBody) return src;

    const raw = res.rawBody;
    if (raw.length > MAX_VIDEO_DOWNLOAD_BYTES) return src;

    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const { url } = await storagePut(key, buf, "video/mp4");
    return url;
  } catch {
    return src;
  }
}
