/**
 * Link existing viral_post_candidates into niche/pillar pools so feed assembly
 * can run with zero provider calls.
 *
 * Run: pnpm exec tsx scripts/viral-posts-backfill-pools.ts
 */
import "dotenv/config";
import { desc } from "drizzle-orm";
import { viralPostCandidates } from "../drizzle/schema";
import { getDb } from "../server/db";
import { DEFAULT_CONTENT_PILLARS } from "../server/viralPosts/constants";
import { classifyCandidatePillars } from "../server/viralPosts/pillarClassify";
import * as poolRepo from "../server/viralPosts/poolRepository";

const NICHE = process.env.VIRAL_POSTS_BACKFILL_NICHE || "Business & Entrepreneurship";
const LIMIT = Number(process.env.VIRAL_POSTS_BACKFILL_LIMIT) || 200;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("no db");

  const pillars = [...DEFAULT_CONTENT_PILLARS];
  const pools = [];
  for (const pillar of pillars) {
    pools.push(await poolRepo.ensurePool({ niche: NICHE, pillar }));
  }

  const candidates = await db
    .select()
    .from(viralPostCandidates)
    .orderBy(desc(viralPostCandidates.discoveredAt))
    .limit(LIMIT);

  let linked = 0;
  for (const candidate of candidates) {
    const classification = classifyCandidatePillars({
      caption: candidate.caption,
      hashtags: candidate.hashtags ?? [],
      activePillars: pillars,
      fallbackNiche: NICHE,
    });
    const primaryPool =
      pools.find((p) => p.pillar === classification.primaryPillar) || pools[0]!;
    await poolRepo.linkCandidatesToPool({
      poolId: primaryPool.id,
      links: [{ candidateId: candidate.id, classification }],
    });
    if (
      classification.secondaryPillar &&
      classification.secondaryPillar !== classification.primaryPillar
    ) {
      const secondary = pools.find(
        (p) => p.pillar === classification.secondaryPillar
      );
      if (secondary) {
        await poolRepo.linkCandidatesToPool({
          poolId: secondary.id,
          links: [{ candidateId: candidate.id, classification }],
        });
      }
    }
    linked += 1;
  }

  for (const pool of pools) {
    const fresh = await poolRepo.countFreshPoolCandidates(pool.id);
    await poolRepo.markPoolRefreshed({
      poolId: pool.id,
      status: "backfill",
      scCalls: 0,
      candidateCount: fresh,
    });
    console.log(
      JSON.stringify({
        poolKey: pool.poolKey,
        fresh,
      })
    );
  }

  console.log(JSON.stringify({ niche: NICHE, candidates: candidates.length, linked }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
