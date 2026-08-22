/**
 * Prove DB lease: only one owner refreshes; expired leases are stealable.
 * Run: pnpm exec tsx scripts/viral-posts-pool-lock-smoke.ts
 */
import "dotenv/config";
import * as poolRepo from "../server/viralPosts/poolRepository";

async function main() {
  const pool = await poolRepo.ensurePool({
    niche: "Lock Smoke Niche",
    pillar: "lock smoke pillar",
  });

  // Clear any prior lease
  await poolRepo.releasePoolRefreshLock({
    poolId: pool.id,
    owner: "cleanup",
  });
  // Force clear regardless of owner
  const { getDb } = await import("../server/db");
  const { sql } = await import("drizzle-orm");
  const db = await getDb();
  await db!.execute(sql`
    UPDATE viral_post_pools
    SET refreshLeaseOwner = NULL, refreshLeaseUntil = NULL
    WHERE id = ${pool.id}
  `);

  const a = await poolRepo.tryAcquirePoolRefreshLock({
    poolId: pool.id,
    owner: "worker-a",
    ttlMs: 60_000,
  });
  const b = await poolRepo.tryAcquirePoolRefreshLock({
    poolId: pool.id,
    owner: "worker-b",
    ttlMs: 60_000,
  });
  const sameOwner = await poolRepo.tryAcquirePoolRefreshLock({
    poolId: pool.id,
    owner: "worker-a",
    ttlMs: 60_000,
  });

  // Expire lease and steal
  await db!.execute(sql`
    UPDATE viral_post_pools
    SET refreshLeaseUntil = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)
    WHERE id = ${pool.id}
  `);
  const steal = await poolRepo.tryAcquirePoolRefreshLock({
    poolId: pool.id,
    owner: "worker-c",
    ttlMs: 60_000,
  });

  await poolRepo.releasePoolRefreshLock({
    poolId: pool.id,
    owner: "worker-c",
  });
  const afterRelease = await poolRepo.tryAcquirePoolRefreshLock({
    poolId: pool.id,
    owner: "worker-d",
    ttlMs: 60_000,
  });
  await poolRepo.releasePoolRefreshLock({
    poolId: pool.id,
    owner: "worker-d",
  });

  const report = {
    poolId: pool.id,
    firstAcquire: a,
    secondAcquireWhileHeld: b,
    sameOwnerReacquire: sameOwner,
    stealAfterExpiry: steal,
    acquireAfterRelease: afterRelease,
    pass: a === true && b === false && sameOwner === true && steal === true && afterRelease === true,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error("[pool-lock] FAIL");
    process.exit(1);
  }
  console.log("[pool-lock] PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
