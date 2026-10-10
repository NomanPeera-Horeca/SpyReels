import { and, eq, inArray, sql } from "drizzle-orm";
import {
  FEATURED_DEMO_HANDLES,
  FEATURED_DEMO_ITEM_LIMIT,
  FEATURED_DEMO_REFRESH_PLATFORMS,
  FEATURED_DEMO_STALE_AFTER_MS,
  normalizeFeaturedDemoHandle,
  type FeaturedDemoRefreshPlatform,
} from "../../shared/featuredDemoCatalog";
import {
  featuredDemoAccounts,
  featuredDemoItems,
  type InsertFeaturedDemoItem,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { alertOwnerThrottled } from "../monitoring/alerts";
import { scrapeTikTokVideos } from "../tiktok";
import { scrapeYouTubeShorts } from "../youtube";
import {
  isFeaturedDemoR2ThumbUrl,
  mirrorFeaturedDemoThumb,
} from "./webOptimizedThumb";

const SCRAPE_TIMEOUT_MS = 30_000;
const MAX_ENGAGEMENT_RATE = 999999.99;

/** Integer seconds only for featured_demo_items.durationSec. */
export function toStoredDurationSec(
  value: number | null | undefined
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export type ScrapedDemoItem = {
  externalId: string;
  caption: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  thumbnailUrl: string;
  durationSec: number | null;
  postedAt: Date | null;
  videoPageUrl: string;
};

export type ScrapedDemoAccount = {
  handle: string;
  displayName?: string | null;
  followerCount: number;
  profilePicUrl: string;
  items: ScrapedDemoItem[];
};

export type FeaturedDemoAccountRow = {
  id: number;
  platform: FeaturedDemoRefreshPlatform;
  handle: string;
  isActive: boolean;
  lastSuccessAt: Date | null;
};

export type HandleRefreshStatus =
  | "success"
  | "skipped_inactive"
  | "skipped_empty"
  | "error"
  | "kept_last_good";

export type HandleRefreshResult = {
  platform: FeaturedDemoRefreshPlatform;
  handle: string;
  status: HandleRefreshStatus;
  itemCount: number;
  error?: string;
};

export type FeaturedDemoRefreshSummary = {
  attempted: number;
  succeeded: number;
  skippedInactive: number;
  skippedEmpty: number;
  errors: number;
  keptLastGood: number;
  staleAlerts: number;
  durationMs: number;
  results: HandleRefreshResult[];
};

export type FeaturedDemoRefreshDeps = {
  ensureAllowListedAccounts: () => Promise<void>;
  listRefreshTargets: () => Promise<FeaturedDemoAccountRow[]>;
  markRunning: (accountId: number, at: Date) => Promise<void>;
  markSuccess: (
    accountId: number,
    at: Date,
    meta: {
      displayName: string | null;
      followerCount: number;
      profilePicUrl: string;
    }
  ) => Promise<void>;
  markFailure: (accountId: number, at: Date, error: string) => Promise<void>;
  replaceItems: (
    accountId: number,
    items: Array<Omit<InsertFeaturedDemoItem, "accountId" | "id">>
  ) => Promise<void>;
  getExistingItems: (
    accountId: number
  ) => Promise<Array<{ externalId: string; thumbnailUrl: string | null }>>;
  scrape: (
    platform: FeaturedDemoRefreshPlatform,
    handle: string
  ) => Promise<ScrapedDemoAccount>;
  /** Must return an R2 featured-demo-thumbs URL, or "" on failure (never CDN). */
  mirrorThumb: (
    platform: FeaturedDemoRefreshPlatform,
    externalId: string,
    sourceUrl: string
  ) => Promise<string>;
  alert: (input: { kind: string; message: string; error?: unknown }) => void;
  now: () => Date;
  staleAfterMs: number;
};

function engagementRate(
  followerCount: number,
  likeCount: number,
  commentCount: number,
  shareCount: number
): string {
  if (followerCount <= 0) return "0.00";
  const pct =
    ((likeCount + commentCount + shareCount) / followerCount) * 100;
  if (!Number.isFinite(pct) || pct < 0) return "0.00";
  const capped = Math.min(Math.round(pct * 100) / 100, MAX_ENGAGEMENT_RATE);
  return capped.toFixed(2);
}

export async function scrapePlatformDemoAccount(
  platform: FeaturedDemoRefreshPlatform,
  handle: string
): Promise<ScrapedDemoAccount> {
  if (platform === "tiktok") {
    const result = await scrapeTikTokVideos(handle, undefined, {
      maxVideos: FEATURED_DEMO_ITEM_LIMIT,
      timeoutMs: SCRAPE_TIMEOUT_MS,
    });
    const sorted = [...result.videos].sort((a, b) => b.viewCount - a.viewCount);
    const top = sorted.slice(0, FEATURED_DEMO_ITEM_LIMIT);
    return {
      handle: top[0]?.ownerUsername || handle,
      followerCount: result.followerCount || 0,
      profilePicUrl: result.profilePicUrl || "",
      items: top.map((v) => ({
        externalId: v.awemeId,
        caption: v.caption ?? "",
        viewCount: v.viewCount,
        likeCount: v.likeCount,
        commentCount: v.commentCount,
        shareCount: v.shareCount,
        thumbnailUrl: v.thumbnailUrl || "",
        durationSec: toStoredDurationSec(v.durationSec),
        postedAt: v.postedAt ?? null,
        videoPageUrl: v.videoPageUrl || "",
      })),
    };
  }

  const result = await scrapeYouTubeShorts(handle, undefined, {
    maxVideos: FEATURED_DEMO_ITEM_LIMIT,
    timeoutMs: SCRAPE_TIMEOUT_MS,
  });
  const sorted = [...result.videos].sort((a, b) => b.viewCount - a.viewCount);
  const top = sorted.slice(0, FEATURED_DEMO_ITEM_LIMIT);
  return {
    handle: top[0]?.ownerHandle || handle,
    followerCount: result.subscriberCount || 0,
    profilePicUrl: result.profilePicUrl || "",
    items: top.map((v) => ({
      externalId: v.videoId,
      caption: v.title || v.description || "",
      viewCount: v.viewCount,
      likeCount: v.likeCount,
      commentCount: v.commentCount,
      shareCount: 0,
      thumbnailUrl: v.thumbnailUrl || "",
      durationSec: toStoredDurationSec(v.durationSec),
      postedAt: v.postedAt ?? null,
      videoPageUrl: v.videoPageUrl || "",
    })),
  };
}

export async function createDefaultFeaturedDemoRefreshDeps(): Promise<FeaturedDemoRefreshDeps> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database unavailable");
  }

  return {
    async ensureAllowListedAccounts() {
      for (const platform of FEATURED_DEMO_REFRESH_PLATFORMS) {
        for (const handle of FEATURED_DEMO_HANDLES[platform]) {
          await db
            .insert(featuredDemoAccounts)
            .values({
              platform,
              handle,
              isActive: true,
              refreshStatus: "idle",
            })
            .onDuplicateKeyUpdate({
              // Insert-if-missing only; never overwrite operator isActive/takedown.
              set: { handle: sql`handle` },
            });
        }
      }
    },

    async listRefreshTargets() {
      const handles = [
        ...FEATURED_DEMO_HANDLES.tiktok,
        ...FEATURED_DEMO_HANDLES.youtube,
      ];
      const rows = await db
        .select({
          id: featuredDemoAccounts.id,
          platform: featuredDemoAccounts.platform,
          handle: featuredDemoAccounts.handle,
          isActive: featuredDemoAccounts.isActive,
          lastSuccessAt: featuredDemoAccounts.lastSuccessAt,
        })
        .from(featuredDemoAccounts)
        .where(
          and(
            inArray(featuredDemoAccounts.platform, [
              ...FEATURED_DEMO_REFRESH_PLATFORMS,
            ]),
            inArray(featuredDemoAccounts.handle, handles)
          )
        );

      return rows
        .filter(
          (row): row is FeaturedDemoAccountRow =>
            row.platform === "tiktok" || row.platform === "youtube"
        )
        .sort((a, b) => {
          if (a.platform !== b.platform) {
            return a.platform.localeCompare(b.platform);
          }
          return a.handle.localeCompare(b.handle);
        });
    },

    async markRunning(accountId, at) {
      await db
        .update(featuredDemoAccounts)
        .set({
          refreshStatus: "running",
          lastRefreshAt: at,
          lastRefreshError: null,
        })
        .where(eq(featuredDemoAccounts.id, accountId));
    },

    async markSuccess(accountId, at, meta) {
      await db
        .update(featuredDemoAccounts)
        .set({
          refreshStatus: "success",
          lastRefreshAt: at,
          lastSuccessAt: at,
          lastRefreshError: null,
          displayName: meta.displayName,
          followerCount: meta.followerCount,
          profilePicUrl: meta.profilePicUrl || null,
        })
        .where(eq(featuredDemoAccounts.id, accountId));
    },

    async markFailure(accountId, at, error) {
      await db
        .update(featuredDemoAccounts)
        .set({
          refreshStatus: "error",
          lastRefreshAt: at,
          lastRefreshError: error.slice(0, 512),
        })
        .where(eq(featuredDemoAccounts.id, accountId));
    },

    async replaceItems(accountId, items) {
      await db
        .delete(featuredDemoItems)
        .where(eq(featuredDemoItems.accountId, accountId));
      if (items.length === 0) return;
      await db.insert(featuredDemoItems).values(
        items.map((item) => ({
          ...item,
          accountId,
        }))
      );
    },

    async getExistingItems(accountId) {
      return db
        .select({
          externalId: featuredDemoItems.externalId,
          thumbnailUrl: featuredDemoItems.thumbnailUrl,
        })
        .from(featuredDemoItems)
        .where(eq(featuredDemoItems.accountId, accountId));
    },

    scrape: scrapePlatformDemoAccount,

    mirrorThumb: (platform, externalId, sourceUrl) =>
      mirrorFeaturedDemoThumb(platform, externalId, sourceUrl),

    alert: (input) =>
      alertOwnerThrottled({
        kind: input.kind,
        message: input.message,
        error: input.error,
      }),

    now: () => new Date(),
    staleAfterMs: FEATURED_DEMO_STALE_AFTER_MS,
  };
}

/**
 * Daily featured-demo catalog refresh.
 * On scrape failure: keep last-good items (never blank a visitor-facing row).
 * Inactive accounts are skipped (takedown path).
 */
export async function refreshFeaturedDemoCatalog(
  deps: FeaturedDemoRefreshDeps
): Promise<FeaturedDemoRefreshSummary> {
  const startedAt = deps.now();
  const results: HandleRefreshResult[] = [];

  await deps.ensureAllowListedAccounts();
  const targets = await deps.listRefreshTargets();

  for (const account of targets) {
    const handle = normalizeFeaturedDemoHandle(account.handle);
    if (!account.isActive) {
      results.push({
        platform: account.platform,
        handle,
        status: "skipped_inactive",
        itemCount: 0,
      });
      continue;
    }

    const attemptAt = deps.now();
    await deps.markRunning(account.id, attemptAt);

    try {
      const scraped = await deps.scrape(account.platform, handle);
      if (scraped.items.length === 0) {
        await deps.markFailure(account.id, deps.now(), "empty_scrape");
        results.push({
          platform: account.platform,
          handle,
          status: "skipped_empty",
          itemCount: 0,
          error: "empty_scrape",
        });
        // Keep last-good items; do not replace with empty.
        continue;
      }

      const existing = await deps.getExistingItems(account.id);
      const existingById = new Map(
        existing.map((row) => [row.externalId, row.thumbnailUrl])
      );

      const mirroredItems: Array<
        Omit<InsertFeaturedDemoItem, "accountId" | "id">
      > = [];

      for (const item of scraped.items) {
        let thumbnailUrl = item.thumbnailUrl
          ? await deps.mirrorThumb(
              account.platform,
              item.externalId,
              item.thumbnailUrl
            )
          : "";

        if (!isFeaturedDemoR2ThumbUrl(thumbnailUrl)) {
          const previous = existingById.get(item.externalId) ?? null;
          if (isFeaturedDemoR2ThumbUrl(previous)) {
            thumbnailUrl = previous!.trim();
          } else {
            // Never persist CDN/HEIC; skip this item.
            continue;
          }
        }

        mirroredItems.push({
          externalId: item.externalId,
          caption: item.caption ?? "",
          viewCount: item.viewCount || 0,
          likeCount: item.likeCount || 0,
          commentCount: item.commentCount || 0,
          shareCount: item.shareCount || 0,
          engagementRate: engagementRate(
            scraped.followerCount,
            item.likeCount,
            item.commentCount,
            item.shareCount
          ),
          thumbnailUrl,
          durationSec: toStoredDurationSec(item.durationSec),
          postedAt: item.postedAt,
          videoPageUrl: item.videoPageUrl || null,
          rank: mirroredItems.length + 1,
          scrapedAt: deps.now(),
        });
      }

      // Success requires at least one stored item, and every stored item R2.
      if (
        mirroredItems.length === 0 ||
        !mirroredItems.every((row) => isFeaturedDemoR2ThumbUrl(row.thumbnailUrl))
      ) {
        await deps.markFailure(account.id, deps.now(), "no_r2_thumbs");
        results.push({
          platform: account.platform,
          handle,
          status: account.lastSuccessAt ? "kept_last_good" : "error",
          itemCount: 0,
          error: "no_r2_thumbs",
        });
        continue;
      }

      await deps.replaceItems(account.id, mirroredItems);
      const successAt = deps.now();
      await deps.markSuccess(account.id, successAt, {
        displayName: scraped.displayName ?? scraped.handle,
        followerCount: scraped.followerCount,
        profilePicUrl: scraped.profilePicUrl,
      });

      results.push({
        platform: account.platform,
        handle,
        status: "success",
        itemCount: mirroredItems.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await deps.markFailure(account.id, deps.now(), message);
      deps.alert({
        kind: "featured_demo_refresh",
        message: `${account.platform}/@${handle} refresh failed`,
        error: err,
      });
      results.push({
        platform: account.platform,
        handle,
        status: account.lastSuccessAt ? "kept_last_good" : "error",
        itemCount: 0,
        error: message,
      });
    }
  }

  const staleCutoff = new Date(deps.now().getTime() - deps.staleAfterMs);
  let staleAlerts = 0;
  for (const account of targets) {
    if (!account.isActive) continue;
    const lastSuccess = account.lastSuccessAt;
    const result = results.find(
      (r) => r.platform === account.platform && r.handle === account.handle
    );
    const succeededNow = result?.status === "success";
    if (succeededNow) continue;
    if (!lastSuccess || lastSuccess.getTime() < staleCutoff.getTime()) {
      staleAlerts += 1;
      deps.alert({
        kind: "featured_demo_stale",
        message: `${account.platform}/@${account.handle} no successful refresh for 3+ days`,
      });
    }
  }

  return {
    attempted: results.length,
    succeeded: results.filter((r) => r.status === "success").length,
    skippedInactive: results.filter((r) => r.status === "skipped_inactive")
      .length,
    skippedEmpty: results.filter((r) => r.status === "skipped_empty").length,
    errors: results.filter(
      (r) => r.status === "error" || r.status === "kept_last_good"
    ).length,
    keptLastGood: results.filter((r) => r.status === "kept_last_good").length,
    staleAlerts,
    durationMs: deps.now().getTime() - startedAt.getTime(),
    results,
  };
}
