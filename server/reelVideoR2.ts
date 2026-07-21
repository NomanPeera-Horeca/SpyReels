import { eq, inArray } from "drizzle-orm";
import { reels } from "../drizzle/schema";
import { getDb } from "./db";
import { r2ObjectPublicUrl, storageHead, storagePut } from "./storage";

/** Do not buffer larger videos server-side — mirrors best-effort only. */
export const MAX_VIDEO_DOWNLOAD_BYTES = 120 * 1024 * 1024; // 120 MiB

const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const MIRROR_BATCH_SIZE = 2;

export function reelVideoR2Key(shortcode: string): string {
  const safe = shortcode.replace(/[^a-zA-Z0-9_-]/g, "");
  return `reel-videos/${safe}.mp4`;
}

/**
 * True when a stored videoUrl is durable enough to use for transcription
 * without re-fetching Instagram (R2 mirror). Ephemeral CDN links return false.
 */
export function isDurableReelVideoUrl(url: string | null | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u) return false;

  const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (publicBase && u.startsWith(publicBase)) return true;

  // Fallback patterns when env is unset in tests or older mirrored rows.
  if (u.includes("/reel-videos/") && (u.includes(".r2.dev/") || u.includes("cloudflarestorage.com"))) {
    return true;
  }

  return false;
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
/**
 * Mirror a reel video to R2 and persist the stable URL without blocking the caller.
 * Used after refreshVideoUrl returns an ephemeral CDN link for immediate playback.
 */
export function scheduleReelVideoMirror(
  reelId: number,
  shortcode: string,
  sourceUrl: string
): void {
  const src = sourceUrl.trim();
  if (!src || !Number.isFinite(reelId)) return;

  void (async () => {
    try {
      const mirrored = (await ensureReelVideoOnR2(shortcode, src)).trim();
      if (!mirrored) return;

      const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
      if (!publicBase || !mirrored.startsWith(publicBase)) return;

      const db = await getDb();
      if (!db) return;

      await db.update(reels).set({ videoUrl: mirrored }).where(eq(reels.id, reelId));
    } catch (err) {
      console.error(`[scheduleReelVideoMirror] reel id=${reelId} failed:`, err);
    }
  })();
}

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
 * Background batch helper: mirror videoUrls of reels to R2 and update the DB.
 * Idempotent (skips rows already on R2). Designed for fire-and-forget use after scrape completion.
 */
export async function mirrorReelVideosToR2ByIds(
  reelIds: number[]
): Promise<{ ok: number; failed: number; skipped: number }> {
  const uniqueIds = [...new Set(reelIds.filter((id) => Number.isFinite(id)))];
  if (uniqueIds.length === 0) {
    return { ok: 0, failed: 0, skipped: 0 };
  }

  const startedAt = Date.now();
  const counts = { ok: 0, failed: 0, skipped: 0 };
  console.log(`[mirrorReelVideosToR2ByIds] start n=${uniqueIds.length}`);

  try {
    const db = await getDb();
    if (!db) {
      counts.failed = uniqueIds.length;
      console.error("[mirrorReelVideosToR2ByIds] database unavailable");
      return counts;
    }
    const mirrorDb = db;

    const rows = await mirrorDb
      .select({
        id: reels.id,
        shortcode: reels.shortcode,
        videoUrl: reels.videoUrl,
      })
      .from(reels)
      .where(inArray(reels.id, uniqueIds));

    const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
    counts.skipped += Math.max(0, uniqueIds.length - rows.length);

    async function mirrorOne(row: (typeof rows)[number]): Promise<void> {
      try {
        const videoUrl = (row.videoUrl ?? "").trim();
        if (!videoUrl) {
          counts.skipped++;
          return;
        }
        if (publicBase && videoUrl.startsWith(publicBase)) {
          counts.skipped++;
          return;
        }

        const mirroredUrl = await ensureReelVideoOnR2(row.shortcode, videoUrl);
        if (!publicBase || !mirroredUrl.startsWith(publicBase)) {
          counts.failed++;
          return;
        }

        await mirrorDb
          .update(reels)
          .set({ videoUrl: mirroredUrl })
          .where(eq(reels.id, row.id));
        counts.ok++;
      } catch (err) {
        counts.failed++;
        console.error(
          `[mirrorReelVideosToR2ByIds] reel id=${row.id} failed:`,
          err
        );
      }
    }

    for (let i = 0; i < rows.length; i += MIRROR_BATCH_SIZE) {
      await Promise.all(rows.slice(i, i + MIRROR_BATCH_SIZE).map((row) => mirrorOne(row)));
    }
  } catch (err) {
    counts.failed += Math.max(0, uniqueIds.length - counts.ok - counts.failed - counts.skipped);
    console.error("[mirrorReelVideosToR2ByIds] failed:", err);
  } finally {
    console.log(
      `[mirrorReelVideosToR2ByIds] done ok=${counts.ok} failed=${counts.failed} skipped=${counts.skipped} ms=${Date.now() - startedAt}`
    );
  }

  return counts;
}
