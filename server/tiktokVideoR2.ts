import { eq } from "drizzle-orm";
import { tiktokVideos } from "../drizzle/schema";
import { getDb } from "./db";
import { r2ObjectPublicUrl, storageHead, storagePut } from "./storage";
import { MAX_VIDEO_DOWNLOAD_BYTES } from "./reelVideoR2";

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

export function tiktokVideoR2Key(awemeId: string): string {
  const safe = awemeId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `tiktok-videos/${safe}.mp4`;
}

export async function ensureTiktokVideoOnR2(
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

  const key = tiktokVideoR2Key(safe);

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

    let raw: Buffer | undefined = Buffer.isBuffer(res.rawBody)
      ? res.rawBody
      : Buffer.from(res.rawBody);
    if (raw.length > MAX_VIDEO_DOWNLOAD_BYTES) {
      raw = undefined;
      return src;
    }

    let buf: Buffer | undefined = raw;
    try {
      const { url } = await storagePut(key, buf, "video/mp4");
      return url;
    } finally {
      raw = undefined;
      buf = undefined;
    }
  } catch {
    return src;
  }
}

/**
 * Mirror a TikTok video to R2 and persist the stable URL without blocking
 * the caller. Matches scheduleReelVideoMirror's lazy, fire-and-forget
 * pattern: called only when a fresh video URL is actually needed (e.g.
 * transcription request), not upfront for every scraped video.
 */
export function scheduleTiktokVideoMirror(
  videoId: number,
  awemeId: string,
  sourceUrl: string
): void {
  const src = sourceUrl.trim();
  if (!src || !Number.isFinite(videoId)) return;

  void (async () => {
    try {
      const mirrored = (await ensureTiktokVideoOnR2(awemeId, src)).trim();
      if (!mirrored) return;

      const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
      if (!publicBase || !mirrored.startsWith(publicBase)) return;

      const db = await getDb();
      if (!db) return;

      await db.update(tiktokVideos).set({ videoUrl: mirrored }).where(eq(tiktokVideos.id, videoId));
    } catch (err) {
      console.error(`[scheduleTiktokVideoMirror] video id=${videoId} failed:`, err);
    }
  })();
}
