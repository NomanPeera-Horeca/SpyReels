/**
 * Durable background ingest for Collected Reels (Telegram / URL paste).
 * Retries with backoff via nextFetchAt; marks ready only when R2 has a thumbnail
 * (or video). YouTube may be thumbnail-only (remake uses captions).
 */

import {
  getCollectedReelById,
  hasCollectedReelIngestColumns,
  listCollectedReelsDueForIngest,
  updateCollectedReel,
} from "./db";
import { fetchCollectedReelMetadataForPlatform } from "./collectedReelFetch";
import { ensureReelThumbnailOnR2 } from "./reelThumbnailR2";
import { ensureReelVideoOnR2 } from "./reelVideoR2";
import type { CollectedVideoPlatform } from "./socialVideoUrl";

export const COLLECTED_REEL_MAX_FETCH_ATTEMPTS = 24;

const inFlight = new Set<number>();

function backoffMs(attempt: number): number {
  return Math.min(90_000 * Math.max(attempt, 1), 10 * 60_000);
}

function platformOf(reel: { platform?: string | null }): CollectedVideoPlatform {
  const p = (reel.platform || "instagram").toLowerCase();
  if (p === "tiktok" || p === "youtube") return p;
  return "instagram";
}

function pendingStatusMessage(
  platform: CollectedVideoPlatform,
  attempt: number
): string {
  const label =
    platform === "tiktok"
      ? "TikTok"
      : platform === "youtube"
        ? "YouTube"
        : "Instagram";
  return `Fetching ${label} video (attempt ${attempt} of ${COLLECTED_REEL_MAX_FETCH_ATTEMPTS})…`;
}

export function enqueueCollectedReelIngest(reelId: number): void {
  if (inFlight.has(reelId)) return;
  void runCollectedReelIngest(reelId);
}

async function runCollectedReelIngest(reelId: number): Promise<void> {
  if (inFlight.has(reelId)) return;
  inFlight.add(reelId);
  try {
    await processCollectedReelIngest(reelId);
  } finally {
    inFlight.delete(reelId);
  }
}

async function processCollectedReelIngestLegacy(reelId: number): Promise<void> {
  const reel = await getCollectedReelById(reelId);
  if (!reel || reel.status !== "pending") return;

  const platform = platformOf(reel);
  const preferUrl = reel.reelUrl?.trim() || undefined;
  try {
    const outcome = await fetchCollectedReelMetadataForPlatform(
      platform,
      reel.shortcode,
      preferUrl
    );
    if (!outcome.ok) {
      await updateCollectedReel(reelId, {
        status: "failed",
        errorMessage: outcome.message,
      });
      return;
    }
    const data = outcome.data;
    const [stableThumb, stableVid] = await Promise.all([
      ensureReelThumbnailOnR2(
        reel.shortcode,
        (data.thumbnailUrl || "").trim() || null
      ),
      platform === "youtube"
        ? Promise.resolve("")
        : ensureReelVideoOnR2(
            reel.shortcode,
            (data.videoUrl || "").trim() || null
          ),
    ]);
    if (!stableThumb.trim() && !stableVid.trim()) {
      await updateCollectedReel(reelId, {
        status: "failed",
        errorMessage:
          "Could not download video media. Try Retry or paste the link again.",
      });
      return;
    }
    await updateCollectedReel(reelId, {
      caption: data.caption || null,
      viewCount: data.viewCount || 0,
      likeCount: data.likeCount || 0,
      commentCount: data.commentCount || 0,
      thumbnailUrl: stableThumb.trim() ? stableThumb : null,
      videoUrl: stableVid.trim() ? stableVid : null,
      duration: data.duration || null,
      postedAt: data.postedAt || null,
      ownerUsername: data.ownerUsername || null,
      ownerFullName: data.ownerFullName || null,
      ownerProfilePicUrl: data.ownerProfilePicUrl || null,
      ownerFollowerCount: data.ownerFollowerCount || 0,
      status: "ready",
      errorMessage: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await updateCollectedReel(reelId, { status: "failed", errorMessage: message });
  }
}

export async function processCollectedReelIngest(reelId: number): Promise<void> {
  if (!(await hasCollectedReelIngestColumns())) {
    return processCollectedReelIngestLegacy(reelId);
  }

  const reel = await getCollectedReelById(reelId);
  if (!reel || reel.status !== "pending") return;

  const platform = platformOf(reel);
  const attempt = (reel.fetchAttempts ?? 0) + 1;
  const preferUrl = reel.reelUrl?.trim() || undefined;

  await updateCollectedReel(reelId, {
    fetchAttempts: attempt,
    lastFetchAt: new Date(),
    errorMessage: pendingStatusMessage(platform, attempt),
    nextFetchAt: null,
  });

  try {
    const outcome = await fetchCollectedReelMetadataForPlatform(
      platform,
      reel.shortcode,
      preferUrl
    );

    if (!outcome.ok) {
      if (attempt >= COLLECTED_REEL_MAX_FETCH_ATTEMPTS) {
        await updateCollectedReel(reelId, {
          status: "failed",
          errorMessage: outcome.message,
          nextFetchAt: null,
        });
      } else {
        await updateCollectedReel(reelId, {
          status: "pending",
          errorMessage: `${outcome.message} Retrying automatically…`,
          nextFetchAt: new Date(Date.now() + backoffMs(attempt)),
        });
      }
      return;
    }

    const data = outcome.data;
    const thumbCand = (data.thumbnailUrl || reel.thumbnailUrl || "").trim();
    const vidCand = (data.videoUrl || reel.videoUrl || "").trim();

    const [stableThumb, stableVid] = await Promise.all([
      ensureReelThumbnailOnR2(reel.shortcode, thumbCand || null),
      platform === "youtube"
        ? Promise.resolve("")
        : ensureReelVideoOnR2(reel.shortcode, vidCand || null),
    ]);

    const hasR2Thumb = stableThumb.trim().length > 0;
    const hasR2Video = stableVid.trim().length > 0;

    if (!hasR2Thumb && !hasR2Video) {
      if (attempt >= COLLECTED_REEL_MAX_FETCH_ATTEMPTS) {
        await updateCollectedReel(reelId, {
          status: "failed",
          errorMessage:
            "Could not download video media after several attempts. Try Retry or paste the link again.",
          nextFetchAt: null,
        });
      } else {
        await updateCollectedReel(reelId, {
          status: "pending",
          errorMessage: pendingStatusMessage(platform, attempt),
          nextFetchAt: new Date(Date.now() + backoffMs(attempt)),
        });
      }
      return;
    }

    await updateCollectedReel(reelId, {
      caption: data.caption || reel.caption || null,
      viewCount: data.viewCount > 0 ? data.viewCount : reel.viewCount || 0,
      likeCount: data.likeCount > 0 ? data.likeCount : reel.likeCount || 0,
      commentCount: data.commentCount > 0 ? data.commentCount : reel.commentCount || 0,
      thumbnailUrl: hasR2Thumb ? stableThumb : reel.thumbnailUrl,
      videoUrl: hasR2Video ? stableVid : platform === "youtube" ? null : reel.videoUrl,
      duration: data.duration || reel.duration || null,
      postedAt: data.postedAt || reel.postedAt || null,
      ownerUsername: data.ownerUsername || reel.ownerUsername || null,
      ownerFullName: data.ownerFullName || reel.ownerFullName || null,
      ownerProfilePicUrl: data.ownerProfilePicUrl || reel.ownerProfilePicUrl || null,
      ownerFollowerCount:
        data.ownerFollowerCount > 0 ? data.ownerFollowerCount : reel.ownerFollowerCount || 0,
      status: "ready",
      errorMessage: null,
      nextFetchAt: null,
      fetchProvider: outcome.provider,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (attempt >= COLLECTED_REEL_MAX_FETCH_ATTEMPTS) {
      await updateCollectedReel(reelId, {
        status: "failed",
        errorMessage: message,
        nextFetchAt: null,
      });
    } else {
      await updateCollectedReel(reelId, {
        status: "pending",
        errorMessage: `${message} Retrying automatically…`,
        nextFetchAt: new Date(Date.now() + backoffMs(attempt)),
      });
    }
  }
}

/** Re-fetch metadata for an already-ready reel (Refresh All on ready rows). */
export async function processCollectedReelRefresh(reelId: number): Promise<void> {
  const reel = await getCollectedReelById(reelId);
  if (!reel || reel.status !== "ready") return;
  const platform = platformOf(reel);

  try {
    const outcome = await fetchCollectedReelMetadataForPlatform(
      platform,
      reel.shortcode,
      reel.reelUrl?.trim() || undefined
    );
    if (!outcome.ok) {
      console.warn(
        `[collectedReelWorker] refresh ${reel.shortcode} failed: ${outcome.message}`
      );
      return;
    }

    const data = outcome.data;
    const thumbCand = (data.thumbnailUrl || reel.thumbnailUrl || "").trim();
    const vidCand = (data.videoUrl || reel.videoUrl || "").trim();
    const [stableThumb, stableVid] = await Promise.all([
      ensureReelThumbnailOnR2(reel.shortcode, thumbCand || null),
      platform === "youtube"
        ? Promise.resolve("")
        : ensureReelVideoOnR2(reel.shortcode, vidCand || null),
    ]);

    await updateCollectedReel(reelId, {
      caption: data.caption || reel.caption || null,
      viewCount: data.viewCount > 0 ? data.viewCount : reel.viewCount || 0,
      likeCount: data.likeCount > 0 ? data.likeCount : reel.likeCount || 0,
      commentCount: data.commentCount > 0 ? data.commentCount : reel.commentCount || 0,
      thumbnailUrl: stableThumb.trim() ? stableThumb : reel.thumbnailUrl,
      videoUrl: stableVid.trim()
        ? stableVid
        : platform === "youtube"
          ? reel.videoUrl
          : reel.videoUrl,
      duration: data.duration || reel.duration || null,
      postedAt: data.postedAt || reel.postedAt || null,
      ownerUsername: data.ownerUsername || reel.ownerUsername || null,
      ownerFullName: data.ownerFullName || reel.ownerFullName || null,
      ownerProfilePicUrl: data.ownerProfilePicUrl || reel.ownerProfilePicUrl || null,
      ownerFollowerCount:
        data.ownerFollowerCount > 0 ? data.ownerFollowerCount : reel.ownerFollowerCount || 0,
      fetchProvider: outcome.provider,
    });
  } catch (err) {
    console.error(`[collectedReelWorker] refresh ${reelId}:`, err);
  }
}

export function enqueueCollectedReelRefresh(reelId: number): void {
  void processCollectedReelRefresh(reelId);
}

export async function sweepCollectedReelIngestQueue(batchSize = 8): Promise<number> {
  const due = await listCollectedReelsDueForIngest(batchSize);
  for (const row of due) {
    enqueueCollectedReelIngest(row.id);
  }
  return due.length;
}

export function startCollectedReelIngestSweeper(): void {
  const INTERVAL_MS = 90_000;
  setInterval(() => {
    sweepCollectedReelIngestQueue().catch((e) =>
      console.error("[collectedReelSweeper]", e)
    );
  }, INTERVAL_MS);
  void sweepCollectedReelIngestQueue();
}
