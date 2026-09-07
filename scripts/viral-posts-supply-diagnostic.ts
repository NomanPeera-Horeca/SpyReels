/**
 * Read-only Viral Posts supply diagnostic for a user.
 *
 * Usage:
 *   VIRAL_POSTS_DIAG_USER_ID=123 pnpm exec tsx scripts/viral-posts-supply-diagnostic.ts
 *
 * Prints pool / candidate / eligibility / selection counts for Instagram + TikTok.
 * Makes no production writes.
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  viralPostCandidates,
  viralPostPoolCandidates,
  viralPostPools,
} from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  DEFAULT_CONTENT_PILLARS,
  VIRAL_POOL_DEFAULTS,
} from "../server/viralPosts/constants";
import { isViralPostsV1Platform } from "../shared/viralPosts";
import { DAILY_PICK_MIN_FINAL_SCORE, selectDiverseFeed } from "../server/viralPosts/diversity";
import { scoreCandidate } from "../server/viralPosts/scoring";
import { adaptabilityScoreForCandidate } from "../server/viralPosts/candidateAdapter";

async function main() {
  const userId = Number(process.env.VIRAL_POSTS_DIAG_USER_ID || "");
  if (!Number.isInteger(userId) || userId <= 0) {
    console.error("Set VIRAL_POSTS_DIAG_USER_ID to a positive integer.");
    process.exit(1);
  }

  const db = await getDb();
  if (!db) {
    console.error("Database not available.");
    process.exit(1);
  }

  const pools = await db.select().from(viralPostPools);
  const v1Pools = pools.filter((p) => isViralPostsV1Platform(p.platform));
  const igPools = v1Pools.filter((p) => p.platform === "instagram");
  const ttPools = v1Pools.filter((p) => p.platform === "tiktok");

  console.log("=== Pools ===");
  console.log(`Instagram pool count: ${igPools.length}`);
  console.log(`TikTok pool count: ${ttPools.length}`);
  console.log(`YouTube pool count (historical, not V1): ${pools.filter((p) => p.platform === "youtube").length}`);

  const poolIds = v1Pools.map((p) => p.id);
  if (poolIds.length === 0) {
    console.log("No V1 pools found. Stop.");
    return;
  }

  const links = await db
    .select({
      poolId: viralPostPoolCandidates.poolId,
      candidateId: viralPostPoolCandidates.candidateId,
      platform: viralPostCandidates.platform,
      sourceId: viralPostCandidates.sourceId,
      creatorId: viralPostCandidates.creatorId,
      creatorHandle: viralPostCandidates.creatorHandle,
      views: viralPostCandidates.views,
      trendStatus: viralPostCandidates.trendStatus,
      publishedAt: viralPostCandidates.publishedAt,
      likes: viralPostCandidates.likes,
      comments: viralPostCandidates.comments,
      shares: viralPostCandidates.shares,
      saves: viralPostCandidates.saves,
      creatorFollowers: viralPostCandidates.creatorFollowers,
      caption: viralPostCandidates.caption,
    })
    .from(viralPostPoolCandidates)
    .innerJoin(
      viralPostCandidates,
      eq(viralPostPoolCandidates.candidateId, viralPostCandidates.id)
    )
    .where(inArray(viralPostPoolCandidates.poolId, poolIds))
    .limit(VIRAL_POOL_DEFAULTS.assemblyCandidateLimit);

  const byPlatform = {
    instagram: links.filter((r) => r.platform === "instagram"),
    tiktok: links.filter((r) => r.platform === "tiktok"),
    youtube: links.filter((r) => r.platform === "youtube"),
  };

  console.log("\n=== Candidates loaded from V1 pools ===");
  console.log(`Instagram: ${byPlatform.instagram.length}`);
  console.log(`TikTok: ${byPlatform.tiktok.length}`);
  console.log(`YouTube leak into V1 pool links: ${byPlatform.youtube.length}`);

  const uniqueBySource = new Map<string, (typeof links)[number]>();
  for (const row of links) {
    if (!isViralPostsV1Platform(row.platform)) continue;
    const key = `${row.platform}:${row.sourceId}`;
    if (!uniqueBySource.has(key)) uniqueBySource.set(key, row);
  }
  const unique = [...uniqueBySource.values()];

  const scoreInputs = unique.map((row) => ({
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    saves: row.saves,
    creatorFollowers: row.creatorFollowers,
    publishedAt: row.publishedAt,
    relevanceScore: 50,
    adaptabilityScore: 50,
  }));

  const scored = unique.map((row, i) => {
    const scoredRow = scoreCandidate(scoreInputs[i]!, scoreInputs);
    const creatorKey = (
      row.creatorId ||
      row.creatorHandle ||
      `candidate:${row.candidateId}`
    )
      .toLowerCase()
      .replace(/^@/, "");
    return {
      candidateId: row.candidateId,
      sourceId: row.sourceId,
      creatorKey,
      platform: row.platform || "instagram",
      contentPillar: DEFAULT_CONTENT_PILLARS[0] || "general",
      finalScore: scoredRow.finalScore,
      caption: row.caption,
      hook: (row.caption || "").slice(0, 80),
      views: row.views ?? 0,
      trendStatus: row.trendStatus,
    };
  });

  const afterQuality = scored.filter((s) => s.finalScore >= DAILY_PICK_MIN_FINAL_SCORE);
  const rejectedQuality = scored.length - afterQuality.length;

  const selected = selectDiverseFeed(afterQuality, {
    min: 4,
    max: 7,
    minFinalScore: DAILY_PICK_MIN_FINAL_SCORE,
  });

  const rejectedDup =
    afterQuality.length -
    new Set(selected.map((s) => s.candidateId)).size -
    (afterQuality.length - selected.length > 0
      ? Math.max(0, afterQuality.length - selected.length)
      : 0);

  const igEligible = afterQuality.filter((s) => s.platform === "instagram");
  const ttEligible = afterQuality.filter((s) => s.platform === "tiktok");
  const igSelected = selected.filter((s) => s.platform === "instagram");
  const ttSelected = selected.filter((s) => s.platform === "tiktok");

  const views = selected.map((s) => s.views).filter((v) => v > 0);
  console.log("\n=== After eligibility/quality (score >= floor) ===");
  console.log(`Instagram: ${igEligible.length}`);
  console.log(`TikTok: ${ttEligible.length}`);
  console.log(`Rejected by quality floor: ${rejectedQuality}`);

  console.log("\n=== Final selected (diversity pass) ===");
  console.log(`Instagram: ${igSelected.length}`);
  console.log(`TikTok: ${ttSelected.length}`);
  console.log(`Unique creators: ${new Set(selected.map((s) => s.creatorKey)).size}`);
  console.log(
    `Views selected: min=${views.length ? Math.min(...views) : "n/a"} max=${
      views.length ? Math.max(...views) : "n/a"
    }`
  );
  console.log(
    `Approx creator-dup / unused after quality: ${Math.max(
      0,
      afterQuality.length - selected.length
    )} (includes soft diversity skips)`
  );
  console.log(`User id diagnosed: ${userId}`);
  void adaptabilityScoreForCandidate;
  void and;
  void eq;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
