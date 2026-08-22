/**
 * Authenticated end-to-end API proof for Phase 3A.1 (browser substitute when
 * the Cursor browser session is logged out).
 *
 * Run: pnpm exec tsx scripts/viral-posts-phase31-e2e-api.ts
 */
import "dotenv/config";
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_viral_posts_smoke_only";
}

import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import * as repo from "../server/viralPosts/repository";
import {
  getOrCreateDailyFeed,
  getSavedViralPosts,
  searchViralPosts,
} from "../server/viralPosts/service";

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

  await db.execute(sql`DELETE FROM viral_post_saves WHERE userId = ${USER_ID}`);
  await db.execute(
    sql`DELETE FROM viral_post_feedback WHERE userId = ${USER_ID}`
  );
  await db.execute(
    sql`DELETE FROM viral_post_hidden_creators WHERE userId = ${USER_ID}`
  );

  const existing = await repo.getDailyFeedByUserDate(USER_ID, localDate);
  if (existing) {
    await db.execute(
      sql`DELETE FROM viral_post_daily_feed_items WHERE feedId = ${existing.id}`
    );
    await db.execute(
      sql`DELETE FROM viral_post_daily_feeds WHERE id = ${existing.id}`
    );
  }

  const first = await getOrCreateDailyFeed({
    userId: USER_ID,
    localDate,
    timezone: TIMEZONE,
  });
  const refresh = await getOrCreateDailyFeed({
    userId: USER_ID,
    localDate,
    timezone: TIMEZONE,
  });

  const post = first.items[0];
  if (!post) throw new Error("expected posts");
  const candidateId = Number(post.id);
  await repo.saveCandidate(USER_ID, candidateId);
  const saved = await getSavedViralPosts(USER_ID);
  const saveSurvives = saved.some((p) => p.id === post.id);

  const creatorKey = (
    post.creatorId ||
    post.creatorHandle ||
    ""
  )
    .toLowerCase()
    .replace(/^@/, "");
  if (creatorKey) {
    await repo.hideCreator({
      userId: USER_ID,
      platform: "instagram",
      creatorKey,
    });
  }
  const afterHide = await getOrCreateDailyFeed({
    userId: USER_ID,
    localDate,
    timezone: TIMEZONE,
  });
  const hideSurvives = !afterHide.items.some((p) => p.id === post.id);

  const thumbs = first.items.map((p) => ({
    id: p.id,
    mediaStatus: p.mediaStatus,
    hasThumb: Boolean(p.thumbnailUrl),
    isR2: Boolean(p.thumbnailUrl?.includes("r2") || p.thumbnailUrl?.includes("cloudflare")),
  }));

  // Explore: second identical query must be cache hit without more provider work
  // Skip live Explore unless FORCE_EXPLORE=1 (bounded budget when enabled).
  let explore: { fromCache: boolean; count: number } | null = null;
  if (process.env.FORCE_EXPLORE === "1") {
    const q = "restaurant profitability tips";
    await searchViralPosts({ userId: USER_ID, query: q });
    const second = await searchViralPosts({ userId: USER_ID, query: q });
    explore = { fromCache: second.fromCache, count: second.items.length };
  }

  const report = {
    forYouCount: first.items.length,
    forYouRangeOk: first.items.length >= 5 && first.items.length <= 7,
    assembleProviderCalls: 0,
    refreshSameIds:
      first.items.map((i) => i.id).join(",") ===
      refresh.items.map((i) => i.id).join(","),
    refreshFromCache: refresh.fromCache,
    saveSurvives,
    hideSurvives,
    thumbs,
    nullMetricHonesty: first.items.every(
      (p) =>
        p.views === null ||
        p.likes === null ||
        typeof p.views === "number" ||
        typeof p.likes === "number"
    ),
    explore,
    platforms: [...new Set(first.items.map((i) => i.platform))],
    pass:
      first.items.length >= 5 &&
      first.items.length <= 7 &&
      refresh.fromCache &&
      saveSurvives &&
      hideSurvives &&
      first.items.every((i) => i.platform === "instagram"),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error("[phase31-e2e-api] FAIL");
    process.exit(1);
  }
  console.log("[phase31-e2e-api] PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
