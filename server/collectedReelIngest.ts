/**
 * Shared logic for adding collected reels (Telegram, URL paste, etc.).
 * Failed or stuck pending rows can be re-fetched; only ready rows count as duplicates.
 */

import type { CollectedReel } from "../drizzle/schema";
import {
  createCollectedReel,
  getCollectedReelByShortcode,
  getDb,
  updateCollectedReel,
} from "./db";
import { getPersonalWorkspaceId } from "./personalWorkspace";
import { enqueueCollectedReelIngest } from "./collectedReelWorker";
import type { CollectedVideoPlatform } from "./socialVideoUrl";
import { collectedReels, reels as reelsTable } from "../drizzle/schema";
import { eq } from "drizzle-orm";

export type CollectedReelSource = "telegram" | "url_paste" | "extension";

export type CollectedReelIngestResult =
  | { action: "created"; id: number }
  | { action: "retried"; id: number }
  | { action: "duplicate"; id: number };

/** Only successfully fetched reels block re-adding the same shortcode. */
export function collectedReelBlocksDuplicate(existing: CollectedReel): boolean {
  return existing.status === "ready";
}

/**
 * Ensure a `reels` row exists for Saved Reels / remake (jobId 0 = collected).
 * Idempotent: returns existing transcriptionReelId when already linked.
 */
export async function ensureCollectedMirrorReel(
  reel: CollectedReel
): Promise<number> {
  if (reel.transcriptionReelId != null && reel.transcriptionReelId > 0) {
    return reel.transcriptionReelId;
  }

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const tempReelData = {
    jobId: 0,
    workspaceId: reel.workspaceId,
    shortcode: reel.shortcode,
    caption: reel.caption || "",
    viewCount: reel.viewCount || 0,
    likeCount: reel.likeCount || 0,
    commentCount: reel.commentCount || 0,
    thumbnailUrl: reel.thumbnailUrl || "",
    videoUrl: reel.videoUrl || "",
    reelUrl: reel.reelUrl,
    duration: reel.duration || 0,
    postedAt: reel.postedAt || new Date(),
    ownerUsername: reel.ownerUsername || "",
  };

  const result = await db.insert(reelsTable).values(tempReelData);
  const reelId = result[0].insertId;

  await db
    .update(collectedReels)
    .set({ transcriptionReelId: reelId })
    .where(eq(collectedReels.id, reel.id));

  return reelId;
}

export async function ingestCollectedReelByShortcode(opts: {
  userId: number;
  shortcode: string;
  reelUrl: string;
  source: CollectedReelSource;
  workspaceId?: string;
  platform?: CollectedVideoPlatform;
}): Promise<CollectedReelIngestResult> {
  const {
    userId,
    shortcode,
    reelUrl,
    source,
    platform = "instagram",
  } = opts;
  const workspaceId = opts.workspaceId ?? (await getPersonalWorkspaceId(userId));
  const existing = await getCollectedReelByShortcode(
    workspaceId,
    shortcode,
    platform
  );

  if (existing && collectedReelBlocksDuplicate(existing)) {
    return { action: "duplicate", id: existing.id };
  }

  if (existing) {
    await updateCollectedReel(existing.id, {
      status: "pending",
      errorMessage: null,
      reelUrl,
      source,
      platform,
      fetchAttempts: 0,
      nextFetchAt: null,
      lastFetchAt: null,
    });
    enqueueCollectedReelIngest(existing.id);
    return { action: "retried", id: existing.id };
  }

  const id = await createCollectedReel({
    userId,
    workspaceId,
    shortcode,
    reelUrl,
    source,
    platform,
    status: "pending",
    fetchAttempts: 0,
  });
  enqueueCollectedReelIngest(id);
  return { action: "created", id };
}

