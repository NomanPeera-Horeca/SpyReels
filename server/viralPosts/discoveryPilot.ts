/**
 * Discovery repair pilot (off by default).
 *
 * Runs only when BOTH are true: DISCOVERY_PILOT_RUNNER=on on the Queue Worker
 * AND a viral_discovery_pilots row is set to 'ready'. It tests repaired
 * discovery routes per topic and platform and records every result in its own
 * tables (migration 0115). It never writes to the library, pools or keyword
 * bank, and it does not change production discovery or scoring (the keyword
 * bank is read with the current scoring).
 *
 * Budget: one hard cap for all paid activity (provider requests including the
 * integrations' own retries, AI topic checks, baseline lookups, retries and
 * second-view checks). Each platform has a protected share; each topic gets an
 * equal part of its platform's remaining share. Provider requests are blocked
 * by the shared request meter before they are sent; an AI check runs only when
 * its worst-case cost fits. When the money runs out the pilot records a
 * partial result instead of spending more.
 *
 * Routes
 *   Instagram: ig_reels_search (/v2/instagram/reels/search, real phrases),
 *     ig_hashtag (only hashtags already seen on viral videos of the topic),
 *     ig_known_creators, ig_new_creators (topic-matched creators found by search).
 *   YouTube: yt_search_recent (this month), yt_search_evergreen (all time),
 *     yt_known_channels, yt_new_channels (by stable channel ID when known).
 *   TikTok (reference): tt_search, tt_known_creators, tt_new_creators.
 *   Shared: baseline_lookup, second_view, retry_baseline, ai_topic_check.
 * No unrelated-account fallback: a creator is scanned only when it is known
 * for the topic or one of its videos passed the topic check.
 *
 * Verdicts (same viral rule as the library, shared/viralRule.ts)
 *   off_topic | not_checked (topic check skipped: budget) | not_viral |
 *   viral | pending_growth (rising by the rule, waiting for a second view) |
 *   rising (growth confirmed) | not_rising | pending_baseline (usual views
 *   unknown) | growth_check_failed.
 */
import { sql } from "drizzle-orm";
import { createClaudeClient } from "../_core/claudeClient";
import { getDb } from "../db";
import { extractInstagramSearchRows, parseInstagramSearchPost, scrapeReels, searchHashtagReels, searchInstagramKeywordReels } from "../instagram";
import { scrapeCreatorsUsdPerCredit, withScrapeCreatorsMeter } from "../scrapeCreatorsMeter";
import { scrapeTikTokVideos, searchTikTokKeyword } from "../tiktok";
import { fetchChannelShortsByIdOrHandle, searchYouTubeShortsRaw } from "../youtube";
import { classifyVirality, usualViewsFromRecent, VIRAL_RULE } from "../../shared/viralRule";
import { pickKeywords, type KeywordStats } from "./keywords";
import { clipForPrompt, SEMANTIC_POOL_MODEL } from "./semanticPoolRelevance";
import { parseYouTubeSearchShort } from "./youtubePoolDiscovery";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type PilotPlatform = "instagram" | "youtube" | "tiktok";
export const PILOT_PLATFORMS: readonly PilotPlatform[] = ["instagram", "youtube", "tiktok"];

/* ---------- definitions fixed before testing ---------- */

export type PilotTopic = { label: string; definition: string; include: string; exclude: string };

export const PILOT_TOPICS: readonly PilotTopic[] = [
  {
    label: "home buying tips",
    definition: "Practical advice for people buying a home.",
    include:
      "saving for a down payment, mortgages and pre-approval, credit for buying a home, closing costs, inspections, first-time buyer programs and loans (FHA, VA), offers and negotiating, mistakes buyers make, what to do before or after buying",
    exclude:
      "house or listing tours without buying advice, luxury home showcases, renting advice, general personal finance not about buying a home, agent self-promotion without advice, home decor or renovation",
  },
  {
    label: "gym workouts",
    definition: "Exercises and training routines done in a gym.",
    include:
      "exercise form and technique, workout programs and splits, machine, barbell, dumbbell and cable exercises, progressive overload, how to train a muscle group, beginner gym routines",
    exclude:
      "home or bodyweight-only workouts without gym equipment, diet or nutrition-only content, supplement adverts, gym humour or skits without training content, physique posing without workout information, sports matches",
  },
  {
    label: "restaurant marketing",
    definition: "Content that helps restaurant, cafe or bar owners attract and keep customers.",
    include:
      "social media for restaurants, promotions and offers, local marketing, reviews and reputation, menu design that sells, loyalty programs, delivery-app visibility, grand openings, events that bring customers in, case studies of restaurants that grew their customers",
    exclude:
      "recipes and cooking videos, food reviews, mukbang or diners eating, restaurant tours from a customer's point of view, kitchen operations or cost control not about attracting customers, general business advice not about restaurants",
  },
];

/** Protected share of the total cap per platform. TikTok is the reference, not the main spend. */
export const PILOT_SHARES: Readonly<Record<PilotPlatform, number>> = { instagram: 0.4, youtube: 0.4, tiktok: 0.2 };

/** Growth rule for "rising", fixed before testing. */
export const GROWTH_RULE = {
  /** Second view count no sooner than this after the first. */
  minIntervalHours: 24,
  /** Give up on the second view after this long (label growth_check_failed). */
  maxWaitHours: 96,
  /** Views must grow at least 25% between the two counts... */
  minGrowthRatio: 1.25,
  /** ...and by at least 1,000 views. */
  minGainViews: 1_000,
} as const;

/** Hard ceiling for any pilot's total cap (the owner approved $5). */
export function PILOT_MAX_CAP_USD(): number {
  const fromEnv = Number(process.env.DISCOVERY_PILOT_MAX_USD);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? Math.min(fromEnv, 5) : 5;
}

/** Published within this many days before it was found = recent; older = evergreen. */
export const RECENT_DAYS = 30;

/** Steps per topic and platform. */
export const PILOT_PLAN = {
  phrases: 4,
  hashtags: 3,
  knownCreators: 5,
  newCreators: 5,
  baselineLookups: 10,
  topicChecks: 120,
  /** Provider requests allowed per step, including the integration's own retries. */
  searchRequests: 3,
  scanRequests: 4,
} as const;

/** AI topic check: Haiku, batches of 12, priced from the reported usage. */
export const PILOT_AI = { batch: 12, reserveUsd: 0.02, inputUsdPerM: 1, outputUsdPerM: 5 } as const;

/* ---------- pure helpers (exported for tests) ---------- */

/** Platform caps that add up exactly to the total (cents, rounded down, remainder to Instagram). */
export function pilotCaps(totalUsd: number): Record<PilotPlatform, number> {
  const cents = Math.round(totalUsd * 100);
  const yt = Math.floor(cents * PILOT_SHARES.youtube);
  const tt = Math.floor(cents * PILOT_SHARES.tiktok);
  return { instagram: (cents - yt - tt) / 100, youtube: yt / 100, tiktok: tt / 100 };
}

/** Equal part of what is left for the topics not yet run on this platform. */
export function cellBudgetUsd(platformRemainingUsd: number, cellsLeft: number): number {
  if (platformRemainingUsd <= 0 || cellsLeft <= 0) return 0;
  return Math.floor((platformRemainingUsd / cellsLeft) * 10_000) / 10_000;
}

export function recencyOf(publishedAt: Date | null, foundAt: Date): "recent" | "evergreen" | "undated" {
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return "undated";
  return foundAt.getTime() - publishedAt.getTime() <= RECENT_DAYS * 86_400_000 ? "recent" : "evergreen";
}

/**
 * Second-view decision for a video the viral rule called rising.
 * verdictAtSecond: the viral rule applied to the second count.
 */
export function growthDecision(args: {
  views1: number;
  views1At: Date;
  views2: number | null;
  views2At: Date;
  verdictAtSecond: "viral" | "rising" | "not_viral" | "unknown";
}): "wait" | "viral" | "rising" | "not_rising" | "growth_check_failed" {
  const hours = (args.views2At.getTime() - args.views1At.getTime()) / 3_600_000;
  if (hours < GROWTH_RULE.minIntervalHours) return "wait";
  if (args.views2 == null) return hours >= GROWTH_RULE.maxWaitHours ? "growth_check_failed" : "wait";
  if (args.verdictAtSecond === "viral") return "viral";
  const grew = args.views2 >= args.views1 * GROWTH_RULE.minGrowthRatio && args.views2 - args.views1 >= GROWTH_RULE.minGainViews;
  return grew && args.verdictAtSecond === "rising" ? "rising" : "not_rising";
}

const GENERIC_TAGS = new Set([
  "fyp", "foryou", "foryoupage", "fy", "fypシ", "viral", "viralvideo", "trending", "trend", "reels", "reel", "explore",
  "explorepage", "instagram", "tiktok", "youtube", "shorts", "short", "capcut", "xyzbca", "video", "follow", "like",
]);

/** Hashtags that appear on at least `minVideos` of the topic's viral videos (never made up from the topic name). */
export function realHashtags(captions: readonly string[], minVideos = 3, max = 10): string[] {
  const counts = new Map<string, number>();
  for (const caption of captions) {
    const tags = new Set((caption.toLowerCase().match(/#[\p{L}\p{N}_]+/gu) ?? []).map(t => t.slice(1)));
    for (const tag of tags) if (!GENERIC_TAGS.has(tag) && tag.length >= 3) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= minVideos)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([t]) => t);
}

export function aiUsd(usage: { input_tokens?: number; output_tokens?: number } | null | undefined): number {
  if (!usage || usage.input_tokens == null || usage.output_tokens == null) return PILOT_AI.reserveUsd;
  return (usage.input_tokens * PILOT_AI.inputUsdPerM + usage.output_tokens * PILOT_AI.outputUsdPerM) / 1_000_000;
}

export function normalizeHandle(value: string | null | undefined): string | null {
  const h = (value ?? "").trim().replace(/^@/, "").toLowerCase();
  return h ? h : null;
}

/* ---------- in-memory cell state ---------- */

type Item = {
  sourceId: string;
  url: string;
  caption: string;
  creatorHandle: string | null;
  channelId: string | null;
  routes: Set<string>;
  query: string | null;
  publishedAt: Date | null;
  followers: number | null;
  views1: number | null;
  views1At: Date;
  topicVerdict: "pending" | "relevant" | "rejected" | "not_checked";
  topicReason: string | null;
  usualViews: number | null;
  baselineSource: string | null;
  verdict: string;
  multiple: number | null;
  inLibraryBefore: boolean;
};

type Creator = { handle: string; channelId: string | null; knownBefore: boolean; foundBy: string; topicMatch: boolean; scanned: boolean; usualViews: number | null };

type Cell = {
  pilotId: number;
  topicSlug: string;
  topic: PilotTopic;
  platform: PilotPlatform;
  remainingUsd: number;
  exhausted: boolean;
  items: Map<string, Item>;
  creators: Map<string, Creator>;
};

type Found = {
  sourceId: string;
  url: string;
  caption: string;
  creatorHandle: string | null;
  channelId?: string | null;
  publishedAt: Date | null;
  views: number | null;
  followers?: number | null;
};

function addFound(cell: Cell, route: string, f: Found, query: string | null, now: Date): void {
  if (!f.sourceId) return;
  const existing = cell.items.get(f.sourceId);
  if (existing) {
    existing.routes.add(route);
    if (existing.views1 == null && f.views != null) existing.views1 = f.views;
    if (!existing.channelId && f.channelId) existing.channelId = f.channelId;
    if (!existing.creatorHandle && f.creatorHandle) existing.creatorHandle = normalizeHandle(f.creatorHandle);
    return;
  }
  cell.items.set(f.sourceId, {
    sourceId: f.sourceId,
    url: f.url.slice(0, 512),
    caption: (f.caption ?? "").slice(0, 600),
    creatorHandle: normalizeHandle(f.creatorHandle),
    channelId: f.channelId ?? null,
    routes: new Set([route]),
    query,
    publishedAt: f.publishedAt,
    followers: f.followers ?? null,
    views1: f.views,
    views1At: now,
    topicVerdict: "pending",
    topicReason: null,
    usualViews: null,
    baselineSource: null,
    verdict: "pending_topic",
    multiple: null,
    inLibraryBefore: false,
  });
}

/* ---------- budgeted calls ---------- */

async function recordSpend(db: Db, cell: Pick<Cell, "pilotId" | "platform" | "topicSlug">, route: string, kind: "sc" | "ai", requests: number, blocked: number, usd: number, detail: string): Promise<void> {
  const rounded = Math.round(usd * 10_000) / 10_000;
  await db.execute(sql`
    INSERT INTO viral_discovery_pilot_calls (pilotId, platform, topicSlug, route, kind, requests, blocked, usd, detail)
    VALUES (${cell.pilotId}, ${cell.platform}, ${cell.topicSlug}, ${route}, ${kind}, ${requests}, ${blocked}, ${rounded}, ${detail.slice(0, 255)})
  `);
  if (rounded <= 0) return;
  if (cell.platform === "instagram") await db.execute(sql`UPDATE viral_discovery_pilots SET instagramUsd = instagramUsd + ${rounded} WHERE id = ${cell.pilotId}`);
  else if (cell.platform === "youtube") await db.execute(sql`UPDATE viral_discovery_pilots SET youtubeUsd = youtubeUsd + ${rounded} WHERE id = ${cell.pilotId}`);
  else await db.execute(sql`UPDATE viral_discovery_pilots SET tiktokUsd = tiktokUsd + ${rounded} WHERE id = ${cell.pilotId}`);
}

/** Run one provider step inside the request meter; never more requests than the money left allows. */
async function paid<T>(db: Db, cell: Cell, route: string, detail: string, maxRequests: number, fn: () => Promise<T>): Promise<T | null> {
  const perCall = scrapeCreatorsUsdPerCredit();
  const allowed = Math.min(maxRequests, Math.floor(cell.remainingUsd / perCall + 1e-9));
  if (allowed <= 0) {
    cell.exhausted = true;
    return null;
  }
  const r = await withScrapeCreatorsMeter(allowed, fn);
  const usd = r.report.requests * perCall;
  cell.remainingUsd -= usd;
  const statuses = Object.entries(r.report.byStatus).map(([s, n]) => `${s}x${n}`).join(",");
  const failed = "error" in r ? ` error=${r.error instanceof Error ? r.error.message : String(r.error)}` : "";
  await recordSpend(db, cell, route, "sc", r.report.requests, r.report.blockedByBudget, usd, `${detail} [${statuses}]${failed}`);
  if (r.report.blockedByBudget > 0) cell.exhausted = true;
  return "error" in r ? null : r.result;
}

/* ---------- topic check ---------- */

function topicPrompt(topic: PilotTopic): string {
  return `You check whether short-form videos match one topic for a creator-inspiration library.

Topic: ${topic.label}
Definition: ${topic.definition}
Counts as on-topic: ${topic.include}
Does NOT count: ${topic.exclude}

Judge the video's main subject from its caption and creator name. Mark relevant only when the main subject clearly fits the definition. When the caption is too thin to tell, mark it not relevant and say why. Be strict: an adjacent subject is not relevant.

Return ONLY JSON: {"items":[{"id":"...","relevant":true,"reason":"under 20 words"}]} with one entry per id.`;
}

async function topicCheck(db: Db, cell: Cell, items: Item[]): Promise<void> {
  if (items.length === 0) return;
  const client = createClaudeClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  for (let i = 0; i < items.length; i += PILOT_AI.batch) {
    const batch = items.slice(i, i + PILOT_AI.batch);
    if (cell.remainingUsd < PILOT_AI.reserveUsd) {
      cell.exhausted = true;
      for (const it of items.slice(i)) if (it.topicVerdict === "pending") it.topicVerdict = "not_checked";
      return;
    }
    const lines = batch
      .map(it => `- id: ${it.sourceId}\n  creator: ${it.creatorHandle ?? "(unknown)"}\n  caption: ${clipForPrompt(it.caption, 400) || "(none)"}`)
      .join("\n");
    let usd: number = PILOT_AI.reserveUsd;
    let detail = `${batch.length} videos`;
    try {
      const response = await client.messages.create({
        model: SEMANTIC_POOL_MODEL,
        max_tokens: 1500,
        temperature: 0,
        system: topicPrompt(cell.topic),
        messages: [{ role: "user", content: `Videos (${cell.platform}):\n${lines}` }],
      });
      usd = aiUsd(response.usage as { input_tokens?: number; output_tokens?: number } | undefined);
      const text = response.content.find(b => b.type === "text");
      const raw = text && text.type === "text" ? text.text.replace(/^```(?:json)?\s*|\s*```$/g, "") : "";
      const parsed = JSON.parse(raw) as { items?: Array<{ id?: unknown; relevant?: unknown; reason?: unknown }> };
      const byId = new Map((parsed.items ?? []).map(x => [String(x.id), x]));
      for (const it of batch) {
        const v = byId.get(it.sourceId);
        if (!v) {
          it.topicVerdict = "not_checked";
          it.topicReason = "no answer from topic check";
          continue;
        }
        it.topicVerdict = v.relevant === true ? "relevant" : "rejected";
        it.topicReason = String(v.reason ?? "").slice(0, 255);
      }
    } catch (err) {
      detail += ` failed: ${err instanceof Error ? err.message : String(err)}`;
      for (const it of batch) {
        it.topicVerdict = "not_checked";
        it.topicReason = "topic check failed";
      }
    }
    cell.remainingUsd -= usd;
    await recordSpend(db, cell, "ai_topic_check", "ai", 0, 0, usd, detail);
  }
}

/* ---------- platform fetchers (all inside paid()) ---------- */

function youtubeRows(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  return [...(Array.isArray(root.shorts) ? root.shorts : []), ...(Array.isArray(root.videos) ? root.videos : [])];
}

function youtubeFound(row: unknown): Found | null {
  const parsed = parseYouTubeSearchShort(row);
  if (!parsed) return null;
  const raw = row as Record<string, unknown>;
  const channel = raw.channel && typeof raw.channel === "object" ? (raw.channel as Record<string, unknown>) : {};
  const channelId = String(channel.id ?? channel.channelId ?? raw.channelId ?? "").trim() || null;
  const handle = String(channel.handle ?? raw.channelHandle ?? "").trim() || null;
  return {
    sourceId: parsed.videoId,
    url: parsed.videoPageUrl,
    caption: [parsed.title, parsed.description].filter(Boolean).join(" "),
    creatorHandle: handle,
    channelId,
    publishedAt: parsed.postedAt,
    views: parsed.viewCount || null,
  };
}

type Scan = { videos: Found[]; usualViews: number | null; followers: number | null };

async function scanCreator(db: Db, cell: Cell, route: string, creator: { handle: string | null; channelId?: string | null }): Promise<Scan | null> {
  const label = creator.channelId ? `channel ${creator.channelId}` : `@${creator.handle}`;
  if (cell.platform === "instagram") {
    if (!creator.handle) return null;
    const res = await paid(db, cell, route, label, PILOT_PLAN.scanRequests, () =>
      scrapeReels(creator.handle!, 120, undefined, { maxReels: 12, timeoutMs: 60_000 })
    );
    if (!res) return null;
    const videos: Found[] = res.reels.map(r => ({
      sourceId: r.shortcode,
      url: r.reelUrl || `https://www.instagram.com/reel/${r.shortcode}/`,
      caption: r.caption,
      creatorHandle: r.ownerUsername || creator.handle,
      publishedAt: r.postedAt ?? null,
      views: r.viewCount || null,
      followers: res.followerCount || null,
    }));
    return { videos, usualViews: usualViewsFromRecent(videos.map(v => ({ views: v.views, postedAt: v.publishedAt })))?.usualViews ?? null, followers: res.followerCount || null };
  }
  if (cell.platform === "tiktok") {
    if (!creator.handle) return null;
    const res = await paid(db, cell, route, label, PILOT_PLAN.scanRequests, () =>
      scrapeTikTokVideos(creator.handle!, undefined, { maxVideos: 12, timeoutMs: 60_000 })
    );
    if (!res) return null;
    const videos: Found[] = res.videos.map(v => ({
      sourceId: v.awemeId,
      url: v.videoPageUrl,
      caption: v.caption,
      creatorHandle: v.ownerUsername || creator.handle,
      publishedAt: v.postedAt ?? null,
      views: v.viewCount || null,
      followers: res.followerCount || null,
    }));
    return { videos, usualViews: usualViewsFromRecent(videos.map(v => ({ views: v.views, postedAt: v.publishedAt })))?.usualViews ?? null, followers: res.followerCount || null };
  }
  const shorts = await paid(db, cell, route, label, 1, () => fetchChannelShortsByIdOrHandle({ channelId: creator.channelId, handle: creator.handle }));
  if (!shorts) return null;
  const videos: Found[] = shorts.map(s => ({
    sourceId: s.videoId,
    url: s.videoPageUrl,
    caption: [s.title, s.description].filter(Boolean).join(" "),
    creatorHandle: creator.handle,
    channelId: creator.channelId ?? null,
    publishedAt: s.postedAt,
    views: s.viewCount || null,
  }));
  return { videos, usualViews: usualViewsFromRecent(videos.map(v => ({ views: v.views, postedAt: v.publishedAt })))?.usualViews ?? null, followers: null };
}

async function searchRoute(db: Db, cell: Cell, phrases: string[], hashtags: string[], now: Date): Promise<void> {
  const p = cell.platform;
  if (p === "instagram") {
    for (const phrase of phrases) {
      const res = await paid(db, cell, "ig_reels_search", phrase, PILOT_PLAN.searchRequests, () => searchInstagramKeywordReels(phrase, { datePosted: "last-month" }));
      for (const post of res?.posts ?? []) {
        addFound(cell, "ig_reels_search", { sourceId: post.shortcode, url: post.sourceUrl, caption: post.caption, creatorHandle: post.ownerUsername, publishedAt: post.publishedAt, views: post.views, followers: post.ownerFollowerCount }, phrase, now);
      }
    }
    for (const tag of hashtags) {
      const res = await paid(db, cell, "ig_hashtag", `#${tag}`, PILOT_PLAN.searchRequests, () => searchHashtagReels(tag));
      const posts = res?.success ? extractInstagramSearchRows(res.data).map(parseInstagramSearchPost).filter(x => x !== null) : [];
      for (const post of posts) {
        addFound(cell, "ig_hashtag", { sourceId: post.shortcode, url: post.sourceUrl, caption: post.caption, creatorHandle: post.ownerUsername, publishedAt: post.publishedAt, views: post.views, followers: post.ownerFollowerCount }, `#${tag}`, now);
      }
    }
    return;
  }
  if (p === "youtube") {
    for (const phrase of phrases) {
      for (const [route, filters] of [
        ["yt_search_recent", { type: "shorts", uploadDate: "this_month" }],
        ["yt_search_evergreen", { type: "shorts" }],
      ] as const) {
        const data = await paid(db, cell, route, phrase, 1, () => searchYouTubeShortsRaw(phrase, filters));
        for (const row of youtubeRows(data)) {
          const f = youtubeFound(row);
          if (f) addFound(cell, route, f, phrase, now);
        }
      }
    }
    return;
  }
  for (const phrase of phrases) {
    const res = await paid(db, cell, "tt_search", phrase, PILOT_PLAN.searchRequests, () => searchTikTokKeyword(phrase));
    for (const v of res?.videos ?? []) {
      addFound(cell, "tt_search", { sourceId: v.awemeId, url: v.videoPageUrl, caption: v.caption, creatorHandle: v.ownerUsername, publishedAt: v.postedAt ?? null, views: v.viewCount || null, followers: v.creatorFollowerCount ?? null }, phrase, now);
    }
  }
}

/* ---------- library reads (no writes) ---------- */

async function topicSlugFor(db: Db, label: string): Promise<string | null> {
  const [rows] = (await db.execute(sql`SELECT slug FROM viral_topics WHERE LOWER(label) = ${label.toLowerCase()} ORDER BY createdAt LIMIT 1`)) as unknown as [Array<{ slug: string }>];
  return rows?.[0]?.slug ?? null;
}

async function knownTopicCreators(db: Db, topicSlug: string, platform: PilotPlatform): Promise<{ handles: string[]; captions: string[] }> {
  const [rows] = (await db.execute(sql`
    SELECT c.creatorHandle AS handle, c.caption AS caption
    FROM viral_video_topics vt
    JOIN viral_post_candidates c ON c.id = vt.candidateId
    JOIN viral_library_status s ON s.candidateId = c.id
    WHERE vt.topicSlug = ${topicSlug} AND c.platform = ${platform} AND s.status IN ('viral', 'rising')
    LIMIT 500
  `)) as unknown as [Array<{ handle: string | null; caption: string | null }>];
  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    const h = normalizeHandle(r.handle);
    if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return {
    handles: [...counts].sort((a, b) => b[1] - a[1]).map(([h]) => h),
    captions: (rows ?? []).map(r => r.caption ?? ""),
  };
}

async function bankPhrases(db: Db, topicSlug: string, platform: PilotPlatform, count: number): Promise<string[]> {
  const [rows] = (await db.execute(sql`
    SELECT phrase, demand, runs, found, passed, viral, creatorsFound, goodCreators
    FROM viral_keywords WHERE topicSlug = ${topicSlug} AND platform = ${platform} AND retired = 0
    ORDER BY demand DESC LIMIT 200
  `)) as unknown as [Array<KeywordStats & { phrase: string }>];
  const typed = (rows ?? []).map(r => ({ ...r, demand: Number(r.demand), runs: Number(r.runs), found: Number(r.found), passed: Number(r.passed), viral: Number(r.viral), creatorsFound: Number(r.creatorsFound), goodCreators: Number(r.goodCreators) }));
  return pickKeywords(typed, count).map(r => r.phrase);
}

async function cachedBaselines(db: Db, platform: PilotPlatform, handles: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (handles.length === 0) return out;
  const list = sql.join(handles.flatMap(h => [sql`${h}`, sql`${`@${h}`}`]), sql`, `);
  const [rows] = (await db.execute(sql`SELECT handle, usualViews FROM viral_creator_baselines WHERE platform = ${platform} AND handle IN (${list})`)) as unknown as [Array<{ handle: string; usualViews: number }>];
  for (const r of rows ?? []) {
    const h = normalizeHandle(r.handle);
    if (h && Number(r.usualViews) > 0) out.set(h, Number(r.usualViews));
  }
  return out;
}

async function libraryFacts(db: Db, platform: PilotPlatform, sourceIds: string[], before: Date, handles: string[]): Promise<{ inLibrary: Set<string>; knownHandles: Set<string> }> {
  const inLibrary = new Set<string>();
  const knownHandles = new Set<string>();
  for (let i = 0; i < sourceIds.length; i += 300) {
    const part = sql.join(sourceIds.slice(i, i + 300).map(s => sql`${s}`), sql`, `);
    const [rows] = (await db.execute(sql`SELECT sourceId FROM viral_post_candidates WHERE platform = ${platform} AND sourceId IN (${part}) AND createdAt < ${before}`)) as unknown as [Array<{ sourceId: string }>];
    for (const r of rows ?? []) inLibrary.add(String(r.sourceId));
  }
  for (let i = 0; i < handles.length; i += 300) {
    const part = sql.join(handles.slice(i, i + 300).flatMap(h => [sql`${h}`, sql`${`@${h}`}`]), sql`, `);
    const [rows] = (await db.execute(sql`SELECT DISTINCT creatorHandle FROM viral_post_candidates WHERE platform = ${platform} AND creatorHandle IN (${part}) AND createdAt < ${before}`)) as unknown as [Array<{ creatorHandle: string }>];
    for (const r of rows ?? []) {
      const h = normalizeHandle(r.creatorHandle);
      if (h) knownHandles.add(h);
    }
  }
  return { inLibrary, knownHandles };
}

/* ---------- verdicts ---------- */

function applyRule(item: Item, platform: PilotPlatform, now: Date): void {
  if (item.topicVerdict === "rejected") {
    item.verdict = "off_topic";
    return;
  }
  if (item.topicVerdict !== "relevant") {
    item.verdict = "not_checked";
    return;
  }
  if (item.views1 == null) {
    item.verdict = "pending_baseline";
    return;
  }
  if (item.views1 < VIRAL_RULE.risingMinViews) {
    item.verdict = "not_viral";
    return;
  }
  const verdict = classifyVirality({ platform, views: item.views1, followers: item.followers, usualViews: item.usualViews, publishedAt: item.publishedAt, now });
  item.multiple = verdict.multiple;
  if (item.usualViews == null && verdict.basis === "followers") item.baselineSource = "followers";
  item.verdict =
    verdict.status === "viral" ? "viral" : verdict.status === "rising" ? "pending_growth" : verdict.status === "not_viral" ? "not_viral" : "pending_baseline";
}

/* ---------- one topic on one platform ---------- */

const NEW_ROUTE: Record<PilotPlatform, string> = { instagram: "ig_new_creators", youtube: "yt_new_channels", tiktok: "tt_new_creators" };
const KNOWN_ROUTE: Record<PilotPlatform, string> = { instagram: "ig_known_creators", youtube: "yt_known_channels", tiktok: "tt_known_creators" };

export async function runPilotCell(db: Db, args: { pilotId: number; startedAt: Date; topic: PilotTopic; platform: PilotPlatform; budgetUsd: number; now?: Date }): Promise<{ items: number; usd: number; exhausted: boolean; note: string }> {
  const now = args.now ?? new Date();
  const topicSlug = await topicSlugFor(db, args.topic.label);
  if (!topicSlug) return { items: 0, usd: 0, exhausted: false, note: `no topic "${args.topic.label}"` };
  const cell: Cell = { pilotId: args.pilotId, topicSlug, topic: args.topic, platform: args.platform, remainingUsd: args.budgetUsd, exhausted: false, items: new Map(), creators: new Map() };
  const start = cell.remainingUsd;

  const known = await knownTopicCreators(db, topicSlug, args.platform);
  const phrases = await bankPhrases(db, topicSlug, args.platform, PILOT_PLAN.phrases);
  const hashtags = args.platform === "instagram" ? realHashtags(known.captions).slice(0, PILOT_PLAN.hashtags) : [];

  // 1. Search routes.
  await searchRoute(db, cell, phrases, hashtags, now);

  // 2. Topic check on search results (most-viewed first), then scan new topic-matched creators.
  const searchItems = [...cell.items.values()].sort((a, b) => (b.views1 ?? 0) - (a.views1 ?? 0)).slice(0, PILOT_PLAN.topicChecks);
  await topicCheck(db, cell, searchItems);
  const searchHandles = [...new Set(searchItems.map(i => i.creatorHandle).filter((h): h is string => Boolean(h)))];
  const facts0 = await libraryFacts(db, args.platform, [], args.startedAt, searchHandles);
  const knownSet = new Set([...known.handles, ...facts0.knownHandles]);
  const newCandidates = new Map<string, { handle: string; channelId: string | null; views: number }>();
  for (const it of searchItems) {
    if (it.topicVerdict !== "relevant") continue;
    const key = it.channelId ?? it.creatorHandle;
    if (!key || (it.creatorHandle && knownSet.has(it.creatorHandle))) continue;
    const prev = newCandidates.get(key);
    if (!prev || (it.views1 ?? 0) > prev.views) newCandidates.set(key, { handle: it.creatorHandle ?? key, channelId: it.channelId, views: it.views1 ?? 0 });
  }
  const scans = new Map<string, Scan>();
  for (const c of [...newCandidates.values()].sort((a, b) => b.views - a.views).slice(0, PILOT_PLAN.newCreators)) {
    const scan = await scanCreator(db, cell, NEW_ROUTE[args.platform], { handle: c.handle, channelId: c.channelId });
    cell.creators.set(c.handle, { handle: c.handle, channelId: c.channelId, knownBefore: false, foundBy: "search", topicMatch: true, scanned: Boolean(scan), usualViews: scan?.usualViews ?? null });
    if (!scan) continue;
    scans.set(c.handle, scan);
    for (const v of scan.videos) addFound(cell, NEW_ROUTE[args.platform], { ...v, creatorHandle: v.creatorHandle ?? c.handle, channelId: c.channelId }, null, now);
  }

  // 3. Known topic creators from the library.
  for (const handle of known.handles.slice(0, PILOT_PLAN.knownCreators)) {
    const scan = await scanCreator(db, cell, KNOWN_ROUTE[args.platform], { handle });
    cell.creators.set(handle, { handle, channelId: null, knownBefore: true, foundBy: "library", topicMatch: true, scanned: Boolean(scan), usualViews: scan?.usualViews ?? null });
    if (!scan) continue;
    scans.set(handle, scan);
    for (const v of scan.videos) addFound(cell, KNOWN_ROUTE[args.platform], { ...v, creatorHandle: v.creatorHandle ?? handle }, null, now);
  }

  // 4. Topic check on what the scans added.
  const unchecked = [...cell.items.values()].filter(i => i.topicVerdict === "pending").sort((a, b) => (b.views1 ?? 0) - (a.views1 ?? 0));
  const room = Math.max(0, PILOT_PLAN.topicChecks * 2 - searchItems.length);
  await topicCheck(db, cell, unchecked.slice(0, room));
  for (const it of unchecked.slice(room)) it.topicVerdict = "not_checked";

  // 5. Usual views: this pilot's scans, then the library's cached baselines, then a paid lookup.
  const allHandles = [...new Set([...cell.items.values()].map(i => i.creatorHandle).filter((h): h is string => Boolean(h)))];
  const cached = await cachedBaselines(db, args.platform, allHandles);
  let lookups = 0;
  for (const it of [...cell.items.values()].sort((a, b) => (b.views1 ?? 0) - (a.views1 ?? 0))) {
    const h = it.creatorHandle;
    const fromScan = h ? scans.get(h)?.usualViews : null;
    if (fromScan) {
      it.usualViews = fromScan;
      it.baselineSource = "pilot_scan";
    } else if (h && cached.has(h)) {
      it.usualViews = cached.get(h)!;
      it.baselineSource = "library_cache";
    } else if (it.topicVerdict === "relevant" && (it.views1 ?? 0) >= VIRAL_RULE.risingMinViews && (h || it.channelId) && lookups < PILOT_PLAN.baselineLookups) {
      lookups += 1;
      const scan = await scanCreator(db, cell, "baseline_lookup", { handle: h, channelId: it.channelId });
      if (scan) {
        if (h) scans.set(h, scan);
        if (scan.usualViews) {
          it.usualViews = scan.usualViews;
          it.baselineSource = "pilot_lookup";
        }
        if (scan.followers && it.followers == null) it.followers = scan.followers;
      }
    }
    applyRule(it, args.platform, now);
  }

  // 6. Library facts for duplicates and new creators, then save.
  const facts = await libraryFacts(db, args.platform, [...cell.items.keys()], args.startedAt, allHandles);
  for (const it of cell.items.values()) it.inLibraryBefore = facts.inLibrary.has(it.sourceId);
  for (const it of cell.items.values()) {
    const h = it.creatorHandle;
    if (!h || cell.creators.has(h)) continue;
    cell.creators.set(h, { handle: h, channelId: it.channelId, knownBefore: facts.knownHandles.has(h) || known.handles.includes(h), foundBy: [...it.routes][0] ?? "search", topicMatch: it.topicVerdict === "relevant", scanned: scans.has(h), usualViews: it.usualViews });
  }
  for (const c of cell.creators.values()) {
    if ([...cell.items.values()].some(i => i.creatorHandle === c.handle && i.topicVerdict === "relevant")) c.topicMatch = true;
    if (!c.knownBefore && facts.knownHandles.has(c.handle)) c.knownBefore = true;
  }
  await saveCell(db, cell, now);
  const usd = Math.round((start - cell.remainingUsd) * 10_000) / 10_000;
  const note = `${args.topic.label}/${args.platform}: ${cell.items.size} videos, ${phrases.length} phrases, ${hashtags.length} hashtags, $${usd}${cell.exhausted ? " (budget reached: partial)" : ""}`;
  return { items: cell.items.size, usd, exhausted: cell.exhausted, note };
}

async function saveCell(db: Db, cell: Cell, now: Date): Promise<void> {
  for (const it of cell.items.values()) {
    await db.execute(sql`
      INSERT INTO viral_discovery_pilot_items
        (pilotId, topicSlug, platform, sourceId, url, caption, creatorHandle, channelId, routes, query, publishedAt, recency, followers, views1, views1At, usualViews, baselineSource, multiple, verdict, topicVerdict, topicReason, inLibraryBefore)
      VALUES (${cell.pilotId}, ${cell.topicSlug}, ${cell.platform}, ${it.sourceId.slice(0, 64)}, ${it.url}, ${it.caption}, ${it.creatorHandle}, ${it.channelId},
        ${JSON.stringify([...it.routes])}, ${it.query}, ${it.publishedAt}, ${recencyOf(it.publishedAt, now)}, ${it.followers}, ${it.views1}, ${it.views1At},
        ${it.usualViews}, ${it.baselineSource}, ${it.multiple}, ${it.verdict}, ${it.topicVerdict}, ${it.topicReason}, ${it.inLibraryBefore ? 1 : 0})
      ON DUPLICATE KEY UPDATE routes = VALUES(routes), verdict = VALUES(verdict), topicVerdict = VALUES(topicVerdict)
    `);
  }
  for (const c of cell.creators.values()) {
    await db.execute(sql`
      INSERT INTO viral_discovery_pilot_creators (pilotId, topicSlug, platform, handle, channelId, knownBefore, foundBy, topicMatch, scanned, usualViews)
      VALUES (${cell.pilotId}, ${cell.topicSlug}, ${cell.platform}, ${c.handle.slice(0, 128)}, ${c.channelId}, ${c.knownBefore ? 1 : 0}, ${c.foundBy.slice(0, 32)}, ${c.topicMatch ? 1 : 0}, ${c.scanned ? 1 : 0}, ${c.usualViews})
      ON DUPLICATE KEY UPDATE scanned = GREATEST(scanned, VALUES(scanned)), topicMatch = GREATEST(topicMatch, VALUES(topicMatch))
    `);
  }
}

/* ---------- second view and retries ---------- */

type PendingRow = { topicSlug: string; platform: PilotPlatform; sourceId: string; creatorHandle: string | null; channelId: string | null; views1: number | null; views1At: Date; publishedAt: Date | null; followers: number | null; usualViews: number | null; verdict: string; retries: number };

async function followUps(db: Db, pilot: PilotRow, now: Date): Promise<{ pendingLeft: number }> {
  const [rows] = (await db.execute(sql`
    SELECT topicSlug, platform, sourceId, creatorHandle, channelId, views1, views1At, publishedAt, followers, usualViews, verdict, retries
    FROM viral_discovery_pilot_items WHERE pilotId = ${pilot.id} AND (verdict = 'pending_growth' OR (verdict = 'pending_baseline' AND retries < 1))
  `)) as unknown as [PendingRow[]];
  const pending = (rows ?? []).map(r => ({ ...r, views1: r.views1 == null ? null : Number(r.views1), views1At: new Date(r.views1At), publishedAt: r.publishedAt ? new Date(r.publishedAt) : null, followers: r.followers == null ? null : Number(r.followers), usualViews: r.usualViews == null ? null : Number(r.usualViews) }));
  const due = pending.filter(r => r.verdict === "pending_baseline" || now.getTime() - r.views1At.getTime() >= GROWTH_RULE.minIntervalHours * 3_600_000);
  // One scan per creator covers every due video of that creator.
  const groups = new Map<string, PendingRow[]>();
  for (const r of due) {
    const key = `${r.platform}|${r.topicSlug}|${r.channelId ?? r.creatorHandle ?? r.sourceId}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const group of groups.values()) {
    const first = group[0]!;
    const platform = first.platform;
    const caps = { instagram: Number(pilot.instagramCapUsd) - Number(pilot.instagramUsd), youtube: Number(pilot.youtubeCapUsd) - Number(pilot.youtubeUsd), tiktok: Number(pilot.tiktokCapUsd) - Number(pilot.tiktokUsd) };
    const cell: Cell = { pilotId: pilot.id, topicSlug: first.topicSlug, topic: PILOT_TOPICS[0]!, platform, remainingUsd: Math.max(0, caps[platform]), exhausted: false, items: new Map(), creators: new Map() };
    const route = group.some(r => r.verdict === "pending_growth") ? "second_view" : "retry_baseline";
    const scan = first.creatorHandle || first.channelId ? await scanCreator(db, cell, route, { handle: first.creatorHandle, channelId: first.channelId }) : null;
    const spent = Math.max(0, caps[platform] - cell.remainingUsd);
    if (platform === "instagram") pilot.instagramUsd = Number(pilot.instagramUsd) + spent;
    else if (platform === "youtube") pilot.youtubeUsd = Number(pilot.youtubeUsd) + spent;
    else pilot.tiktokUsd = Number(pilot.tiktokUsd) + spent;
    const byId = new Map((scan?.videos ?? []).map(v => [v.sourceId, v]));
    for (const r of group) {
      const fresh = byId.get(r.sourceId);
      const usual = r.usualViews ?? scan?.usualViews ?? null;
      let verdict = r.verdict;
      let views2: number | null = fresh?.views ?? null;
      if (r.verdict === "pending_baseline") {
        const views = views2 ?? r.views1;
        const v = classifyVirality({ platform, views, followers: r.followers ?? scan?.followers ?? null, usualViews: usual, publishedAt: r.publishedAt, now });
        verdict = v.status === "viral" ? "viral" : v.status === "rising" ? "pending_growth" : v.status === "not_viral" ? "not_viral" : "pending_baseline";
        views2 = null;
      } else if (r.views1 == null) {
        verdict = "growth_check_failed";
      } else {
        const v2 = views2 == null ? null : classifyVirality({ platform, views: views2, followers: r.followers, usualViews: usual, publishedAt: r.publishedAt, now });
        const decision = growthDecision({ views1: r.views1, views1At: r.views1At, views2, views2At: now, verdictAtSecond: v2?.status ?? "unknown" });
        // Due rows are at least minIntervalHours old; a missing second count is labelled, never re-scanned forever.
        verdict = decision === "wait" ? "growth_check_failed" : decision;
      }
      const retried = r.verdict === "pending_baseline" ? 1 : 0;
      await db.execute(sql`
        UPDATE viral_discovery_pilot_items
        SET verdict = ${verdict}, views2 = ${views2}, views2At = ${views2 == null ? null : now}, usualViews = COALESCE(usualViews, ${usual}),
            retries = retries + ${retried}
        WHERE pilotId = ${pilot.id} AND topicSlug = ${r.topicSlug} AND platform = ${r.platform} AND sourceId = ${r.sourceId}
      `);
    }
  }
  // A growth check that never got its second count within the wait window is labelled, not guessed.
  await db.execute(sql`
    UPDATE viral_discovery_pilot_items SET verdict = 'growth_check_failed'
    WHERE pilotId = ${pilot.id} AND verdict = 'pending_growth' AND views1At < ${new Date(now.getTime() - GROWTH_RULE.maxWaitHours * 3_600_000)}
  `);
  const [left] = (await db.execute(sql`
    SELECT COUNT(*) AS n FROM viral_discovery_pilot_items
    WHERE pilotId = ${pilot.id} AND ((verdict = 'pending_growth') OR (verdict = 'pending_baseline' AND retries < 1))
  `)) as unknown as [Array<{ n: number }>];
  return { pendingLeft: Number(left?.[0]?.n ?? 0) };
}

/* ---------- runner ---------- */

type PilotRow = {
  id: number;
  status: string;
  capUsd: string;
  instagramCapUsd: string;
  youtubeCapUsd: string;
  tiktokCapUsd: string;
  instagramUsd: string | number;
  youtubeUsd: string | number;
  tiktokUsd: string | number;
  cellsDone: unknown;
  startedAt: Date | null;
};

export function pilotCells(): Array<{ topic: PilotTopic; platform: PilotPlatform }> {
  // Platform-interleaved so every platform gets its protected share in turn.
  return PILOT_TOPICS.flatMap(topic => PILOT_PLATFORMS.map(platform => ({ topic, platform })));
}

function cellKey(c: { topic: PilotTopic; platform: PilotPlatform }): string {
  return `${c.topic.label}|${c.platform}`;
}

/**
 * One worker tick: at most one topic/platform cell, or the follow-ups once
 * discovery is done. Never throws.
 */
export async function runDiscoveryPilotTick(now = new Date()): Promise<{ ran: boolean; reason: string }> {
  if (process.env.DISCOVERY_PILOT_RUNNER !== "on") return { ran: false, reason: "runner_off" };
  const db = await getDb();
  if (!db) return { ran: false, reason: "no_db" };
  let pilotId: number | null = null;
  let locked = false;
  try {
    const [rows] = (await db.execute(sql`
      SELECT * FROM viral_discovery_pilots WHERE status IN ('ready', 'running', 'second_view') ORDER BY id LIMIT 1
    `)) as unknown as [PilotRow[]];
    const pilot = rows?.[0];
    if (!pilot) return { ran: false, reason: "no_pilot" };
    pilotId = pilot.id;
    const [lock] = (await db.execute(sql`
      UPDATE viral_discovery_pilots SET lockedUntil = ${new Date(now.getTime() + 20 * 60_000)}
      WHERE id = ${pilot.id} AND (lockedUntil IS NULL OR lockedUntil < ${now})
    `)) as unknown as [{ affectedRows?: number }];
    if (!lock?.affectedRows) return { ran: false, reason: "locked" };
    locked = true;

    // The approved ceiling: a pilot asking for more than this never starts.
    if (Number(pilot.capUsd) > PILOT_MAX_CAP_USD()) {
      await db.execute(sql`UPDATE viral_discovery_pilots SET status = 'stopped', endedAt = ${now}, note = ${`cap above approved $${PILOT_MAX_CAP_USD()}`} WHERE id = ${pilot.id}`);
      return { ran: false, reason: "cap_too_high" };
    }

    // Caps are fixed from the total when the pilot starts; the total never grows.
    if (pilot.status === "ready") {
      const caps = pilotCaps(Number(pilot.capUsd));
      await db.execute(sql`
        UPDATE viral_discovery_pilots SET status = 'running', startedAt = ${now},
          instagramCapUsd = ${caps.instagram}, youtubeCapUsd = ${caps.youtube}, tiktokCapUsd = ${caps.tiktok}
        WHERE id = ${pilot.id} AND status = 'ready'
      `);
      Object.assign(pilot, { status: "running", startedAt: now, instagramCapUsd: String(caps.instagram), youtubeCapUsd: String(caps.youtube), tiktokCapUsd: String(caps.tiktok) });
      console.info("[discoveryPilot] started", { id: pilot.id, caps });
    }

    if (pilot.status === "running") {
      const done = new Set<string>(Array.isArray(pilot.cellsDone) ? (pilot.cellsDone as string[]) : typeof pilot.cellsDone === "string" ? (JSON.parse(pilot.cellsDone) as string[]) : []);
      const cells = pilotCells();
      const next = cells.find(c => !done.has(cellKey(c)));
      if (!next) {
        await db.execute(sql`UPDATE viral_discovery_pilots SET status = 'second_view', discoveryDoneAt = ${now} WHERE id = ${pilot.id}`);
        return { ran: true, reason: "discovery_done" };
      }
      const capOf = { instagram: Number(pilot.instagramCapUsd), youtube: Number(pilot.youtubeCapUsd), tiktok: Number(pilot.tiktokCapUsd) };
      const spentOf = { instagram: Number(pilot.instagramUsd), youtube: Number(pilot.youtubeUsd), tiktok: Number(pilot.tiktokUsd) };
      const left = cells.filter(c => c.platform === next.platform && !done.has(cellKey(c))).length;
      // Keep part of each platform's share for the second-view checks and retries.
      const reserveForFollowUps = capOf[next.platform] * 0.15;
      const budgetUsd = cellBudgetUsd(capOf[next.platform] - reserveForFollowUps - spentOf[next.platform], left);
      const result = await runPilotCell(db, { pilotId: pilot.id, startedAt: pilot.startedAt ? new Date(pilot.startedAt) : now, topic: next.topic, platform: next.platform, budgetUsd, now });
      done.add(cellKey(next));
      await db.execute(sql`UPDATE viral_discovery_pilots SET cellsDone = ${JSON.stringify([...done])}, note = ${result.note.slice(0, 255)} WHERE id = ${pilot.id}`);
      console.info("[discoveryPilot] cell", { id: pilot.id, ...result });
      return { ran: true, reason: "cell" };
    }

    // second_view: growth checks and one retry for pending assessments.
    const { pendingLeft } = await followUps(db, pilot, now);
    if (pendingLeft === 0) {
      await db.execute(sql`UPDATE viral_discovery_pilots SET status = 'done', endedAt = ${now} WHERE id = ${pilot.id}`);
      console.info("[discoveryPilot] done", { id: pilot.id });
      return { ran: true, reason: "done" };
    }
    return { ran: true, reason: "waiting_second_view" };
  } catch (err) {
    console.warn("[discoveryPilot] tick_failed", { error: err instanceof Error ? err.message : String(err) });
    return { ran: false, reason: "error" };
  } finally {
    if (locked && pilotId != null) await db.execute(sql`UPDATE viral_discovery_pilots SET lockedUntil = NULL WHERE id = ${pilotId}`).catch(() => undefined);
  }
}
