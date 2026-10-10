import { and, asc, eq } from "drizzle-orm";
import {
  FEATURED_DEMO_HANDLES,
  FEATURED_DEMO_ITEM_LIMIT,
  normalizeFeaturedDemoHandle,
  type FeaturedDemoRefreshPlatform,
} from "../../shared/featuredDemoCatalog";
import {
  featuredDemoAccounts,
  featuredDemoItems,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { alertOwnerThrottled } from "../monitoring/alerts";

export type FeaturedDemoPublicVideo = {
  id: string;
  awemeId: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  engagementRate: number;
  thumbnailUrl: string;
  durationSec: number | null;
  postedAt: Date;
  videoPageUrl: string;
};

export type FeaturedDemoPublicPayload = {
  handle: string;
  totalVideoCount: number;
  medianViewCount: number;
  followerCount: number;
  videos: FeaturedDemoPublicVideo[];
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 90 * 1000;
const LATENCY_ALERT_P95_MS = 2_000;
const LATENCY_WINDOW = 40;
const LATENCY_ALERT_COOLDOWN_MS = 10 * 60 * 1000;

const responseCache = new Map<
  string,
  { expiresAt: number; payload: FeaturedDemoPublicPayload }
>();

const latencySamplesMs: number[] = [];
let lastLatencyAlertAt = 0;

export const featuredDemoPublicDemoStats = {
  requests: 0,
  cacheHits: 0,
  dbReads: 0,
  notFound: 0,
  latencyAlerts: 0,
};

export function resetFeaturedDemoPublicDemoStatsForTests(): void {
  featuredDemoPublicDemoStats.requests = 0;
  featuredDemoPublicDemoStats.cacheHits = 0;
  featuredDemoPublicDemoStats.dbReads = 0;
  featuredDemoPublicDemoStats.notFound = 0;
  featuredDemoPublicDemoStats.latencyAlerts = 0;
  responseCache.clear();
  latencySamplesMs.length = 0;
  lastLatencyAlertAt = 0;
}

function cacheKey(platform: FeaturedDemoRefreshPlatform, handle: string): string {
  return `${platform}:${handle}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function percentile95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * 0.95) - 1)
  );
  return sorted[idx]!;
}

function recordLatency(
  platform: FeaturedDemoRefreshPlatform,
  durationMs: number
): void {
  latencySamplesMs.push(durationMs);
  if (latencySamplesMs.length > LATENCY_WINDOW) {
    latencySamplesMs.shift();
  }

  console.info("[featuredDemo.publicDemo] latency", {
    platform,
    durationMs,
    sampleCount: latencySamplesMs.length,
    p95Ms: percentile95(latencySamplesMs),
  });

  if (latencySamplesMs.length < 8) return;
  const p95 = percentile95(latencySamplesMs);
  const now = Date.now();
  if (
    p95 > LATENCY_ALERT_P95_MS &&
    now - lastLatencyAlertAt > LATENCY_ALERT_COOLDOWN_MS
  ) {
    lastLatencyAlertAt = now;
    featuredDemoPublicDemoStats.latencyAlerts += 1;
    alertOwnerThrottled({
      kind: "featured_demo_public_demo_latency",
      message: `featured demo publicDemo p95 ${p95}ms > ${LATENCY_ALERT_P95_MS}ms (${platform})`,
    });
  }
}

function emptyPayload(handle: string): FeaturedDemoPublicPayload {
  return {
    handle,
    totalVideoCount: 0,
    medianViewCount: 0,
    followerCount: 0,
    videos: [],
  };
}

function tryOrder(
  platform: FeaturedDemoRefreshPlatform,
  requestedRaw: string | undefined
): string[] {
  const requested = normalizeFeaturedDemoHandle(requestedRaw ?? "");
  const allow = FEATURED_DEMO_HANDLES[platform];
  const order: string[] = [];
  if ((allow as readonly string[]).includes(requested)) order.push(requested);
  for (const handle of allow) {
    if (!order.includes(handle)) order.push(handle);
  }
  return order;
}

async function readHandleFromDb(
  platform: FeaturedDemoRefreshPlatform,
  handle: string
): Promise<FeaturedDemoPublicPayload | null> {
  const db = await getDb();
  if (!db) return null;

  featuredDemoPublicDemoStats.dbReads += 1;

  const accounts = await db
    .select({
      id: featuredDemoAccounts.id,
      handle: featuredDemoAccounts.handle,
      followerCount: featuredDemoAccounts.followerCount,
      isActive: featuredDemoAccounts.isActive,
    })
    .from(featuredDemoAccounts)
    .where(
      and(
        eq(featuredDemoAccounts.platform, platform),
        eq(featuredDemoAccounts.handle, handle),
        eq(featuredDemoAccounts.isActive, true)
      )
    )
    .limit(1);

  const account = accounts[0];
  if (!account) return null;

  const items = await db
    .select({
      externalId: featuredDemoItems.externalId,
      caption: featuredDemoItems.caption,
      viewCount: featuredDemoItems.viewCount,
      likeCount: featuredDemoItems.likeCount,
      commentCount: featuredDemoItems.commentCount,
      shareCount: featuredDemoItems.shareCount,
      engagementRate: featuredDemoItems.engagementRate,
      thumbnailUrl: featuredDemoItems.thumbnailUrl,
      durationSec: featuredDemoItems.durationSec,
      postedAt: featuredDemoItems.postedAt,
      videoPageUrl: featuredDemoItems.videoPageUrl,
      rank: featuredDemoItems.rank,
    })
    .from(featuredDemoItems)
    .where(eq(featuredDemoItems.accountId, account.id))
    .orderBy(asc(featuredDemoItems.rank))
    .limit(FEATURED_DEMO_ITEM_LIMIT);

  if (items.length === 0) return emptyPayload(account.handle);

  const viewCounts = items
    .map((item) => item.viewCount)
    .filter((n) => Number.isFinite(n) && n > 0);

  return {
    handle: account.handle,
    totalVideoCount: items.length,
    medianViewCount: median(viewCounts),
    followerCount: account.followerCount || 0,
    videos: items.map((item) => ({
      id: item.externalId,
      awemeId: item.externalId,
      caption: item.caption ?? "",
      viewCount: item.viewCount || 0,
      likeCount: item.likeCount || 0,
      commentCount: item.commentCount || 0,
      shareCount: item.shareCount || 0,
      engagementRate: Number(item.engagementRate ?? 0),
      thumbnailUrl: item.thumbnailUrl ?? "",
      durationSec: item.durationSec ?? null,
      postedAt: item.postedAt ?? new Date(0),
      videoPageUrl: item.videoPageUrl ?? "",
    })),
  };
}

/**
 * DB-only featured demo catalog read for visitor publicDemo.
 * Never scrapes. Never writes R2. Serves last-good rows; skips isActive=0.
 */
export async function loadFeaturedDemoPublicPayload(
  platform: FeaturedDemoRefreshPlatform,
  requestedHandle?: string
): Promise<FeaturedDemoPublicPayload | null> {
  const started = Date.now();
  featuredDemoPublicDemoStats.requests += 1;

  try {
    for (const handle of tryOrder(platform, requestedHandle)) {
      const key = cacheKey(platform, handle);
      const cached = responseCache.get(key);
      if (cached && Date.now() <= cached.expiresAt) {
        featuredDemoPublicDemoStats.cacheHits += 1;
        if (cached.payload.videos.length > 0) return cached.payload;
        continue;
      }

      const payload = await readHandleFromDb(platform, handle);
      if (!payload) {
        responseCache.set(key, {
          expiresAt: Date.now() + EMPTY_CACHE_TTL_MS,
          payload: emptyPayload(handle),
        });
        continue;
      }

      responseCache.set(key, {
        expiresAt:
          Date.now() +
          (payload.videos.length > 0 ? CACHE_TTL_MS : EMPTY_CACHE_TTL_MS),
        payload,
      });

      if (payload.videos.length > 0) return payload;
    }

    featuredDemoPublicDemoStats.notFound += 1;
    return null;
  } finally {
    recordLatency(platform, Date.now() - started);
  }
}
