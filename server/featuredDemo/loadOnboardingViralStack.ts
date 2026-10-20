import { and, desc, eq, inArray, ne } from "drizzle-orm";
import {
  featuredAccounts,
  featuredDemoAccounts,
  featuredDemoItems,
  featuredReels,
} from "../../drizzle/schema";
import { FEATURED_DEMO_HANDLES } from "../../shared/featuredDemoCatalog";
import { isStableSpyreelsMediaUrl, needsVideoUrlRefresh } from "../../shared/mediaUrl";
import {
  selectOnboardingViralStack,
  type OnboardingStackCandidate,
  type OnboardingViralStack,
} from "../../shared/onboardingViralStack";
import { PUBLIC_DEMO_HANDLES } from "../../shared/publicDemoAccounts";
import { getDb } from "../db";
import { isDurableReelVideoUrl, reelVideoR2Key } from "../reelVideoR2";
import { isDurableTiktokVideoUrl, tiktokVideoR2Key } from "../tiktokVideoR2";

const CACHE_MS = 10 * 60 * 1000;
const EMPTY_CACHE_MS = 60 * 1000;
const SCAN_LIMIT = 16;
const MAX_MIRROR_BYTES = 12 * 1024 * 1024;
const HEAD_TIMEOUT_MS = 4000;

const EMPTY: OnboardingViralStack = { slots: [] };

let cache: { expiresAt: number; payload: OnboardingViralStack } | null = null;

export function resetOnboardingViralStackCacheForTests(): void {
  cache = null;
}

function r2PublicBase(): string {
  return (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
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

export function mirrorVideoUrl(
  platform: "instagram" | "tiktok",
  externalId: string,
  publicBase: string
): string | null {
  const base = publicBase.replace(/\/+$/, "");
  const safe = externalId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!base || !safe) return null;
  const key = platform === "instagram" ? reelVideoR2Key(safe) : tiktokVideoR2Key(safe);
  return `${base}/${key}`;
}

function durableFileUrl(
  platform: "instagram" | "tiktok",
  stored: string | null | undefined,
  externalId: string
): string | null {
  const existing = httpsUrl(stored);
  if (existing) {
    const durable =
      platform === "instagram"
        ? isDurableReelVideoUrl(existing)
        : isDurableTiktokVideoUrl(existing);
    if (durable || isStableSpyreelsMediaUrl(existing)) return existing;
    if (!needsVideoUrlRefresh(existing) && /\.r2\.dev\//i.test(existing)) return existing;
  }
  return mirrorVideoUrl(platform, externalId, r2PublicBase());
}

type HeadResult = { ok: boolean; bytes: number | null };

async function headVideo(url: string): Promise<HeadResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (!response.ok) return { ok: false, bytes: null };
    const type = response.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("video/")) return { ok: false, bytes: null };
    const length = Number(response.headers.get("content-length") ?? "");
    const bytes = Number.isFinite(length) && length > 0 ? length : null;
    if (bytes != null && bytes > MAX_MIRROR_BYTES) return { ok: false, bytes };
    return { ok: true, bytes };
  } catch {
    return { ok: false, bytes: null };
  } finally {
    clearTimeout(timer);
  }
}

async function confirmFile(
  url: string | null,
  confirmed: Map<string, boolean>
): Promise<boolean> {
  if (!url) return false;
  const known = confirmed.get(url);
  if (known != null) return known;
  const result = await headVideo(url);
  confirmed.set(url, result.ok);
  return result.ok;
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

  const igRows: Array<{
    id: number;
    shortcode: string;
    thumbnailUrl: string | null;
    videoUrl: string | null;
    viewCount: number;
    duration: number | null;
    accountId: number;
  }> = [];
  for (const account of igAccounts) {
    const rows = await db
      .select({
        id: featuredReels.id,
        shortcode: featuredReels.reelShortcode,
        thumbnailUrl: featuredReels.thumbnailUrl,
        videoUrl: featuredReels.videoUrl,
        viewCount: featuredReels.viewCount,
        duration: featuredReels.duration,
        accountId: featuredReels.featuredAccountId,
      })
      .from(featuredReels)
      .where(
        and(
          eq(featuredReels.featuredAccountId, account.id),
          ne(featuredReels.transcriptionStatus, "failed")
        )
      )
      .orderBy(desc(featuredReels.viewCount))
      .limit(4);
    igRows.push(...rows);
  }

  const handleByAccount = new Map(igAccounts.map((account) => [account.id, account.handle]));
  const confirmed = new Map<string, boolean>();
  const candidates: OnboardingStackCandidate[] = [];
  const igPerCreator = new Map<string, number>();
  let igHeads = 0;

  for (const row of igRows) {
    if (igHeads >= 12) break;
    const creator = handleByAccount.get(row.accountId) ?? row.shortcode;
    if ((igPerCreator.get(creator) ?? 0) >= 3) continue;
    const thumb = httpsUrl(row.thumbnailUrl);
    if (!thumb) continue;
    const videoUrl = durableFileUrl("instagram", row.videoUrl, row.shortcode);
    igHeads += 1;
    if (!(await confirmFile(videoUrl, confirmed))) continue;
    igPerCreator.set(creator, (igPerCreator.get(creator) ?? 0) + 1);
    candidates.push({
      platform: "instagram",
      id: row.shortcode,
      creatorKey: handleByAccount.get(row.accountId) ?? row.shortcode,
      thumbnailUrl: thumb,
      videoUrl,
      youtubeVideoId: null,
      durationSec: row.duration,
      views: row.viewCount,
    });
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

  if (demoAllowed.length === 0) return candidates;

  const items = await db
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
        demoAllowed.map((account) => account.id)
      )
    )
    .orderBy(desc(featuredDemoItems.viewCount))
    .limit(SCAN_LIMIT * 2);

  const demoById = new Map(demoAllowed.map((account) => [account.id, account]));
  let tiktokConfirmed = 0;
  let youtubeKept = 0;

  for (const item of items) {
    const account = demoById.get(item.accountId);
    if (!account) continue;
    const thumb = httpsUrl(item.thumbnailUrl);
    if (!thumb) continue;

    if (account.platform === "tiktok") {
      if (tiktokConfirmed >= 6) continue;
      const videoUrl = durableFileUrl("tiktok", null, item.externalId);
      if (!(await confirmFile(videoUrl, confirmed))) continue;
      tiktokConfirmed += 1;
      candidates.push({
        platform: "tiktok",
        id: item.externalId,
        creatorKey: account.handle,
        thumbnailUrl: thumb,
        videoUrl,
        youtubeVideoId: null,
        durationSec: item.durationSec,
        views: item.viewCount,
      });
      continue;
    }

    if (account.platform === "youtube") {
      if (youtubeKept >= 4) continue;
      const id = youtubeId(item.externalId, item.videoPageUrl);
      if (!id) continue;
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
