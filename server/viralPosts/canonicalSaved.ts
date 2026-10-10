import { and, desc, eq, sql } from "drizzle-orm";
import { reels, viralPostCandidates } from "../../drizzle/schema";
import { getDb } from "../db";
import { getPersonalWorkspaceId } from "../personalWorkspace";
import {
  planCanonicalLibrarySave,
  type CanonicalSavedRow,
} from "./canonicalLibrarySavePlan";

/**
 * Bridge Viral Posts into the existing global saved_reels library.
 *
 * New Viral saves use the real external identity (platform + sourceId),
 * not the internal viral_post_candidates id. When an IG/TikTok candidate
 * has a mirror in THIS workspace, we also keep reelId/jobId populated so the
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

  if (!sourceId) throw new Error("Viral post candidate has no source id");

  const mirroredReelId = await resolveWorkspaceMirrorId({
    workspaceId,
    platform,
    sourceId,
    hintedReelId: candidate.mirroredReelId,
  });

  const existing = await loadCanonicalLibraryRows({
    workspaceId,
    userId,
    platform,
    sourceId,
    mirroredReelId,
  });

  if (existing.kind === "missing-columns") {
    await insertLegacyMirrorSave({
      userId,
      workspaceId,
      mirroredReelId,
    });
    return;
  }

  const plan = planCanonicalLibrarySave({
    rows: existing.rows,
    platform,
    sourceId,
    mirroredReelId,
  });

  if (plan.type === "noop") return;

  if (plan.type === "stamp-identity") {
    await db.execute(sql`
      UPDATE saved_reels
      SET platform = ${platform}, sourceId = ${sourceId}
      WHERE id = ${plan.id}
        AND workspaceId = ${workspaceId}
        AND userId = ${userId}
    `);
    return;
  }

  if (plan.type === "attach-reel") {
    await db.execute(sql`
      UPDATE saved_reels
      SET reelId = ${plan.reelId}, jobId = 0
      WHERE id = ${plan.id}
        AND workspaceId = ${workspaceId}
        AND userId = ${userId}
        AND reelId IS NULL
    `);
    return;
  }

  if (plan.type === "merge") {
    // Delete the identity-only row first so stamping the mirrored row cannot
    // collide with uniq(workspace, user, platform, sourceId) if it exists.
    await db.execute(sql`
      DELETE FROM saved_reels
      WHERE id = ${plan.deleteId}
        AND workspaceId = ${workspaceId}
        AND userId = ${userId}
    `);
    await db.execute(sql`
      UPDATE saved_reels
      SET platform = ${platform}, sourceId = ${sourceId}
      WHERE id = ${plan.keepId}
        AND workspaceId = ${workspaceId}
        AND userId = ${userId}
    `);
    return;
  }

  await db.execute(sql`
    INSERT IGNORE INTO saved_reels
      (userId, workspaceId, reelId, jobId, featuredReelId, tiktokVideoId, youtubeVideoId, platform, sourceId, createdAt)
    VALUES (
      ${userId},
      ${workspaceId},
      ${plan.reelId},
      ${plan.reelId != null ? 0 : null},
      NULL,
      NULL,
      NULL,
      ${platform},
      ${sourceId},
      NOW()
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
    })
    .from(viralPostCandidates)
    .where(eq(viralPostCandidates.id, candidateId))
    .limit(1);

  if (!candidate) return;

  const workspaceId = await getPersonalWorkspaceId(userId);
  const platform = (candidate.platform || "instagram").trim().toLowerCase();
  const sourceId = candidate.sourceId.trim();
  if (!sourceId) return;

  try {
    // Only remove rows that carry this canonical identity. Never delete a
    // workspace reel save that the user collected independently.
    await db.execute(sql`
      DELETE FROM saved_reels
      WHERE workspaceId = ${workspaceId}
        AND userId = ${userId}
        AND platform = ${platform}
        AND sourceId = ${sourceId}
    `);
  } catch (err) {
    if (isMissingCanonicalIdentityColumn(err)) return;
    throw err;
  }
}

async function loadCanonicalLibraryRows(args: {
  workspaceId: string;
  userId: number;
  platform: string;
  sourceId: string;
  mirroredReelId: number | null;
}): Promise<
  { kind: "ready"; rows: CanonicalSavedRow[] } | { kind: "missing-columns" }
> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const result = await db.execute(sql`
      SELECT id, reelId, platform, sourceId
      FROM saved_reels
      WHERE workspaceId = ${args.workspaceId}
        AND userId = ${args.userId}
        AND (
          (platform = ${args.platform} AND sourceId = ${args.sourceId})
          OR (${args.mirroredReelId} IS NOT NULL AND reelId = ${args.mirroredReelId})
        )
    `);
    const raw = result[0] as unknown;
    const rows = Array.isArray(raw) ? (raw as CanonicalSavedRow[]) : [];
    return {
      kind: "ready",
      rows,
    };
  } catch (err) {
    if (isMissingCanonicalIdentityColumn(err)) {
      return { kind: "missing-columns" };
    }
    throw err;
  }
}

async function insertLegacyMirrorSave(args: {
  userId: number;
  workspaceId: string;
  mirroredReelId: number | null;
}): Promise<void> {
  if (args.mirroredReelId == null || args.mirroredReelId <= 0) return;
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.execute(sql`
    INSERT IGNORE INTO saved_reels
      (userId, workspaceId, reelId, jobId, createdAt)
    VALUES (
      ${args.userId},
      ${args.workspaceId},
      ${args.mirroredReelId},
      0,
      NOW()
    )
  `);
}

function isMissingCanonicalIdentityColumn(err: unknown): boolean {
  const message = [
    err instanceof Error ? err.message : "",
    err instanceof Error && err.cause instanceof Error ? err.cause.message : "",
  ]
    .join(" ")
    .toLowerCase();
  return (
    message.includes("unknown column") &&
    (message.includes("platform") || message.includes("sourceid"))
  );
}

/**
 * Resolve a mirror only inside the caller's workspace. A global candidate's
 * mirroredReelId is a cache hint and may point to another workspace.
 */
async function resolveWorkspaceMirrorId(args: {
  workspaceId: string;
  platform: string;
  sourceId: string;
  hintedReelId: number | null;
}): Promise<number | null> {
  if (args.platform === "youtube") return null;
  const db = await getDb();
  if (!db) return null;

  if (args.hintedReelId != null && args.hintedReelId > 0) {
    const [hinted] = await db
      .select({ id: reels.id })
      .from(reels)
      .where(
        and(
          eq(reels.id, args.hintedReelId),
          eq(reels.workspaceId, args.workspaceId)
        )
      )
      .limit(1);
    if (hinted) return hinted.id;
  }

  const [local] = await db
    .select({ id: reels.id })
    .from(reels)
    .where(
      and(
        eq(reels.workspaceId, args.workspaceId),
        eq(reels.jobId, 0),
        eq(reels.shortcode, args.sourceId)
      )
    )
    .orderBy(desc(reels.id))
    .limit(1);
  return local?.id ?? null;
}
