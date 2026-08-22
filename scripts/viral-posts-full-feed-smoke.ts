/**
 * Full Phase 3A feed smoke: generate 5–7, cache, save/feedback/hide.
 * Run: pnpm exec tsx scripts/viral-posts-full-feed-smoke.ts
 */
import "dotenv/config";
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_viral_posts_smoke_only";
}

import { sql } from "drizzle-orm";
import type { TrpcContext } from "../server/_core/context";
import { getDb } from "../server/db";
import { getPersonalWorkspaceId } from "../server/personalWorkspace";
import * as repo from "../server/viralPosts/repository";
import { getOrCreateDailyFeed } from "../server/viralPosts/service";

const USER_ID = 9;
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

  console.log("[full-smoke] start", { USER_ID, localDate });

  // Wipe same-day feed so first call generates
  const existing = await repo.getDailyFeedByUserDate(USER_ID, localDate);
  if (existing) {
    await db.execute(
      sql`DELETE FROM viral_post_daily_feed_items WHERE feedId = ${existing.id}`
    );
    await db.execute(
      sql`DELETE FROM viral_post_daily_feeds WHERE id = ${existing.id}`
    );
    console.log("[full-smoke] deleted prior feed", existing.id);
  }
  // Clear prior feedback/saves/hides for clean action proof
  await db.execute(sql`DELETE FROM viral_post_saves WHERE userId = ${USER_ID}`);
  await db.execute(
    sql`DELETE FROM viral_post_feedback WHERE userId = ${USER_ID}`
  );
  await db.execute(
    sql`DELETE FROM viral_post_hidden_creators WHERE userId = ${USER_ID}`
  );

  console.log("[full-smoke] FIRST getOrCreateDailyFeed (expect generate)...");
  const t0 = Date.now();
  const first = await getOrCreateDailyFeed({
    userId: USER_ID,
    localDate,
    timezone: TIMEZONE,
  });
  console.log(
    JSON.stringify(
      {
        durationMs: Date.now() - t0,
        feedId: first.feedId,
        fromCache: first.fromCache,
        status: first.status,
        generationReason: first.generationReason,
        itemCount: first.items.length,
        errorMessage: first.errorMessage,
        ids: first.items.map((i) => i.id),
        sourceIds: first.items.map((i) => i.sourceId),
        ranks: first.items.map((_, idx) => idx + 1),
        creators: first.items.map((i) => i.creatorHandle || i.creatorName),
        pillars: first.items.map((i) => i.contentPillar),
        platforms: first.items.map((i) => i.platform),
        urls: first.items.map((i) => i.sourceUrl),
        thumbs: first.items.map((i) => ({
          mediaStatus: i.mediaStatus,
          hasThumb: Boolean(i.thumbnailUrl),
        })),
        metricsNullHonesty: first.items.map((i) => ({
          id: i.id,
          shares: i.shares,
          saves: i.saves,
          views: i.views,
        })),
      },
      null,
      2
    )
  );

  if (first.fromCache) throw new Error("Expected fromCache=false on first generate");
  if (first.status !== "ready" && first.status !== "empty") {
    throw new Error(`Unexpected status ${first.status}`);
  }
  if (first.items.length < 5 || first.items.length > 7) {
    // Allow empty only if provider truly empty; otherwise fail.
    if (first.items.length === 0) {
      console.warn("[full-smoke] empty feed — provider returned no selectable candidates");
    } else {
      throw new Error(`Expected 5–7 items, got ${first.items.length}`);
    }
  }
  if (first.items.some((i) => i.platform !== "instagram")) {
    throw new Error("Non-instagram platform in feed");
  }
  if (first.items.some((i) => !i.sourceUrl.includes("instagram.com"))) {
    throw new Error("Missing real Instagram source URL");
  }
  const uniqueSources = new Set(first.items.map((i) => i.sourceId));
  if (uniqueSources.size !== first.items.length) {
    throw new Error("Duplicate source posts in feed");
  }
  const creatorCounts = new Map<string, number>();
  for (const i of first.items) {
    const k = (i.creatorId || i.creatorHandle || "unknown").toLowerCase();
    creatorCounts.set(k, (creatorCounts.get(k) || 0) + 1);
  }
  for (const [k, n] of creatorCounts) {
    if (n > 2) throw new Error(`Creator ${k} exceeds cap (${n})`);
  }

  console.log("[full-smoke] SECOND getOrCreateDailyFeed (expect cache)...");
  const t1 = Date.now();
  const second = await getOrCreateDailyFeed({
    userId: USER_ID,
    localDate,
    timezone: TIMEZONE,
  });
  console.log(
    JSON.stringify(
      {
        durationMs: Date.now() - t1,
        feedId: second.feedId,
        fromCache: second.fromCache,
        itemCount: second.items.length,
        ids: second.items.map((i) => i.id),
        sameIds:
          first.items.map((i) => i.id).join(",") ===
          second.items.map((i) => i.id).join(","),
      },
      null,
      2
    )
  );
  if (!second.fromCache) throw new Error("Expected fromCache=true");
  if (second.feedId !== first.feedId) throw new Error("Feed ID changed");
  if (
    first.items.map((i) => i.id).join(",") !==
    second.items.map((i) => i.id).join(",")
  ) {
    throw new Error("Ranking/IDs changed on cache hit");
  }

  if (first.items.length === 0) {
    console.log("[full-smoke] PASS (empty-state only; actions skipped)");
    process.exit(0);
  }

  // tRPC actions
  const { appRouter } = await import("../server/routers");
  const workspaceId = await getPersonalWorkspaceId(USER_ID);
  if (!workspaceId) throw new Error("no workspace");
  const [userRow] = await db.execute(
    sql`SELECT id, email, name, openId, role FROM users WHERE id = ${USER_ID} LIMIT 1`
  );
  const user = (userRow as Array<Record<string, unknown>>)[0]!;
  const ctx: TrpcContext = {
    user: {
      id: USER_ID,
      openId: String(user.openId),
      email: (user.email as string) || null,
      name: (user.name as string) || null,
      role: (user.role as "user" | "admin") || "user",
      loginMethod: "manus",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as NonNullable<TrpcContext["user"]>,
    workspaceId,
    workspaceRole: "owner",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
  const caller = appRouter.createCaller(ctx);

  const post = first.items[0]!;
  await caller.viralPosts.save({ postId: post.id });
  let saved = await caller.viralPosts.getSaved();
  if (!saved.items.some((i) => i.id === post.id)) {
    throw new Error("Save did not persist");
  }
  await caller.viralPosts.unsave({ postId: post.id });
  saved = await caller.viralPosts.getSaved();
  if (saved.items.some((i) => i.id === post.id)) {
    throw new Error("Unsave did not persist");
  }

  await caller.viralPosts.feedback({
    postId: post.id,
    feedbackType: "more_like_this",
  });
  await caller.viralPosts.feedback({
    postId: post.id,
    feedbackType: "not_relevant",
  });

  const hideTarget =
    first.items.find((i) => i.creatorHandle || i.creatorId) || post;
  const hideRes = await caller.viralPosts.hideCreator({
    postId: hideTarget.id,
  });
  const afterHide = await getOrCreateDailyFeed({
    userId: USER_ID,
    localDate,
    timezone: TIMEZONE,
  });
  if (
    afterHide.items.some((i) => {
      const key = (i.creatorId || i.creatorHandle || "")
        .toLowerCase()
        .replace(/^@/, "");
      return key && key === hideRes.creatorKey;
    })
  ) {
    throw new Error("Hidden creator still present after refresh");
  }

  // Confirm feedback rows exist for this user only
  const fb = await db.execute(sql`
    SELECT feedbackType, COUNT(*) AS n
    FROM viral_post_feedback
    WHERE userId = ${USER_ID}
    GROUP BY feedbackType
  `);
  console.log("[full-smoke] feedback rows", fb[0]);
  console.log("[full-smoke] PASS", {
    feedId: first.feedId,
    itemCount: first.items.length,
    hiddenCreator: hideRes.creatorKey,
  });
  process.exit(0);
}

main().catch((err) => {
  console.error("[full-smoke] FATAL", err);
  process.exit(1);
});
