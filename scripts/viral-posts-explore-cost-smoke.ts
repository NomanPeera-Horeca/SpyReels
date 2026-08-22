/**
 * Explore cost + cache verification.
 * Run: FORCE_EXPLORE=1 pnpm exec tsx scripts/viral-posts-explore-cost-smoke.ts
 */
import "dotenv/config";
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_viral_posts_smoke_only";
}

import {
  normalizeSearchCacheKey,
  searchViralPosts,
} from "../server/viralPosts/service";

const USER_ID = Number(process.env.VIRAL_POSTS_SMOKE_USER_ID) || 9;

async function main() {
  if (process.env.FORCE_EXPLORE !== "1") {
    console.error("Set FORCE_EXPLORE=1 to run live Explore cost smoke");
    process.exit(1);
  }

  const q1 = "restaurant menu engineering tips";
  const qNorm = "Restaurant Menu Engineering Tips!!!";
  const qEmpty = "zzzxqqqnonexistenttopic99999";

  const first = await searchViralPosts({ userId: USER_ID, query: q1 });
  const identical = await searchViralPosts({ userId: USER_ID, query: q1 });
  const normalized = await searchViralPosts({ userId: USER_ID, query: qNorm });

  // Empty-ish query (may still return some reels; report honestly)
  const empty = await searchViralPosts({ userId: USER_ID, query: qEmpty });

  // Provider error path: short-circuit via disabled flags is not Explore;
  // document that search_error logs on thrown pipeline failures.

  const keySame =
    normalizeSearchCacheKey(USER_ID, q1) ===
    normalizeSearchCacheKey(USER_ID, qNorm);

  const report = {
    first: {
      scCallCount: first.scCallCount ?? null,
      latencyMs: first.serverDurationMs,
      fromCache: first.fromCache,
      resultCount: first.items.length,
      costEstimateUsd: first.costEstimateUsd ?? null,
    },
    identical: {
      scCallCount: identical.scCallCount ?? null,
      latencyMs: identical.serverDurationMs,
      fromCache: identical.fromCache,
      resultCount: identical.items.length,
    },
    normalized: {
      scCallCount: normalized.scCallCount ?? null,
      latencyMs: normalized.serverDurationMs,
      fromCache: normalized.fromCache,
      resultCount: normalized.items.length,
      keyMatchesFirst: keySame,
    },
    emptyQuery: {
      scCallCount: empty.scCallCount ?? null,
      latencyMs: empty.serverDurationMs,
      fromCache: empty.fromCache,
      resultCount: empty.items.length,
    },
    cacheReuseOk:
      identical.fromCache === true &&
      (identical.scCallCount ?? 0) === 0 &&
      normalized.fromCache === true &&
      (normalized.scCallCount ?? 0) === 0,
    firstBudgetOk: (first.scCallCount ?? 0) <= 25,
    pass: false as boolean,
  };
  report.pass =
    report.cacheReuseOk &&
    report.firstBudgetOk &&
    typeof first.scCallCount === "number";

  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    console.error("[explore-cost] FAIL");
    process.exit(1);
  }
  console.log("[explore-cost] PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
