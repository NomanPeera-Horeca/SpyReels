import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  viralPostCandidates,
  viralPostPoolBudgetDays,
  viralPostPoolCandidates,
  viralPostPools,
  type ViralPostCandidate,
  type ViralPostPool,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  buildPoolKey,
  VIRAL_POOL_DEFAULTS,
  VIRAL_SEED_POOL_PILLAR,
} from "./constants";
import type { PillarClassification } from "./pillarClassify";

function utcDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function ensurePool(args: {
  niche: string;
  pillar: string;
  platform?: string;
  language?: string;
  region?: string | null;
  priority?: number;
}): Promise<ViralPostPool> {
  const pools = await ensurePools([args]);
  return pools[0]!;
}

export async function ensurePools(
  specs: Array<{
    niche: string;
    pillar: string;
    platform?: string;
    language?: string;
    region?: string | null;
    priority?: number;
  }>
): Promise<ViralPostPool[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (specs.length === 0) return [];

  const keys = specs.map((s) =>
    buildPoolKey({
      platform: s.platform,
      niche: s.niche,
      pillar: s.pillar,
      language: s.language,
      region: s.region,
    })
  );

  const existing = await db
    .select()
    .from(viralPostPools)
    .where(inArray(viralPostPools.poolKey, keys));
  const byKey = new Map(existing.map((p) => [p.poolKey, p]));
  const missing = specs.filter((s, i) => !byKey.has(keys[i]!));

  if (missing.length > 0) {
    await db.insert(viralPostPools).values(
      missing.map((args) => {
        const platform = args.platform || "instagram";
        const isSeed =
          platform === "tiktok" ||
          platform === "youtube" ||
          args.pillar === VIRAL_SEED_POOL_PILLAR;
        return {
          poolKey: buildPoolKey({
            platform,
            niche: args.niche,
            pillar: args.pillar,
            language: args.language,
            region: args.region,
          }),
          platform,
          niche: args.niche,
          pillar: args.pillar,
          language: args.language || "en",
          region: args.region ?? null,
          priority: args.priority ?? (isSeed ? 80 : 100),
          minFreshCandidates: isSeed
            ? VIRAL_POOL_DEFAULTS.seedMinFreshCandidates
            : VIRAL_POOL_DEFAULTS.minFreshCandidates,
          dailyCallBudget: isSeed
            ? VIRAL_POOL_DEFAULTS.seedDailyCallBudget
            : VIRAL_POOL_DEFAULTS.dailyCallBudget,
        };
      })
    );
    const refreshed = await db
      .select()
      .from(viralPostPools)
      .where(inArray(viralPostPools.poolKey, keys));
    for (const row of refreshed) byKey.set(row.poolKey, row);
  }

  return keys.map((k) => {
    const row = byKey.get(k);
    if (!row) throw new Error(`Failed to ensure pool ${k}`);
    return row;
  });
}

export async function listPoolsNeedingRefresh(limit = 8): Promise<ViralPostPool[]> {
  const db = await getDb();
  if (!db) return [];
  const staleBefore = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(viralPostPools)
    .orderBy(viralPostPools.priority, viralPostPools.lastRefreshedAt)
    .limit(40);
  const out: ViralPostPool[] = [];
  for (const pool of rows) {
    if (out.length >= limit) break;
    const fresh = await countFreshPoolCandidates(pool.id);
    const stale =
      !pool.lastRefreshedAt || pool.lastRefreshedAt.getTime() < staleBefore.getTime();
    if (fresh < pool.minFreshCandidates || stale) {
      out.push(pool);
    }
  }
  return out;
}

/**
 * Short-window inventory check used only to decide whether a pool needs new
 * discovery. This deliberately stays separate from the longer recommendation
 * reservoir used by Today’s Picks.
 */
export async function countFreshPoolCandidates(
  poolId: number,
  maxAgeHours = VIRAL_POOL_DEFAULTS.freshCandidateMaxAgeHours
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  const rows = await db
    .select({ id: viralPostPoolCandidates.id })
    .from(viralPostPoolCandidates)
    .innerJoin(
      viralPostCandidates,
      eq(viralPostPoolCandidates.candidateId, viralPostCandidates.id)
    )
    .where(
      and(
        eq(viralPostPoolCandidates.poolId, poolId),
        gte(viralPostCandidates.discoveredAt, since)
      )
    );
  return rows.length;
}

export async function getBudgetUsed(poolId: number, date = utcDateString()): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db
    .select()
    .from(viralPostPoolBudgetDays)
    .where(
      and(
        eq(viralPostPoolBudgetDays.poolId, poolId),
        eq(viralPostPoolBudgetDays.budgetDate, date)
      )
    )
    .limit(1);
  return row?.scCallsUsed ?? 0;
}

export async function addBudgetUsage(
  poolId: number,
  scCalls: number,
  date = utcDateString()
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(viralPostPoolBudgetDays)
    .values({
      poolId,
      budgetDate: date,
      scCallsUsed: Math.max(0, scCalls),
      refreshRuns: 1,
    })
    .onDuplicateKeyUpdate({
      set: {
        scCallsUsed: sql`${viralPostPoolBudgetDays.scCallsUsed} + ${Math.max(0, scCalls)}`,
        refreshRuns: sql`${viralPostPoolBudgetDays.refreshRuns} + 1`,
        updatedAt: new Date(),
      },
    });
}

export async function markPoolRefreshed(args: {
  poolId: number;
  status: string;
  scCalls: number;
  candidateCount: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(viralPostPools)
    .set({
      lastRefreshedAt: new Date(),
      lastRefreshStatus: args.status,
      lastRefreshScCalls: args.scCalls,
      lastRefreshCandidateCount: args.candidateCount,
      updatedAt: new Date(),
    })
    .where(eq(viralPostPools.id, args.poolId));
}

export async function linkCandidatesToPool(args: {
  poolId: number;
  links: Array<{
    candidateId: number;
    classification: PillarClassification;
  }>;
}): Promise<void> {
  const db = await getDb();
  if (!db || args.links.length === 0) return;
  for (const link of args.links) {
    await db
      .insert(viralPostPoolCandidates)
      .values({
        poolId: args.poolId,
        candidateId: link.candidateId,
        primaryPillar: link.classification.primaryPillar,
        secondaryPillar: link.classification.secondaryPillar,
        pillarConfidence: String(link.classification.confidence),
        pillarReason: link.classification.reason,
      })
      .onDuplicateKeyUpdate({
        set: {
          primaryPillar: link.classification.primaryPillar,
          secondaryPillar: link.classification.secondaryPillar,
          pillarConfidence: String(link.classification.confidence),
          pillarReason: link.classification.reason,
        },
      });
  }
}

/**
 * Load the reusable recommendation reservoir. By default, candidates stay
 * eligible for 90 days; refresh logic still uses its own short freshness clock.
 */
export async function loadPoolCandidatesForAssembly(args: {
  poolIds: number[];
  limit?: number;
  maxAgeHours?: number;
}): Promise<
  Array<{
    candidate: ViralPostCandidate;
    primaryPillar: string;
    secondaryPillar: string | null;
    pillarConfidence: number;
    pillarReason: string | null;
  }>
> {
  const db = await getDb();
  if (!db || args.poolIds.length === 0) return [];
  const limit = args.limit ?? VIRAL_POOL_DEFAULTS.assemblyCandidateLimit;
  const since = new Date(
    Date.now() -
      (args.maxAgeHours ?? VIRAL_POOL_DEFAULTS.assemblyCandidateMaxAgeHours) *
        60 *
        60 *
        1000
  );
  const rows = await db
    .select({
      candidate: viralPostCandidates,
      primaryPillar: viralPostPoolCandidates.primaryPillar,
      secondaryPillar: viralPostPoolCandidates.secondaryPillar,
      pillarConfidence: viralPostPoolCandidates.pillarConfidence,
      pillarReason: viralPostPoolCandidates.pillarReason,
    })
    .from(viralPostPoolCandidates)
    .innerJoin(
      viralPostCandidates,
      eq(viralPostPoolCandidates.candidateId, viralPostCandidates.id)
    )
    .where(
      and(
        inArray(viralPostPoolCandidates.poolId, args.poolIds),
        gte(viralPostCandidates.discoveredAt, since)
      )
    )
    .orderBy(desc(viralPostCandidates.discoveredAt))
    .limit(limit);

  // Dedupe by candidate id (may appear in multiple pools)
  const seen = new Set<number>();
  const out: Array<{
    candidate: ViralPostCandidate;
    primaryPillar: string;
    secondaryPillar: string | null;
    pillarConfidence: number;
    pillarReason: string | null;
  }> = [];
  for (const row of rows) {
    if (seen.has(row.candidate.id)) continue;
    seen.add(row.candidate.id);
    out.push({
      candidate: row.candidate,
      primaryPillar: row.primaryPillar,
      secondaryPillar: row.secondaryPillar,
      pillarConfidence: Number(row.pillarConfidence) || 0.5,
      pillarReason: row.pillarReason,
    });
  }
  return out;
}

/**
 * Try to acquire a DB-backed refresh lease for a pool.
 * Steal allowed when lease is expired or missing.
 * Returns true only when this owner holds the lease.
 */
export async function tryAcquirePoolRefreshLock(args: {
  poolId: number;
  owner: string;
  ttlMs?: number;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const ttl = args.ttlMs ?? VIRAL_POOL_DEFAULTS.refreshLeaseTtlMs;
  const ttlSeconds = Math.max(60, Math.floor(ttl / 1000));
  const result = await db.execute(sql`
    UPDATE viral_post_pools
    SET
      refreshLeaseOwner = ${args.owner},
      refreshLeaseUntil = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ${ttlSeconds} SECOND),
      updatedAt = UTC_TIMESTAMP()
    WHERE id = ${args.poolId}
      AND (
        refreshLeaseUntil IS NULL
        OR refreshLeaseUntil < UTC_TIMESTAMP()
        OR refreshLeaseOwner = ${args.owner}
      )
  `);
  const header = result[0] as { affectedRows?: number };
  const acquired = (header?.affectedRows ?? 0) > 0;
  console.info("[viralPosts.pool] lock_acquire", {
    poolId: args.poolId,
    owner: args.owner,
    acquired,
    ttlSeconds,
  });
  return acquired;
}

export async function releasePoolRefreshLock(args: {
  poolId: number;
  owner: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`
    UPDATE viral_post_pools
    SET
      refreshLeaseOwner = NULL,
      refreshLeaseUntil = NULL,
      updatedAt = UTC_TIMESTAMP()
    WHERE id = ${args.poolId}
      AND refreshLeaseOwner = ${args.owner}
  `);
  console.info("[viralPosts.pool] lock_release", {
    poolId: args.poolId,
    owner: args.owner,
  });
}

export async function getPoolRefreshLease(poolId: number): Promise<{
  owner: string | null;
  until: Date | null;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select({
      owner: viralPostPools.refreshLeaseOwner,
      until: viralPostPools.refreshLeaseUntil,
    })
    .from(viralPostPools)
    .where(eq(viralPostPools.id, poolId))
    .limit(1);
  if (!row) return null;
  return { owner: row.owner, until: row.until };
}
