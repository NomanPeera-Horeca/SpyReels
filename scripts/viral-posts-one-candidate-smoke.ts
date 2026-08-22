/**
 * One real Instagram candidate → persist → tRPC getDailyFeed cache proof.
 * Does NOT run the full discovery pipeline.
 *
 * Run: pnpm exec tsx scripts/viral-posts-one-candidate-smoke.ts
 */
import "dotenv/config";

// appRouter import graph requires Stripe; use a non-production placeholder for smoke only.
if (!process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = "sk_test_viral_posts_smoke_only";
}

import { sql } from "drizzle-orm";
import type { TrpcContext } from "../server/_core/context";
import { getDb } from "../server/db";
import { searchHashtagReels } from "../server/instagram";
import * as repo from "../server/viralPosts/repository";
import type { AdaptedCandidate } from "../server/viralPosts/candidateAdapter";
import {
  classifyTrendStatus,
  computeEngagementRate,
  computeReachMultiplier,
  computeViewsPerHour,
  ageHoursFromPublished,
} from "../server/viralPosts/scoring";
import { getOrCreateDailyFeed } from "../server/viralPosts/service";

const USER_ID = 9;
const TIMEZONE = "America/Chicago";
const PROVIDER_TIMEOUT_MS = 45_000;
const DB_TIMEOUT_MS = 20_000;

function localDateString(d = new Date(), timeZone = TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

async function withTimeout<T>(
  label: string,
  ms: number,
  fn: () => Promise<T>
): Promise<T> {
  const started = Date.now();
  console.log(`[one-cand] BEFORE ${label}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      fn().then((value) => ({ ok: true as const, value })),
      new Promise<{ ok: false; error: Error }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              ok: false,
              error: new Error(`TIMEOUT ${ms}ms: ${label}`),
            }),
          ms
        );
      }),
    ]);
    if (!raced.ok) throw raced.error;
    console.log(`[one-cand] AFTER  ${label} (${Date.now() - started}ms)`);
    return raced.value;
  } catch (err) {
    const cause =
      err && typeof err === "object" && "cause" in err
        ? (err as { cause?: unknown }).cause
        : undefined;
    console.error(`[one-cand] FAIL   ${label} (${Date.now() - started}ms)`, err);
    if (cause) console.error(`[one-cand] cause`, cause);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function pickFirstReel(data: unknown): {
  shortcode: string;
  caption: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  postedAt: Date | null;
  username: string | null;
  fullName: string | null;
  followers: number | null;
  profilePicUrl: string | null;
} | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const items =
    (Array.isArray(root.posts) && root.posts) ||
    (Array.isArray(root.items) && root.items) ||
    (Array.isArray(root.medias) && root.medias) ||
    (Array.isArray(root.data) && root.data) ||
    [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const media = raw as Record<string, unknown>;
    const shortcode =
      (typeof media.shortcode === "string" && media.shortcode) ||
      (typeof media.code === "string" && media.code) ||
      null;
    if (!shortcode) continue;

    const user =
      (media.owner && typeof media.owner === "object"
        ? (media.owner as Record<string, unknown>)
        : null) ||
      (media.user && typeof media.user === "object"
        ? (media.user as Record<string, unknown>)
        : null) ||
      null;

    const caption =
      (typeof media.caption === "string" && media.caption) || "";

    const takenAt =
      typeof media.taken_at === "number"
        ? media.taken_at > 1e12
          ? new Date(media.taken_at)
          : new Date(media.taken_at * 1000)
        : typeof media.taken_at_timestamp === "number"
          ? new Date(media.taken_at_timestamp * 1000)
          : null;

    const views =
      typeof media.play_count === "number"
        ? media.play_count
        : typeof media.view_count === "number"
          ? media.view_count
          : typeof media.video_view_count === "number"
            ? media.video_view_count
            : null;
    const likes =
      typeof media.like_count === "number" ? media.like_count : null;
    const comments =
      typeof media.comment_count === "number" ? media.comment_count : null;

    return {
      shortcode,
      caption,
      views,
      likes,
      comments,
      thumbnailUrl:
        (typeof media.thumbnail_src === "string" && media.thumbnail_src) ||
        (typeof media.thumbnail_url === "string" && media.thumbnail_url) ||
        (typeof media.display_url === "string" && media.display_url) ||
        null,
      videoUrl:
        (typeof media.video_url === "string" && media.video_url) || null,
      postedAt: takenAt,
      username:
        (user && typeof user.username === "string" && user.username) || null,
      fullName:
        (user && typeof user.full_name === "string" && user.full_name) || null,
      followers:
        (user && typeof user.follower_count === "number" && user.follower_count) ||
        null,
      profilePicUrl:
        (user &&
          typeof user.profile_pic_url === "string" &&
          user.profile_pic_url) ||
        null,
    };
  }
  return null;
}

function toAdapted(reel: NonNullable<ReturnType<typeof pickFirstReel>>): AdaptedCandidate {
  const now = new Date();
  const ageHours = ageHoursFromPublished(reel.postedAt, now);
  const reachMultiplier = computeReachMultiplier(reel.views, reel.followers);
  const engagementRate = computeEngagementRate({
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    shares: null,
    saves: null,
  });
  const viewsPerHour = computeViewsPerHour(reel.views, ageHours);
  const trendStatus = classifyTrendStatus({
    reachMultiplier,
    viewsPerHour,
    ageHours,
    views: reel.views,
  });
  const handle = reel.username?.replace(/^@/, "") || null;
  return {
    platform: "instagram",
    sourceId: reel.shortcode,
    sourceUrl: `https://www.instagram.com/reel/${reel.shortcode}/`,
    creatorId: handle,
    creatorName: reel.fullName?.trim() || handle || "Instagram creator",
    creatorHandle: handle ? `@${handle}` : null,
    creatorAvatarUrl: reel.profilePicUrl,
    creatorFollowers: reel.followers,
    thumbnailUrl: reel.thumbnailUrl,
    videoUrl: reel.videoUrl,
    caption: reel.caption || null,
    transcript: null,
    hashtags: [],
    publishedAt: reel.postedAt,
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    shares: null,
    saves: null,
    reachMultiplier,
    engagementRate,
    viewsPerHour,
    trendStatus,
    relevanceHint: 70,
    contentPillar: "restaurant",
    relevanceLabel: "Matches restaurant",
    relevanceReason: "One-candidate Instagram smoke fixture from hashtag search",
    hook: (reel.caption || "").slice(0, 120) || null,
    format: "talking-head",
    hashtagKey: "restaurantowner",
    rawProviderPayload: { smoke: "one-candidate", shortcode: reel.shortcode },
  };
}

async function main() {
  const localDate = localDateString();
  console.log("[one-cand] start", { USER_ID, localDate, TIMEZONE });

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Clean any same-day feed for a clean first-write proof
  await withTimeout("cleanup prior same-day feed", DB_TIMEOUT_MS, async () => {
    const existing = await repo.getDailyFeedByUserDate(USER_ID, localDate);
    if (existing) {
      await db.execute(
        sql`DELETE FROM viral_post_daily_feed_items WHERE feedId = ${existing.id}`
      );
      await db.execute(
        sql`DELETE FROM viral_post_daily_feeds WHERE id = ${existing.id}`
      );
      console.log("[one-cand] deleted prior feed", existing.id);
    }
  });

  let providerCalls = 0;
  const search = await withTimeout(
    "searchHashtagReels(#restaurantowner)",
    PROVIDER_TIMEOUT_MS,
    async () => {
      providerCalls += 1;
      return searchHashtagReels("restaurantowner");
    }
  );
  if (!search.success) {
    throw new Error(`Provider hashtag search failed: ${search.error}`);
  }
  const picked = pickFirstReel(search.data);
  if (!picked) {
    throw new Error("Provider returned no parseable reel");
  }
  console.log("[one-cand] provider reel", {
    shortcode: picked.shortcode,
    username: picked.username,
    views: picked.views,
    likes: picked.likes,
    hasThumb: Boolean(picked.thumbnailUrl),
  });

  const adapted = toAdapted(picked);
  const upserted = await withTimeout("upsertCandidates(1)", DB_TIMEOUT_MS, () =>
    repo.upsertCandidates([adapted])
  );
  if (upserted.length !== 1) {
    throw new Error(`Expected 1 candidate, got ${upserted.length}`);
  }
  const candidate = upserted[0]!;
  console.log("[one-cand] candidate persisted", {
    id: candidate.id,
    sourceId: candidate.sourceId,
    sourceUrl: candidate.sourceUrl,
  });

  const feed = await withTimeout("createDailyFeed", DB_TIMEOUT_MS, () =>
    repo.createDailyFeed({
      userId: USER_ID,
      localDate,
      timezone: TIMEZONE,
      status: "ready",
      generationReason: "one_candidate_smoke",
      scCallCount: providerCalls,
      costEstimateUsd: 0.002,
    })
  );
  await withTimeout("insertFeedItems(1)", DB_TIMEOUT_MS, () =>
    repo.insertFeedItems([
      {
        feedId: feed.id,
        candidateId: candidate.id,
        rank: 1,
        contentPillar: adapted.contentPillar,
        relevanceScore: 70,
        relevanceLabel: adapted.relevanceLabel,
        relevanceReason: adapted.relevanceReason,
        adaptabilityScore: 70,
        finalScore: 0.7,
      },
    ])
  );
  console.log("[one-cand] feed persisted", { feedId: feed.id, localDate });

  const [userRow] = await db.execute(
    sql`SELECT id, email, name, openId, role FROM users WHERE id = ${USER_ID} LIMIT 1`
  );
  const user = (userRow as Array<Record<string, unknown>>)[0];
  if (!user) throw new Error(`User ${USER_ID} not found`);

  // Prove the same path the tRPC mutation uses (getOrCreateDailyFeed).
  // Full appRouter.createCaller is also exercised via dynamic import below.
  const providerCallsBeforeService = providerCalls;
  const firstService = await withTimeout(
    "service.getOrCreateDailyFeed #1",
    DB_TIMEOUT_MS,
    () =>
      getOrCreateDailyFeed({
        userId: USER_ID,
        localDate,
        timezone: TIMEZONE,
      })
  );
  console.log("[one-cand] service #1", {
    feedId: firstService.feedId,
    fromCache: firstService.fromCache,
    status: firstService.status,
    itemCount: firstService.items.length,
    firstSourceId: firstService.items[0]?.sourceId,
    providerCalls,
  });
  if (!firstService.fromCache) {
    throw new Error("Expected fromCache=true after seeding daily feed");
  }
  if (firstService.items.length !== 1) {
    throw new Error(`Expected 1 item, got ${firstService.items.length}`);
  }
  if (firstService.items[0]?.sourceId !== candidate.sourceId) {
    throw new Error("service feed sourceId mismatch");
  }
  if (providerCalls !== providerCallsBeforeService) {
    throw new Error("Provider called during cached getOrCreateDailyFeed");
  }

  const secondService = await withTimeout(
    "service.getOrCreateDailyFeed #2",
    DB_TIMEOUT_MS,
    () =>
      getOrCreateDailyFeed({
        userId: USER_ID,
        localDate,
        timezone: TIMEZONE,
      })
  );
  console.log("[one-cand] service #2", {
    feedId: secondService.feedId,
    fromCache: secondService.fromCache,
    sameIds:
      firstService.items.map((i) => i.id).join(",") ===
      secondService.items.map((i) => i.id).join(","),
    providerCalls,
  });
  if (!secondService.fromCache) {
    throw new Error("Expected fromCache=true on second service read");
  }

  const { appRouter } = await import("../server/routers");
  const { getPersonalWorkspaceId } = await import("../server/personalWorkspace");
  const workspaceId = await getPersonalWorkspaceId(USER_ID);
  if (!workspaceId) {
    throw new Error(`No personal workspace for user ${USER_ID}`);
  }
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

  const first = await withTimeout(
    "tRPC viralPosts.getDailyFeed #1",
    DB_TIMEOUT_MS,
    () => caller.viralPosts.getDailyFeed({ timezone: TIMEZONE, localDate })
  );
  console.log("[one-cand] tRPC #1", {
    feedId: first.feedId,
    fromCache: first.fromCache,
    status: first.status,
    itemCount: first.items.length,
    firstId: first.items[0]?.id,
    firstUrl: first.items[0]?.sourceUrl,
    providerCalls,
  });
  if (!first.fromCache) {
    throw new Error("Expected fromCache=true on first tRPC read of seeded feed");
  }
  if (first.items.length !== 1) {
    throw new Error(`Expected 1 feed item via tRPC, got ${first.items.length}`);
  }
  if (first.items[0]?.sourceId !== candidate.sourceId) {
    throw new Error("tRPC feed item sourceId mismatch");
  }
  if (providerCalls !== 1) {
    throw new Error(`Expected exactly 1 provider call total, got ${providerCalls}`);
  }

  const second = await withTimeout(
    "tRPC viralPosts.getDailyFeed #2",
    DB_TIMEOUT_MS,
    () => caller.viralPosts.getDailyFeed({ timezone: TIMEZONE, localDate })
  );
  console.log("[one-cand] tRPC #2", {
    feedId: second.feedId,
    fromCache: second.fromCache,
    itemCount: second.items.length,
    sameIds:
      first.items.map((i) => i.id).join(",") ===
      second.items.map((i) => i.id).join(","),
    providerCalls,
  });
  if (!second.fromCache) {
    throw new Error("Expected fromCache=true on second tRPC read");
  }
  if (providerCalls !== 1) {
    throw new Error(`Expected exactly 1 provider call total, got ${providerCalls}`);
  }

  console.log("[one-cand] PASS", {
    candidateId: candidate.id,
    feedId: feed.id,
    sourceUrl: candidate.sourceUrl,
    providerCalls,
  });
  process.exit(0);
}

main().catch((err) => {
  console.error("[one-cand] FATAL", err);
  process.exit(1);
});
