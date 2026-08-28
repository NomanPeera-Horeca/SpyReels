/**
 * Ensure a shared `reels` row for Viral Posts IG/TikTok playback.
 * Cheap DB insert only; video R2 mirroring is fire-and-forget (like thumbnails).
 */
import { eq } from "drizzle-orm";
import {
  reels as reelsTable,
  viralPostCandidates,
  type ViralPostCandidate,
} from "../../drizzle/schema";
import { getDb, getReelById } from "../db";
import { isDurableReelVideoUrl, scheduleReelVideoMirror } from "../reelVideoR2";

/**
 * Idempotent: returns existing mirroredReelId when already linked.
 * YouTube returns null (no inline play).
 */
export async function ensureViralMirrorReel(
  candidate: ViralPostCandidate,
  workspaceId: string
): Promise<number | null> {
  const platform = (candidate.platform || "instagram").toLowerCase();
  if (platform === "youtube") return null;

  if (candidate.mirroredReelId != null && candidate.mirroredReelId > 0) {
    const existing = await getReelById(candidate.mirroredReelId);
    if (existing) {
      scheduleBackgroundVideoMirror(existing.id, candidate);
      return existing.id;
    }
  }

  const db = await getDb();
  if (!db) return null;

  const shortcode = (candidate.sourceId || "").trim();
  if (!shortcode) return null;

  const reelUrl = (candidate.sourceUrl || "").trim() || `https://www.instagram.com/reel/${shortcode}/`;
  const videoUrl = (candidate.videoUrl || "").trim() || "";
  const thumb = (candidate.thumbnailUrl || candidate.sourceThumbnailUrl || "").trim() || "";

  const result = await db.insert(reelsTable).values({
    jobId: 0,
    workspaceId,
    shortcode,
    caption: candidate.caption || "",
    viewCount: candidate.views || 0,
    likeCount: candidate.likes || 0,
    commentCount: candidate.comments || 0,
    thumbnailUrl: thumb,
    videoUrl,
    reelUrl,
    duration: 0,
    postedAt: candidate.publishedAt || new Date(),
    ownerUsername: (candidate.creatorHandle || candidate.creatorName || "")
      .replace(/^@/, "")
      .slice(0, 128),
  });
  const reelId = result[0].insertId;

  await db
    .update(viralPostCandidates)
    .set({ mirroredReelId: reelId, refreshedAt: new Date() })
    .where(eq(viralPostCandidates.id, candidate.id));

  scheduleBackgroundVideoMirror(reelId, candidate);
  return reelId;
}

function scheduleBackgroundVideoMirror(
  reelId: number,
  candidate: Pick<ViralPostCandidate, "sourceId" | "videoUrl" | "platform">
): void {
  const src = (candidate.videoUrl || "").trim();
  if (!src) return;
  if (isDurableReelVideoUrl(src)) return;
  const shortcode = (candidate.sourceId || "").trim();
  if (!shortcode) return;
  scheduleReelVideoMirror(reelId, shortcode, src);
}

/**
 * Ensure mirrors for a batch of daily-feed candidates. Mutates rows in place
 * with mirroredReelId when created. Never throws to the feed critical path.
 */
export async function ensureViralMirrorReelsForFeed(args: {
  candidates: ViralPostCandidate[];
  workspaceId: string;
}): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (const candidate of args.candidates) {
    try {
      const reelId = await ensureViralMirrorReel(candidate, args.workspaceId);
      if (reelId != null) {
        candidate.mirroredReelId = reelId;
        out.set(candidate.id, reelId);
      }
    } catch (err) {
      console.error("[viralPosts.mirror] ensure_failed", {
        candidateId: candidate.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

/** True when this reel id is linked from a viral_post_candidates row. */
export async function isViralMirroredReelId(reelId: number): Promise<boolean> {
  const db = await getDb();
  if (!db || !Number.isFinite(reelId)) return false;
  const [row] = await db
    .select({ id: viralPostCandidates.id })
    .from(viralPostCandidates)
    .where(eq(viralPostCandidates.mirroredReelId, reelId))
    .limit(1);
  return Boolean(row);
}
