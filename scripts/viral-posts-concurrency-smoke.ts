/**
 * Prove concurrent same-user/date feed requests create one feed.
 * Run: pnpm exec tsx scripts/viral-posts-concurrency-smoke.ts
 */
import "dotenv/config";
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_viral_posts_smoke_only";
}

import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import * as repo from "../server/viralPosts/repository";
import { getOrCreateDailyFeed } from "../server/viralPosts/service";

const USER_ID = Number(process.env.VIRAL_POSTS_SMOKE_USER_ID) || 9;
const TIMEZONE = "America/Chicago";

function localDateString(d = new Date(), timeZone = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function main() {
  const localDate = localDateString();
  const db = await getDb();
  if (!db) throw new Error("no db");

  const existing = await repo.getDailyFeedByUserDate(USER_ID, localDate);
  if (existing) {
    await db.execute(
      sql`DELETE FROM viral_post_daily_feed_items WHERE feedId = ${existing.id}`
    );
    await db.execute(
      sql`DELETE FROM viral_post_daily_feeds WHERE id = ${existing.id}`
    );
  }

  const [a, b] = await Promise.all([
    getOrCreateDailyFeed({
      userId: USER_ID,
      localDate,
      timezone: TIMEZONE,
    }),
    getOrCreateDailyFeed({
      userId: USER_ID,
      localDate,
      timezone: TIMEZONE,
    }),
  ]);

  const feeds = await db.execute(sql`
    SELECT id, status, scCallCount FROM viral_post_daily_feeds
    WHERE userId = ${USER_ID} AND localDate = ${localDate}
  `);
  const feedRows = feeds[0] as Array<{
    id: number;
    status: string;
    scCallCount: number;
  }>;

  const items = await db.execute(sql`
    SELECT feedId, candidateId, COUNT(*) AS c
    FROM viral_post_daily_feed_items
    WHERE feedId IN (${sql.join(
      feedRows.map((r) => sql`${r.id}`),
      sql`, `
    )})
    GROUP BY feedId, candidateId
    HAVING c > 1
  `);

  const report = {
    feedA: a.feedId,
    feedB: b.feedId,
    sameFeedId: a.feedId === b.feedId,
    feedRowCount: feedRows.length,
    duplicateItemPairs: (items[0] as unknown[]).length,
    itemCountA: a.items.length,
    itemCountB: b.items.length,
    scCalls: feedRows.map((r) => r.scCallCount),
    pass:
      a.feedId === b.feedId &&
      feedRows.length === 1 &&
      (items[0] as unknown[]).length === 0 &&
      a.items.length === b.items.length,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error("[concurrency] FAIL");
    process.exit(1);
  }
  console.log("[concurrency] PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
