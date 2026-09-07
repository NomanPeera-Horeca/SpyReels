/**
 * Ensure a workspace-local `reels` row for Viral Posts IG/TikTok playback.
 * The canonical Viral candidate is global; its mirroredReelId is therefore a
 * cache hint only and must never be trusted across workspace boundaries.
 */
import { and, desc, eq } from "drizzle-orm";
import {
  reels as reelsTable,
  viralPostCandidates,
  type ViralPostCandidate,
} from "../../drizzle/schema";
import { getDb, getReelById } from "../db";
import { isDurableReelVideoUrl, scheduleReelVideoMirror } from "../reelVideoR2";

/**
 * Idempotent per workspace. YouTube returns null (no inline play).
 * Existing Collected/jobId=0 mirrors are reused when they match the same
 * workspace + canonical external id.
 */
export async function ensureViralMirrorReel(
  candidate: ViralPostCandidate,
  workspaceId: string
): Promise<number | null> {
  const platform = (candidate.platform || "instagram").toLowerCase();
  if (platform === "youtube") return null;

  const shortcode = (candidate.sourceId || "").trim();
  if (!shortcode) return null;

  // A global candidate may currently point at another user's workspace mirror.
  // Reuse the hint only when ownership matches the requesting workspace.
  if (candidate.mirroredReelId != null && candidate.mirroredReelId > 0) {
    const hinted = await getReelById(candidate.mirroredReelId);
    if (hinted && hinted.workspaceId === workspaceId) {
      scheduleBackgroundVideoMirror(hinted.id, candidate);
      return hinted.id;
    }
  }

  const db = await getDb();
  if (!db) return null;

  // Before creating anything, reuse a workspace-local jobId=0 mirror. This also
  // lets a reel already present in Collected remain the same local reel instead
  // of creating a second copy just because Viral Posts recommended it.
  const [local] = await db
    .select()
    .from(reelsTable)
    .where(
      and(
        eq(reelsTable.workspaceId, workspaceId),
        eq(reelsTable.jobId, 0),
        eq(reelsTable.shortcode, shortcode)
      )
    )
    .orderBy(desc(reelsTable.id))
    .limit(1);

  if (local) {
    await db
      .update(viralPostCandidates)
      .set({ mirroredReelId: local.id, refreshedAt: new Date() })
      .where(eq(viralPostCandidates.id, candidate.id));
    candidate.mirroredReelId = local.id;
    scheduleBackgroundVideoMirror(local.id, candidate);
    return local.id;
  }

  const reelUrl =
    (candidate.sourceUrl || "").trim() ||
    `https://www.instagram.com/reel/${shortcode}/`;
  const videoUrl = (candidate.videoUrl || "").trim() || "";
  const thumb =
    (candidate.thumbnailUrl || candidate.sourceThumbnailUrl || "").trim() || "";

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

  // This remains a global cache hint, not an ownership source of truth. Every
  // caller re-validates workspace ownership before reusing it.
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
 * with the requesting workspace's mirroredReelId. Never throws to the feed
 * critical path.
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
