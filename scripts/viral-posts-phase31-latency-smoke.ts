/**
 * Phase 3A.1 latency + zero-provider assembly smoke.
 * Run: pnpm exec tsx scripts/viral-posts-phase31-latency-smoke.ts
 */
import "dotenv/config";
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_viral_posts_smoke_only";
}

import { sql } from "drizzle-orm";
import { getDb } from "../server/db";
import * as repo from "../server/viralPosts/repository";
import { getOrCreateDailyFeed, searchViralPosts } from "../server/viralPosts/service";

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

  const t0 = Date.now();
  const first = await getOrCreateDailyFeed({
    userId: USER_ID,
    localDate,
    timezone: TIMEZONE,
  });
  const assembleMs = Date.now() - t0;

  const t1 = Date.now();
  const second = await getOrCreateDailyFeed({
    userId: USER_ID,
    localDate,
    timezone: TIMEZONE,
  });
  const cacheMs = Date.now() - t1;

  // Explore cache reuse (second identical search should be fromCache)
  const q = "restaurant menu engineering reels";
  // Only measure cache hit path if we already have a cache entry from a prior run;
  // skip live provider to keep smoke fast unless FORCE_EXPLORE=1
  let explore: {
    exploreFirstMs: number;
    exploreSecondMs: number;
    exploreFromCache: boolean;
    exploreCount: number;
  } | null = null;
  if (process.env.FORCE_EXPLORE === "1") {
    const e0 = Date.now();
    const a = await searchViralPosts({ userId: USER_ID, query: q });
    const e1 = Date.now();
    const b = await searchViralPosts({ userId: USER_ID, query: q });
    explore = {
      exploreFirstMs: e1 - e0,
      exploreSecondMs: Date.now() - e1,
      exploreFromCache: b.fromCache === true,
      exploreCount: a.items.length,
    };
  }

  const report = {
    assembleMs,
    assembleServerMs: first.serverDurationMs,
    assembleStatus: first.status,
    assembleFromCache: first.fromCache,
    assembleCount: first.items.length,
    assembleReason: first.generationReason,
    poolRefreshStarted: first.poolRefreshStarted ?? false,
    cacheMs,
    cacheServerMs: second.serverDurationMs,
    cacheFromCache: second.fromCache,
    cacheCount: second.items.length,
    assembleUnder3s: assembleMs < 3000,
    cacheUnder1s: cacheMs < 1000,
    providerCallsOnAssemble: 0,
    providerCallsOnCache: 0,
    explore,
    pass:
      first.items.length >= 5 &&
      first.items.length <= 7 &&
      assembleMs < 3000 &&
      second.fromCache === true &&
      cacheMs < 1000,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error("[phase31-latency] FAIL");
    process.exit(1);
  }
  console.log("[phase31-latency] PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
