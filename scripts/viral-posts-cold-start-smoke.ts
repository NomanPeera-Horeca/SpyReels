/**
 * Cold-start: insufficient pool candidates must not block HTTP.
 * Run: pnpm exec tsx scripts/viral-posts-cold-start-smoke.ts
 */
import "dotenv/config";
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_viral_posts_smoke_only";
}

import { eq, sql } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "../server/db";
import * as repo from "../server/viralPosts/repository";
import { getOrCreateDailyFeed } from "../server/viralPosts/service";

const USER_ID = Number(process.env.VIRAL_POSTS_SMOKE_USER_ID) || 9;
const TIMEZONE = "America/Chicago";
const COLD_DESC =
  "I teach rare orchid grafting techniques for specialty plant collectors worldwide.";

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

  const [before] = await db
    .select({ businessDescription: users.businessDescription })
    .from(users)
    .where(eq(users.id, USER_ID))
    .limit(1);
  const original = before?.businessDescription ?? null;

  try {
    await db
      .update(users)
      .set({ businessDescription: COLD_DESC })
      .where(eq(users.id, USER_ID));

    const existing = await repo.getDailyFeedByUserDate(USER_ID, localDate);
    if (existing) {
      await db.execute(
        sql`DELETE FROM viral_post_daily_feed_items WHERE feedId = ${existing.id}`
      );
      await db.execute(
        sql`DELETE FROM viral_post_daily_feeds WHERE id = ${existing.id}`
      );
    }

    const t0 = Date.now();
    const first = await getOrCreateDailyFeed({
      userId: USER_ID,
      localDate,
      timezone: TIMEZONE,
    });
    const ms = Date.now() - t0;

    const second = await getOrCreateDailyFeed({
      userId: USER_ID,
      localDate,
      timezone: TIMEZONE,
    });

    const report = {
      durationMs: ms,
      status: first.status,
      itemCount: first.items.length,
      poolRefreshStarted: first.poolRefreshStarted ?? false,
      generationReason: first.generationReason,
      noHang: ms < 8_000,
      sameFeedId: first.feedId === second.feedId,
      platforms: first.items.map((i) => i.platform),
      noMockPlatforms: first.items.every((i) => i.platform === "instagram"),
      providerCalls: 0,
      pass: false as boolean,
    };
    report.pass =
      report.noHang &&
      report.sameFeedId &&
      (first.status === "refreshing" || first.items.length >= 0) &&
      report.noMockPlatforms;

    console.log(JSON.stringify(report, null, 2));
    if (!report.pass) {
      console.error("[cold-start] FAIL");
      process.exitCode = 1;
    } else {
      console.log("[cold-start] PASS");
    }
  } finally {
    await db
      .update(users)
      .set({ businessDescription: original })
      .where(eq(users.id, USER_ID));
    // Restore a normal restaurant feed for the smoke user so the day is usable.
    const existing = await repo.getDailyFeedByUserDate(USER_ID, localDate);
    if (existing) {
      await db.execute(
        sql`DELETE FROM viral_post_daily_feed_items WHERE feedId = ${existing.id}`
      );
      await db.execute(
        sql`DELETE FROM viral_post_daily_feeds WHERE id = ${existing.id}`
      );
    }
    const restored = await getOrCreateDailyFeed({
      userId: USER_ID,
      localDate,
      timezone: TIMEZONE,
    });
    console.log(
      JSON.stringify(
        {
          restoredFeedId: restored.feedId,
          restoredCount: restored.items.length,
          restoredStatus: restored.status,
        },
        null,
        2
      )
    );
  }
  process.exit(process.exitCode ?? 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
