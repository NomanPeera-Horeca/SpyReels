import { eq, sql } from "drizzle-orm";
import { viralPostCandidates } from "../../drizzle/schema";
import { getDb } from "../db";
import { getPersonalWorkspaceId } from "../personalWorkspace";

/**
 * Bridge Viral Posts into the existing global saved_reels library.
 *
 * New Viral saves use the real external identity (platform + sourceId),
 * not the internal viral_post_candidates id. When an IG/TikTok candidate
 * has a mirrored reels row, we also keep reelId/jobId populated so the
 * existing Saved Reels UI can render it without a separate migration.
 *
 * We intentionally do not bulk-backfill historical saves. If a matching
 * legacy saved_reels row is touched again, it is upgraded lazily here.
 */
export async function saveViralCandidateCanonical(
  userId: number,
  candidateId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [candidate] = await db
    .select({
      platform: viralPostCandidates.platform,
      sourceId: viralPostCandidates.sourceId,
      mirroredReelId: viralPostCandidates.mirroredReelId,
    })
    .from(viralPostCandidates)
    .where(eq(viralPostCandidates.id, candidateId))
    .limit(1);

  if (!candidate) throw new Error("Viral post candidate not found");

  const workspaceId = await getPersonalWorkspaceId(userId);
  const platform = (candidate.platform || "instagram").trim().toLowerCase();
  const sourceId = candidate.sourceId.trim();
  const mirroredReelId = candidate.mirroredReelId ?? null;

  if (!sourceId) throw new Error("Viral post candidate has no source id");

  // Cheap lazy upgrade: if this mirrored reel was previously saved through
  // the older reelId-only path, attach its canonical identity now.
  if (mirroredReelId != null && mirroredReelId > 0) {
    await db.execute(sql`
      UPDATE saved_reels
      SET platform = ${platform}, sourceId = ${sourceId}
      WHERE workspaceId = ${workspaceId}
        AND userId = ${userId}
        AND reelId = ${mirroredReelId}
        AND (platform IS NULL OR sourceId IS NULL)
    `);
  }

  // INSERT IGNORE keeps this idempotent against the existing reelId unique
  // key while the canonical unique key is intentionally not enforced yet.
  await db.execute(sql`
    INSERT IGNORE INTO saved_reels
      (userId, workspaceId, reelId, jobId, featuredReelId, tiktokVideoId, youtubeVideoId, platform, sourceId, createdAt)
    SELECT
      ${userId},
      ${workspaceId},
      ${mirroredReelId},
      ${mirroredReelId != null && mirroredReelId > 0 ? 0 : null},
      NULL,
      NULL,
      NULL,
      ${platform},
      ${sourceId},
      NOW()
    WHERE NOT EXISTS (
      SELECT 1
      FROM saved_reels
      WHERE workspaceId = ${workspaceId}
        AND userId = ${userId}
        AND platform = ${platform}
        AND sourceId = ${sourceId}
    )
  `);
}

export async function unsaveViralCandidateCanonical(
  userId: number,
  candidateId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [candidate] = await db
    .select({
      platform: viralPostCandidates.platform,
      sourceId: viralPostCandidates.sourceId,
      mirroredReelId: viralPostCandidates.mirroredReelId,
    })
    .from(viralPostCandidates)
    .where(eq(viralPostCandidates.id, candidateId))
    .limit(1);

  if (!candidate) return;

  const workspaceId = await getPersonalWorkspaceId(userId);
  const platform = (candidate.platform || "instagram").trim().toLowerCase();
  const sourceId = candidate.sourceId.trim();
  const mirroredReelId = candidate.mirroredReelId ?? null;

  if (mirroredReelId != null && mirroredReelId > 0) {
    await db.execute(sql`
      DELETE FROM saved_reels
      WHERE workspaceId = ${workspaceId}
        AND userId = ${userId}
        AND (
          (platform = ${platform} AND sourceId = ${sourceId})
          OR reelId = ${mirroredReelId}
        )
    `);
    return;
  }

  await db.execute(sql`
    DELETE FROM saved_reels
    WHERE workspaceId = ${workspaceId}
      AND userId = ${userId}
      AND platform = ${platform}
      AND sourceId = ${sourceId}
  `);
}
