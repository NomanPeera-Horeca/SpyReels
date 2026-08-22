/**
 * Isolated Viral Posts DB write path (no discovery / ScrapeCreators).
 * Run: pnpm exec tsx scripts/viral-posts-db-isolate.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import * as repo from "../server/viralPosts/repository";
import type { AdaptedCandidate } from "../server/viralPosts/candidateAdapter";

const QUERY_TIMEOUT_MS = 15_000;

function redactDatabaseUrl(raw: string | undefined): string {
  if (!raw) return "(missing)";
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.username ? "***@" : ""}${u.host}${u.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function withTimeout<T>(
  label: string,
  ms: number,
  fn: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  console.log(`[db-isolate] BEFORE ${label}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      fn().then((value) => ({ ok: true as const, value })),
      new Promise<{ ok: false; error: Error }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              ok: false,
              error: new Error(`TIMEOUT after ${ms}ms: ${label}`),
            }),
          ms
        );
      }),
    ]);
    if (!result.ok) throw result.error;
    console.log(`[db-isolate] AFTER  ${label} (${Date.now() - started}ms)`);
    return result.value;
  } catch (err) {
    const cause =
      err && typeof err === "object" && "cause" in err
        ? (err as { cause?: unknown }).cause
        : undefined;
    console.error(`[db-isolate] FAIL   ${label} (${Date.now() - started}ms)`);
    console.error(`[db-isolate] error:`, err);
    if (cause) console.error(`[db-isolate] cause:`, cause);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function syntheticCandidate(sourceId: string): AdaptedCandidate {
  return {
    platform: "instagram",
    sourceId,
    sourceUrl: `https://www.instagram.com/reel/${sourceId}/`,
    creatorId: "db_isolate_creator",
    creatorName: "DB Isolate Creator",
    creatorHandle: "@db_isolate_creator",
    creatorAvatarUrl: null,
    creatorFollowers: 1200,
    thumbnailUrl: "https://example.com/thumb.jpg",
    videoUrl: null,
    caption: "Synthetic candidate for Viral Posts DB isolation",
    transcript: null,
    hashtags: ["restaurant", "isolate"],
    publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
    views: 42_000,
    likes: 2_100,
    comments: 90,
    shares: null,
    saves: null,
    reachMultiplier: 35,
    engagementRate: 0.052,
    viewsPerHour: 7000,
    trendStatus: "rising-fast",
    relevanceHint: 80,
    contentPillar: "restaurant",
    relevanceLabel: "Matches restaurant",
    relevanceReason: "Synthetic isolation row",
    hook: "Synthetic candidate for Viral Posts DB isolation",
    format: "talking-head",
    hashtagKey: "restaurant",
    rawProviderPayload: { synthetic: true, sourceId },
  };
}

async function main() {
  const userId = 9;
  const testLocalDate = `2099-08-${String((Date.now() % 27) + 1).padStart(2, "0")}`;
  const sourceId = `dbiso_${Date.now()}`;

  console.log("[db-isolate] DATABASE_URL", redactDatabaseUrl(process.env.DATABASE_URL));
  console.log("[db-isolate] userId", userId, "localDate", testLocalDate, "sourceId", sourceId);

  const db = await withTimeout("getDb()", QUERY_TIMEOUT_MS, () => getDb());
  if (!db) throw new Error("getDb() returned null");

  const tables = await withTimeout("list viral_post tables", QUERY_TIMEOUT_MS, () =>
    db.execute(sql`
      SELECT TABLE_NAME
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME LIKE 'viral_post%'
      ORDER BY TABLE_NAME
    `)
  );
  console.log("[db-isolate] tables", JSON.stringify(tables[0]));

  const grants = await withTimeout("SHOW GRANTS", QUERY_TIMEOUT_MS, () =>
    db.execute(sql`SHOW GRANTS`)
  );
  console.log("[db-isolate] grants", JSON.stringify(grants[0]));

  const insertPerm = await withTimeout("permission probe INSERT/SELECT", QUERY_TIMEOUT_MS, async () => {
    await db.execute(sql`
      INSERT INTO viral_post_candidates
        (platform, sourceId, sourceUrl, creatorName, trendStatus, hashtags, rawProviderPayload)
      VALUES
        ('instagram', ${`${sourceId}_probe`}, ${`https://www.instagram.com/reel/${sourceId}_probe/`},
         'Probe', 'unknown', ${JSON.stringify(["probe"])}, ${JSON.stringify({ probe: true })})
    `);
    const rows = await db.execute(sql`
      SELECT id, sourceId FROM viral_post_candidates WHERE sourceId = ${`${sourceId}_probe`} LIMIT 1
    `);
    await db.execute(sql`
      DELETE FROM viral_post_candidates WHERE sourceId = ${`${sourceId}_probe`}
    `);
    return rows[0];
  });
  console.log("[db-isolate] permission probe ok", JSON.stringify(insertPerm));

  const upserted = await withTimeout(
    "repo.upsertCandidates(insert)",
    QUERY_TIMEOUT_MS,
    () => repo.upsertCandidates([syntheticCandidate(sourceId)])
  );
  if (upserted.length !== 1) {
    throw new Error(`Expected 1 upserted candidate, got ${upserted.length}`);
  }
  console.log("[db-isolate] upserted id", upserted[0].id, "sourceId", upserted[0].sourceId);

  const readBack = await withTimeout("repo.getCandidateById", QUERY_TIMEOUT_MS, () =>
    repo.getCandidateById(upserted[0].id)
  );
  if (!readBack || readBack.sourceId !== sourceId) {
    throw new Error("Read-back failed for synthetic candidate");
  }
  console.log("[db-isolate] read-back ok", {
    id: readBack.id,
    views: readBack.views,
    hashtags: readBack.hashtags,
  });

  const upsertedAgain = await withTimeout(
    "repo.upsertCandidates(update)",
    QUERY_TIMEOUT_MS,
    () =>
      repo.upsertCandidates([
        {
          ...syntheticCandidate(sourceId),
          views: 99_999,
          caption: "Updated synthetic candidate",
        },
      ])
  );
  if (upsertedAgain[0]?.views !== 99_999) {
    throw new Error(
      `Upsert update failed; views=${upsertedAgain[0]?.views ?? "missing"}`
    );
  }
  console.log("[db-isolate] upsert update ok", upsertedAgain[0].id, upsertedAgain[0].views);

  const feed = await withTimeout("repo.createDailyFeed", QUERY_TIMEOUT_MS, () =>
    repo.createDailyFeed({
      userId,
      localDate: testLocalDate,
      timezone: "America/Chicago",
      status: "ready",
      generationReason: "db_isolate",
      scCallCount: 0,
      costEstimateUsd: 0,
    })
  );
  console.log("[db-isolate] feed created", feed.id, feed.localDate);

  await withTimeout("repo.insertFeedItems", QUERY_TIMEOUT_MS, () =>
    repo.insertFeedItems([
      {
        feedId: feed.id,
        candidateId: upserted[0].id,
        rank: 1,
        contentPillar: "restaurant",
        relevanceScore: 80,
        relevanceLabel: "Matches restaurant",
        relevanceReason: "Synthetic isolation row",
        adaptabilityScore: 70,
        finalScore: 0.82,
      },
    ])
  );

  const items = await withTimeout(
    "repo.getFeedItemsWithCandidates",
    QUERY_TIMEOUT_MS,
    () => repo.getFeedItemsWithCandidates(feed.id)
  );
  if (items.length !== 1 || items[0].candidate.sourceId !== sourceId) {
    throw new Error(`Expected 1 feed item, got ${items.length}`);
  }
  console.log("[db-isolate] feed read-back ok", {
    feedId: feed.id,
    candidateId: items[0].candidate.id,
    rank: items[0].item.rank,
  });

  // Cleanup isolation rows so we do not pollute user 9 production-ish feeds forever
  await withTimeout("cleanup", QUERY_TIMEOUT_MS, async () => {
    await db.execute(
      sql`DELETE FROM viral_post_daily_feed_items WHERE feedId = ${feed.id}`
    );
    await db.execute(sql`DELETE FROM viral_post_daily_feeds WHERE id = ${feed.id}`);
    await db.execute(
      sql`DELETE FROM viral_post_candidates WHERE sourceId = ${sourceId}`
    );
  });

  console.log("[db-isolate] PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("[db-isolate] FATAL", err);
  process.exit(1);
});
