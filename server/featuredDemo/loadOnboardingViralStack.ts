import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  featuredAccounts,
  featuredDemoAccounts,
  featuredDemoItems,
  featuredReels,
} from "../../drizzle/schema";
import { FEATURED_DEMO_HANDLES } from "../../shared/featuredDemoCatalog";
import { onboardingPreviewMedia } from "../../shared/onboardingPreviewMedia";
import {
  selectOnboardingViralStack,
  type OnboardingStackCandidate,
  type OnboardingViralStack,
} from "../../shared/onboardingViralStack";
import { PUBLIC_DEMO_HANDLES } from "../../shared/publicDemoAccounts";
import { getDb } from "../db";

const CACHE_MS = 10 * 60 * 1000;
const EMPTY_CACHE_MS = 60 * 1000;
const SCAN_LIMIT = 16;

const EMPTY: OnboardingViralStack = { slots: [] };

let cache: { expiresAt: number; payload: OnboardingViralStack } | null = null;

export function resetOnboardingViralStackCacheForTests(): void {
  cache = null;
}

function httpsUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function youtubeId(externalId: string, pageUrl: string | null): string | null {
  const id = externalId.trim();
  if (/^[A-Za-z0-9_-]{6,}$/.test(id)) return id;
  const page = httpsUrl(pageUrl) ?? "";
  const match =
    page.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{6,})/i)?.[1] ||
    page.match(/[?&]v=([A-Za-z0-9_-]{6,})/i)?.[1] ||
    page.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i)?.[1] ||
    null;
  return match;
}

function fileCandidate(input: {
  platform: "instagram" | "tiktok";
  id: string;
  creatorKey: string;
  durationSec: number | null;
  views: number;
}): OnboardingStackCandidate | null {
  const media = onboardingPreviewMedia(input.platform, input.id);
  if (!media) return null;
  return {
    platform: input.platform,
    id: input.id,
    creatorKey: input.creatorKey,
    thumbnailUrl: media.posterUrl,
    videoUrl: media.videoUrl,
    youtubeVideoId: null,
    durationSec: input.durationSec,
    views: input.views,
  };
}

/**
 * Read the finder catalogs and return five slots. File playback uses the
 * shipped preview loops only, so this request never HEADs or downloads the
 * original R2 videos.
 */
async function loadCandidates(): Promise<OnboardingStackCandidate[]> {
  const db = await getDb();
  if (!db) return [];
  const igAccounts = await db
    .select({
      id: featuredAccounts.id,
      handle: featuredAccounts.handle,
    })
    .from(featuredAccounts)
    .where(
      and(
        eq(featuredAccounts.isActive, true),
        inArray(featuredAccounts.handle, [...PUBLIC_DEMO_HANDLES])
      )
    );

  const candidates: OnboardingStackCandidate[] = [];
  const igPerCreator = new Map<string, number>();

  for (const account of igAccounts) {
    const rows = await db
      .select({
        shortcode: featuredReels.reelShortcode,
        duration: featuredReels.duration,
        viewCount: featuredReels.viewCount,
      })
      .from(featuredReels)
      .where(
        and(
          eq(featuredReels.featuredAccountId, account.id),
          ne(featuredReels.transcriptionStatus, "failed")
        )
      )
      .orderBy(desc(featuredReels.viewCount))
      .limit(SCAN_LIMIT);
    for (const row of rows) {
      if ((igPerCreator.get(account.handle) ?? 0) >= 3) break;
      const candidate = fileCandidate({
        platform: "instagram",
        id: row.shortcode,
        creatorKey: account.handle,
        durationSec: row.duration,
        views: row.viewCount,
      });
      if (!candidate) continue;
      igPerCreator.set(account.handle, (igPerCreator.get(account.handle) ?? 0) + 1);
      candidates.push(candidate);
    }
  }

  const demoAccounts = await db
    .select({
      id: featuredDemoAccounts.id,
      platform: featuredDemoAccounts.platform,
      handle: featuredDemoAccounts.handle,
    })
    .from(featuredDemoAccounts)
    .where(eq(featuredDemoAccounts.isActive, true));

  const allowed = new Set<string>([
    ...FEATURED_DEMO_HANDLES.tiktok.map((handle) => `tiktok:${handle}`),
    ...FEATURED_DEMO_HANDLES.youtube.map((handle) => `youtube:${handle}`),
  ]);
  const demoAllowed = demoAccounts.filter((account) =>
    allowed.has(`${account.platform}:${account.handle}`)
  );
  const demoById = new Map(demoAllowed.map((account) => [account.id, account]));

  async function loadDemo(platform: "tiktok" | "youtube"): Promise<void> {
    const accounts = demoAllowed.filter((account) => account.platform === platform);
    if (accounts.length === 0) return;
    const items = await db!
      .select({
        externalId: featuredDemoItems.externalId,
        thumbnailUrl: featuredDemoItems.thumbnailUrl,
        videoPageUrl: featuredDemoItems.videoPageUrl,
        viewCount: featuredDemoItems.viewCount,
        durationSec: featuredDemoItems.durationSec,
        accountId: featuredDemoItems.accountId,
      })
      .from(featuredDemoItems)
      .where(
        inArray(
          featuredDemoItems.accountId,
          accounts.map((account) => account.id)
        )
      )
      .orderBy(desc(featuredDemoItems.viewCount))
      .limit(SCAN_LIMIT);

    let youtubeKept = 0;
    for (const item of items) {
      const account = demoById.get(item.accountId);
      if (!account) continue;
      if (platform === "tiktok") {
        const candidate = fileCandidate({
          platform: "tiktok",
          id: item.externalId,
          creatorKey: account.handle,
          durationSec: item.durationSec,
          views: item.viewCount,
        });
        if (candidate) candidates.push(candidate);
        continue;
      }
      if (youtubeKept >= 4) continue;
      const thumb = httpsUrl(item.thumbnailUrl);
      const id = youtubeId(item.externalId, item.videoPageUrl);
      if (!thumb || !id) continue;
      youtubeKept += 1;
      candidates.push({
        platform: "youtube",
        id,
        creatorKey: account.handle,
        thumbnailUrl: thumb,
        videoUrl: null,
        youtubeVideoId: id,
        durationSec: item.durationSec,
        views: item.viewCount,
      });
    }
  }

  await loadDemo("tiktok");
  await loadDemo("youtube");
  return candidates;
}

export async function loadOnboardingViralStack(): Promise<OnboardingViralStack> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.payload;

  try {
    const payload = selectOnboardingViralStack(await loadCandidates());
    cache = {
      payload,
      expiresAt: now + (payload.slots.length > 0 ? CACHE_MS : EMPTY_CACHE_MS),
    };
    return payload;
  } catch (err) {
    console.warn(
      "[onboardingPreview.viralStack] catalog read failed:",
      err instanceof Error ? err.message : err
    );
    cache = { payload: EMPTY, expiresAt: now + EMPTY_CACHE_MS };
    return EMPTY;
  }
}
