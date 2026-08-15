import { r2ObjectPublicUrl, storageHead, storagePut } from "./storage";
import sharp from "sharp";

/**
 * R2 key for a TikTok video thumbnail, keyed by aweme_id.
 */
export function tiktokThumbnailR2Key(awemeId: string): string {
  const safe = awemeId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `tiktok-thumbs/${safe}.jpg`;
}

function looksLikeHeif(buf: Buffer): boolean {
  // ISO BMFF: ....ftyp.... with brand heic/heif/mif1/msf1
  if (buf.length < 12) return false;
  const brand = buf.slice(8, 12).toString("ascii");
  return (
    brand === "heic" ||
    brand === "heif" ||
    brand === "mif1" ||
    brand === "msf1" ||
    brand === "heix"
  );
}

async function bufferToJpeg(buf: Buffer, awemeId: string): Promise<Buffer> {
  try {
    const metadata = await sharp(buf).metadata();
    const needsConvert =
      metadata.format === "heif" || looksLikeHeif(buf);
    if (!needsConvert) {
      // Ensure we store real JPEG even if source was already jpeg-ish.
      if (metadata.format === "jpeg") return buf;
      return sharp(buf).jpeg({ quality: 90 }).toBuffer();
    }
    const heicConvert = (await import("heic-convert")).default;
    const converted = await heicConvert({
      buffer: buf,
      format: "JPEG",
      quality: 0.9,
    });
    return Buffer.isBuffer(converted) ? converted : Buffer.from(converted);
  } catch (conversionErr) {
    console.warn(
      `[ensureTiktokThumbnailOnR2] convert failed for ${awemeId}, uploading original bytes:`,
      conversionErr instanceof Error ? conversionErr.message : conversionErr
    );
    return buf;
  }
}

/**
 * Best-effort upload of a TikTok video cover thumbnail to R2 as JPEG.
 *
 * Older collects stored HEIC covers under reel-thumbs/ with image/jpeg content
 * type; browsers show a blank tile. Canonical path is tiktok-thumbs/{id}.jpg.
 *
 * Idempotent when a real JPEG already exists at the canonical key.
 */
export async function ensureTiktokThumbnailOnR2(
  awemeId: string,
  sourceUrl: string | null | undefined,
  opts?: { force?: boolean }
): Promise<string> {
  const src = (sourceUrl ?? "").trim();
  if (src === "") return "";

  const safe = awemeId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (safe === "") return src;

  const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(
    /\/+$/,
    ""
  );
  const key = tiktokThumbnailR2Key(safe);
  const canonicalUrl = publicBase ? `${publicBase}/${key}` : "";

  // Already on the HEIC-aware path: keep it unless force remirror.
  if (
    !opts?.force &&
    publicBase &&
    src.startsWith(`${publicBase}/tiktok-thumbs/`)
  ) {
    return src;
  }

  try {
    if (!opts?.force && (await storageHead(key))) {
      return r2ObjectPublicUrl(key);
    }

    const { gotScraping: gs } = await import("got-scraping");
    const res = await gs({
      url: src,
      responseType: "buffer",
      timeout: { request: 10_000 },
      retry: { limit: 0 },
    });

    if (res.statusCode !== 200 || !res.rawBody) {
      return canonicalUrl || src;
    }

    const raw = res.rawBody;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    const uploadBuf = await bufferToJpeg(buf, awemeId);
    const { url } = await storagePut(key, uploadBuf, "image/jpeg");
    return url;
  } catch {
    return canonicalUrl || src;
  }
}
