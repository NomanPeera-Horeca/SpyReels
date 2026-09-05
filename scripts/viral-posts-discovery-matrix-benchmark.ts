import "dotenv/config";

import type { AdaptedCandidate } from "../server/viralPosts/candidateAdapter";
import {
  deriveHook,
  extractHashtags,
  inferFormatFromCopy,
} from "../server/viralPosts/candidateAdapter";
import {
  ageHoursFromPublished,
  classifyTrendStatus,
  computeEngagementRate,
  computeReachMultiplier,
  computeViewsPerHour,
} from "../server/viralPosts/scoring";
import {
  classifySemanticPoolRelevance,
  routeSemanticPoolCandidates,
  SEMANTIC_POOL_MODEL,
  type SemanticPoolVerdict,
} from "../server/viralPosts/semanticPoolRelevance";

/**
 * READ-ONLY RESEARCH BENCHMARK.
 *
 * Purpose: compare multiple ScrapeCreators discovery surfaces before any of
 * them are wired into production Viral Posts pool refreshes.
 *
 * This script:
 * - makes provider search calls only;
 * - optionally makes Haiku semantic-classification calls;
 * - does NOT import the DB;
 * - does NOT persist candidates;
 * - does NOT refresh or mutate any pool;
 * - does NOT change the production 35-call refresh budget.
 *
 * Production provider adapters remain in server/instagram.ts, server/tiktok.ts,
 * and server/youtube.ts. Winning lanes should be integrated there only after
 * this benchmark proves their value.
 */

const API_BASE = "https://api.scrapecreators.com";
const FETCH_TIMEOUT_MS = 30_000;

type Platform = "instagram" | "tiktok" | "youtube";
type LaneName =
  | "ig_hashtag_baseline"
  | "ig_keyword_reels"
  | "ig_popular_topic"
  | "tiktok_keyword"
  | "tiktok_top"
  | "youtube_shorts_relevance"
  | "youtube_shorts_popular";

type MatrixCandidate = {
  lane: LaneName;
  platform: Platform;
  query: string;
  sourceId: string;
  sourceUrl: string;
  creatorHandle: string | null;
  creatorName: string;
  creatorFollowers: number | null;
  caption: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
};

type ProviderResponse = {
  status: number;
  data: unknown;
};

type LaneRun = {
  lane: LaneName;
  platform: Platform;
  calls: number;
  rawRows: number;
  candidates: MatrixCandidate[];
  errors: string[];
};

type LaneSemantic = {
  sample: MatrixCandidate[];
  verdicts: SemanticPoolVerdict[];
  haikuCalls: number;
  error: string | null;
};

let providerCallCount = 0;

function requireProviderKey(): string {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) throw new Error("SCRAPECREATORS_API_KEY is not configured");
  return key;
}

function argValue(name: string): string | null {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]!.trim() : null;
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function short(value: string | null | undefined, max = 130): string {
  const clean = (value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "(no copy)";
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveMetric(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n > 10_000_000_000 ? n : n * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function firstArray(value: unknown, keys: string[]): unknown[] {
  const root = asRecord(value);
  for (const key of keys) {
    if (Array.isArray(root[key])) return root[key] as unknown[];
  }
  const nested = asRecord(root.data);
  for (const key of keys) {
    if (Array.isArray(nested[key])) return nested[key] as unknown[];
  }
  return [];
}

async function scGet(
  path: string,
  query: Record<string, string | undefined>
): Promise<ProviderResponse> {
  providerCallCount++;
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: { "x-api-key": requireProviderKey() },
      signal: controller.signal,
    });
    const text = await response.text();
    let data: unknown = null;
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { status: response.status, data };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: 408, data: { error: "request_timeout" } };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function providerError(path: string, query: string, response: ProviderResponse): string {
  const record = asRecord(response.data);
  const message = firstString(record.error, record.message, record.detail);
  return `${path} query="${query}" HTTP ${response.status}${message ? `: ${message}` : ""}`;
}

function instagramCandidate(
  lane: LaneName,
  query: string,
  raw: unknown
): MatrixCandidate | null {
  const post = asRecord(raw);
  const owner = asRecord(post.owner ?? post.user);
  const sourceId = firstString(post.shortcode, post.code, post.id).replace(/^POLARIS_/, "");
  if (!sourceId) return null;
  const creatorHandle = firstString(owner.username, owner.user_name, post.ownerUsername) || null;
  const captionRaw = post.caption;
  const caption =
    typeof captionRaw === "string"
      ? captionRaw
      : firstString(asRecord(captionRaw).text, post.description, post.title);
  const sourceUrl =
    firstString(post.url, post.reel_url, post.permalink) ||
    `https://www.instagram.com/reel/${sourceId}/`;
  return {
    lane,
    platform: "instagram",
    query,
    sourceId,
    sourceUrl,
    creatorHandle,
    creatorName: firstString(owner.full_name, owner.fullName, creatorHandle) || "Instagram creator",
    creatorFollowers: positiveMetric(
      owner.follower_count ?? owner.followersCount ?? owner.followerCount ?? owner.followers
    ),
    caption,
    views: positiveMetric(
      post.play_count ?? post.video_play_count ?? post.video_view_count ?? post.view_count
    ),
    likes: positiveMetric(post.like_count ?? post.likes),
    comments: positiveMetric(post.comment_count ?? post.comments),
    shares: positiveMetric(post.share_count ?? post.shares),
    saves: positiveMetric(post.save_count ?? post.saves),
    publishedAt: parseDate(
      post.taken_at_timestamp ?? post.taken_at ?? post.timestamp ?? post.device_timestamp
    ),
    thumbnailUrl:
      firstString(post.display_url, post.thumbnail_url, post.thumbnail_src) || null,
    videoUrl: firstString(post.video_url) || null,
  };
}

function tiktokCandidate(
  lane: LaneName,
  query: string,
  raw: unknown
): MatrixCandidate | null {
  const entry = asRecord(raw);
  const item = asRecord(entry.aweme_info ?? entry.awemeInfo ?? entry);
  const author = asRecord(item.author);
  const stats = asRecord(item.statistics ?? item.stats);
  const sourceId = firstString(item.aweme_id, item.awemeId, item.id);
  if (!sourceId) return null;
  const creatorHandle = firstString(author.unique_id, author.uniqueId, author.username) || null;
  const sourceUrl =
    firstString(item.share_url, item.url) ||
    (creatorHandle
      ? `https://www.tiktok.com/@${creatorHandle.replace(/^@/, "")}/video/${sourceId}`
      : `https://www.tiktok.com/video/${sourceId}`);
  return {
    lane,
    platform: "tiktok",
    query,
    sourceId,
    sourceUrl,
    creatorHandle,
    creatorName: firstString(author.nickname, author.full_name, creatorHandle) || "TikTok creator",
    creatorFollowers: positiveMetric(
      author.follower_count ?? author.followerCount ?? asRecord(author.stats).followerCount
    ),
    caption: firstString(item.desc, item.caption, item.title),
    views: positiveMetric(stats.play_count ?? stats.playCount ?? stats.view_count),
    likes: positiveMetric(stats.digg_count ?? stats.like_count ?? stats.likes),
    comments: positiveMetric(stats.comment_count ?? stats.comments),
    shares: positiveMetric(stats.share_count ?? stats.shares),
    saves: positiveMetric(stats.collect_count ?? stats.save_count ?? stats.saves),
    publishedAt: parseDate(item.create_time ?? item.createTime ?? item.timestamp),
    thumbnailUrl: null,
    videoUrl: null,
  };
}

function youtubeCandidate(
  lane: LaneName,
  query: string,
  raw: unknown
): MatrixCandidate | null {
  const item = asRecord(raw);
  const sourceId = firstString(item.id, item.videoId);
  if (!sourceId) return null;
  const channel = asRecord(item.channel);
  const creatorHandle =
    firstString(channel.handle, item.channelHandle, item.handle, channel.name) || null;
  const title = firstString(item.title);
  const description = firstString(item.description, item.snippet);
  return {
    lane,
    platform: "youtube",
    query,
    sourceId,
    sourceUrl:
      firstString(item.url, item.videoUrl) || `https://www.youtube.com/shorts/${sourceId}`,
    creatorHandle,
    creatorName:
      firstString(channel.title, channel.name, item.channelTitle, creatorHandle) || "YouTube creator",
    creatorFollowers: positiveMetric(
      channel.subscriberCount ?? item.subscriberCount ?? item.channelSubscriberCount
    ),
    caption: [title, description].filter(Boolean).join(". "),
    views: positiveMetric(item.viewCountInt ?? item.viewCount ?? item.views),
    likes: positiveMetric(item.likeCountInt ?? item.likeCount ?? item.likes),
    comments: positiveMetric(item.commentCountInt ?? item.commentCount ?? item.comments),
    shares: null,
    saves: null,
    publishedAt: parseDate(item.publishDate ?? item.publishedAt ?? item.publishedTime),
    thumbnailUrl:
      firstString(item.thumbnail, item.thumbnailUrl, asRecord(item.thumbnail).url) || null,
    videoUrl: null,
  };
}

function dedupeCandidates(candidates: MatrixCandidate[]): MatrixCandidate[] {
  const byId = new Map<string, MatrixCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.platform}:${candidate.sourceId}`;
    const existing = byId.get(key);
    if (!existing) {
      byId.set(key, candidate);
      continue;
    }
    const existingViews = existing.views ?? -1;
    const candidateViews = candidate.views ?? -1;
    if (candidateViews > existingViews) byId.set(key, candidate);
  }
  return [...byId.values()];
}

function balancedSemanticSample(
  candidates: MatrixCandidate[],
  limit: number
): MatrixCandidate[] {
  if (candidates.length <= limit) return candidates;
  const byQuery = new Map<string, MatrixCandidate[]>();
  for (const candidate of candidates) {
    const rows = byQuery.get(candidate.query) ?? [];
    rows.push(candidate);
    byQuery.set(candidate.query, rows);
  }
  const queues = [...byQuery.values()].map((rows) => [...rows]);
  const out: MatrixCandidate[] = [];
  while (out.length < limit && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) out.push(next);
      if (out.length >= limit) break;
    }
  }
  return out;
}

function toAdapted(candidate: MatrixCandidate): AdaptedCandidate {
  const hook = deriveHook(candidate.caption);
  const hashtags = extractHashtags(candidate.caption);
  const ageHours = ageHoursFromPublished(candidate.publishedAt);
  const reachMultiplier = computeReachMultiplier(candidate.views, candidate.creatorFollowers);
  const engagementRate = computeEngagementRate({
    views: candidate.views,
    likes: candidate.likes,
    comments: candidate.comments,
    shares: candidate.shares,
    saves: candidate.saves,
  });
  const viewsPerHour = computeViewsPerHour(candidate.views, ageHours);
  return {
    platform: candidate.platform,
    sourceId: candidate.sourceId,
    sourceUrl: candidate.sourceUrl,
    creatorId: candidate.creatorHandle,
    creatorName: candidate.creatorName,
    creatorHandle: candidate.creatorHandle,
    creatorAvatarUrl: null,
    creatorFollowers: candidate.creatorFollowers,
    thumbnailUrl: candidate.thumbnailUrl,
    videoUrl: candidate.videoUrl,
    caption: candidate.caption || null,
    transcript: null,
    hashtags,
    publishedAt: candidate.publishedAt,
    views: candidate.views,
    likes: candidate.likes,
    comments: candidate.comments,
    shares: candidate.shares,
    saves: candidate.saves,
    reachMultiplier,
    engagementRate,
    viewsPerHour,
    trendStatus: classifyTrendStatus({
      reachMultiplier,
      viewsPerHour,
      ageHours,
      views: candidate.views,
    }),
    relevanceHint: 0,
    contentPillar: null,
    relevanceLabel: "Discovery matrix benchmark",
    relevanceReason: `Found via ${candidate.lane}: ${candidate.query}`,
    hook,
    format: inferFormatFromCopy({ caption: candidate.caption, hook }),
    hashtagKey: hashtags[0] || null,
    rawProviderPayload: {
      source: "discovery_matrix_benchmark",
      discoveryLane: candidate.lane,
      discoveryQuery: candidate.query,
    },
  };
}

async function runQueries(args: {
  lane: LaneName;
  platform: Platform;
  queries: string[];
  path: string;
  queryParams: (query: string) => Record<string, string | undefined>;
  rows: (data: unknown) => unknown[];
  parse: (lane: LaneName, query: string, row: unknown) => MatrixCandidate | null;
}): Promise<LaneRun> {
  const before = providerCallCount;
  const candidates: MatrixCandidate[] = [];
  const errors: string[] = [];
  let rawRows = 0;

  for (const query of args.queries) {
    const response = await scGet(args.path, args.queryParams(query));
    if (response.status < 200 || response.status >= 300) {
      errors.push(providerError(args.path, query, response));
      continue;
    }
    const rows = args.rows(response.data);
    rawRows += rows.length;
    for (const row of rows) {
      const parsed = args.parse(args.lane, query, row);
      if (parsed) candidates.push(parsed);
    }
  }

  return {
    lane: args.lane,
    platform: args.platform,
    calls: providerCallCount - before,
    rawRows,
    candidates: dedupeCandidates(candidates),
    errors,
  };
}

async function semanticForLane(
  run: LaneRun,
  niche: string,
  pillar: string,
  limit: number
): Promise<LaneSemantic> {
  const sample = balancedSemanticSample(run.candidates, limit);
  if (sample.length === 0) {
    return { sample, verdicts: [], haikuCalls: 0, error: null };
  }
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return {
      sample,
      verdicts: [],
      haikuCalls: 0,
      error: "ANTHROPIC_API_KEY not configured; semantic comparison skipped",
    };
  }
  try {
    const result = await classifySemanticPoolRelevance({
      niche,
      candidates: sample.map(toAdapted),
    });
    return {
      sample,
      verdicts: result.verdicts,
      haikuCalls: result.haikuCalls,
      error: null,
    };
  } catch (error) {
    return {
      sample,
      verdicts: [],
      haikuCalls: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function uniqueCreators(candidates: MatrixCandidate[]): number {
  return new Set(
    candidates
      .map((candidate) => candidate.creatorHandle?.toLowerCase().replace(/^@/, ""))
      .filter((value): value is string => Boolean(value))
  ).size;
}

function metricStats(candidates: MatrixCandidate[]) {
  const views = candidates.filter((candidate) => candidate.views != null && candidate.views > 0);
  const followers = candidates.filter(
    (candidate) => candidate.creatorFollowers != null && candidate.creatorFollowers > 0
  );
  const metricReady = candidates.filter(
    (candidate) =>
      candidate.views != null &&
      candidate.views > 0 &&
      candidate.creatorFollowers != null &&
      candidate.creatorFollowers > 0
  );
  const views5k = candidates.filter((candidate) => (candidate.views ?? 0) >= 5_000);
  const reach3x = metricReady.filter(
    (candidate) =>
      (candidate.views ?? 0) / Math.max(candidate.creatorFollowers ?? 1, 1) >= 3
  );
  const simpleStrong = metricReady.filter(
    (candidate) =>
      (candidate.views ?? 0) >= 5_000 &&
      (candidate.views ?? 0) / Math.max(candidate.creatorFollowers ?? 1, 1) >= 3
  );
  return {
    views: views.length,
    followers: followers.length,
    metricReady: metricReady.length,
    views5k: views5k.length,
    reach3x: reach3x.length,
    simpleStrong: simpleStrong.length,
  };
}

function semanticStats(semantic: LaneSemantic, pillar: string) {
  const verdictById = new Map(semantic.verdicts.map((verdict) => [verdict.sourceId, verdict]));
  const adapted = semantic.sample.map(toAdapted);
  const routing = routeSemanticPoolCandidates({
    sourcePillar: pillar,
    candidates: adapted,
    verdicts: semantic.verdicts,
  });
  const domainRelevant = semantic.sample.filter(
    (candidate) => verdictById.get(candidate.sourceId)?.domainRelevant === true
  ).length;
  const targetPillar = semantic.sample.filter(
    (candidate) => verdictById.get(candidate.sourceId)?.primaryPillar === pillar
  ).length;
  return {
    domainRelevant,
    targetPillar,
    rerouted: routing.rerouted.length,
    rejected: routing.rejected.length,
    currentPool: routing.currentPool.length,
    routing,
    verdictById,
  };
}

function printLaneSummary(run: LaneRun, semantic: LaneSemantic, pillar: string): void {
  const metrics = metricStats(run.candidates);
  const semantics = semanticStats(semantic, pillar);
  console.log(`\n${run.lane} [${run.platform}]`);
  console.log("------------------------------------------------------------");
  console.log(`provider calls: ${run.calls}`);
  console.log(`raw rows: ${run.rawRows}`);
  console.log(`unique posts: ${run.candidates.length}`);
  console.log(`unique creators: ${uniqueCreators(run.candidates)}`);
  console.log(`views available: ${metrics.views}/${run.candidates.length}`);
  console.log(`followers available: ${metrics.followers}/${run.candidates.length}`);
  console.log(`views + followers ready: ${metrics.metricReady}/${run.candidates.length}`);
  console.log(`views >= 5k: ${metrics.views5k}`);
  console.log(`reach >= 3x where measurable: ${metrics.reach3x}`);
  console.log(
    `simple >=5k & >=3x proxy: ${metrics.simpleStrong} (diagnostic only, NOT production strict scoreReel)`
  );
  console.log(`semantic sample: ${semantic.sample.length}`);
  console.log(`semantic Haiku calls: ${semantic.haikuCalls}`);
  console.log(`domain relevant in sample: ${semantics.domainRelevant}`);
  console.log(`PRIMARY ${pillar}: ${semantics.targetPillar}`);
  console.log(`rerouted to sibling pillar: ${semantics.rerouted}`);
  console.log(`semantic rejected/missing/low-confidence: ${semantics.rejected}`);
  if (semantic.error) console.log(`semantic note: ${semantic.error}`);
  for (const error of run.errors) console.log(`provider error: ${error}`);

  const relevant = semantic.sample
    .map((candidate) => ({ candidate, verdict: semantics.verdictById.get(candidate.sourceId) }))
    .filter((row) => row.verdict?.domainRelevant === true)
    .sort((a, b) => (b.candidate.views ?? 0) - (a.candidate.views ?? 0))
    .slice(0, 5);
  console.log("top semantic restaurant/hospitality rows:");
  if (relevant.length === 0) {
    console.log("  none in semantic sample");
  } else {
    for (const row of relevant) {
      const reach = computeReachMultiplier(row.candidate.views, row.candidate.creatorFollowers);
      console.log(
        `  - ${row.candidate.creatorHandle || row.candidate.creatorName} | primary=${row.verdict?.primaryPillar || "none"} | conf=${(row.verdict?.confidence ?? 0).toFixed(2)} | views=${row.candidate.views ?? "n/a"} | followers=${row.candidate.creatorFollowers ?? "n/a"} | reach=${reach == null ? "n/a" : `${reach.toFixed(2)}x`}`
      );
      console.log(`    ${short(row.candidate.caption, 170)}`);
      console.log(`    ${row.candidate.sourceUrl}`);
    }
  }
}

function printComparison(runs: Array<{ run: LaneRun; semantic: LaneSemantic }>, pillar: string): void {
  console.log("\n============================================================");
  console.log("DISCOVERY MATRIX COMPARISON");
  console.log("============================================================");
  console.log(
    "lane | calls | unique | creators | view-ready | full-metric | semantic n | domain | target-pillar | rerouted | rejected"
  );
  for (const { run, semantic } of runs) {
    const metrics = metricStats(run.candidates);
    const semantics = semanticStats(semantic, pillar);
    console.log(
      `${run.lane} | ${run.calls} | ${run.candidates.length} | ${uniqueCreators(run.candidates)} | ${metrics.views} | ${metrics.metricReady} | ${semantic.sample.length} | ${semantics.domainRelevant} | ${semantics.targetPillar} | ${semantics.rerouted} | ${semantics.rejected}`
    );
  }
  console.log("============================================================\n");
}

async function main() {
  const pillar = argValue("--pillar") || "restaurant operations";
  const niche = argValue("--niche") || "Business & Entrepreneurship";
  const callsPerLane = clampInt(argValue("--callsPerLane"), 3, 1, 5);
  const semanticLimit = clampInt(argValue("--semanticLimit"), 18, 1, 36);
  const region = (argValue("--region") || "US").toUpperCase();

  const concepts = [
    "restaurant staff training",
    "restaurant SOP",
    "restaurant inventory management",
    "restaurant scheduling",
    "restaurant workflow",
  ].slice(0, callsPerLane);
  const hashtags = [
    "restaurantmanagement",
    "restaurantoperations",
    "foodservice",
    "restaurantowner",
    "restaurantbusiness",
  ].slice(0, callsPerLane);

  console.log("============================================================");
  console.log("SPYREELS READ-ONLY MULTI-LANE DISCOVERY MATRIX");
  console.log("============================================================");
  console.log(`pillar: ${pillar}`);
  console.log(`niche: ${niche}`);
  console.log(`region: ${region}`);
  console.log(`calls per lane: ${callsPerLane}`);
  console.log(`semantic sample cap per lane: ${semanticLimit}`);
  console.log(`semantic model: ${SEMANTIC_POOL_MODEL}`);
  console.log(`concepts: ${concepts.join(" | ")}`);
  console.log(`hashtags: ${hashtags.map((tag) => `#${tag}`).join(" | ")}`);
  console.log("NO DB WRITES. NO POOL REFRESH. NO PRODUCTION RETRIEVAL CHANGE.");

  const laneRuns: LaneRun[] = [];

  laneRuns.push(
    await runQueries({
      lane: "ig_hashtag_baseline",
      platform: "instagram",
      queries: hashtags,
      path: "/v1/instagram/search/hashtag",
      queryParams: (hashtag) => ({
        hashtag,
        media_type: "reels",
        date_posted: "last-month",
      }),
      rows: (data) => firstArray(data, ["reels", "posts", "items", "results"]),
      parse: instagramCandidate,
    })
  );

  laneRuns.push(
    await runQueries({
      lane: "ig_keyword_reels",
      platform: "instagram",
      queries: concepts,
      path: "/v2/instagram/reels/search",
      queryParams: (query) => ({ query, date_posted: "last-month", page: "1" }),
      rows: (data) => firstArray(data, ["reels", "posts", "items", "results"]),
      parse: instagramCandidate,
    })
  );

  laneRuns.push(
    await runQueries({
      lane: "ig_popular_topic",
      platform: "instagram",
      queries: concepts,
      path: "/v1/instagram/search/popular",
      queryParams: (query) => ({ query }),
      rows: (data) => firstArray(data, ["posts", "reels", "items", "results"]),
      parse: instagramCandidate,
    })
  );

  laneRuns.push(
    await runQueries({
      lane: "tiktok_keyword",
      platform: "tiktok",
      queries: concepts,
      path: "/v1/tiktok/search/keyword",
      queryParams: (query) => ({
        query,
        date_posted: "last-3-months",
        sort_by: "relevance",
        region,
        trim: "false",
      }),
      rows: (data) => firstArray(data, ["search_item_list", "items", "videos", "results"]),
      parse: tiktokCandidate,
    })
  );

  laneRuns.push(
    await runQueries({
      lane: "tiktok_top",
      platform: "tiktok",
      queries: concepts,
      path: "/v1/tiktok/search/top",
      queryParams: (query) => ({
        query,
        publish_time: "last-3-months",
        sort_by: "relevance",
        region,
      }),
      rows: (data) => firstArray(data, ["items", "search_item_list", "videos", "results"]),
      parse: tiktokCandidate,
    })
  );

  laneRuns.push(
    await runQueries({
      lane: "youtube_shorts_relevance",
      platform: "youtube",
      queries: concepts,
      path: "/v1/youtube/search",
      queryParams: (query) => ({
        query,
        uploadDate: "this_month",
        sortBy: "relevance",
        type: "shorts",
        region,
        includeExtras: "true",
      }),
      rows: (data) => firstArray(data, ["shorts", "videos", "items", "results"]),
      parse: youtubeCandidate,
    })
  );

  laneRuns.push(
    await runQueries({
      lane: "youtube_shorts_popular",
      platform: "youtube",
      queries: concepts,
      path: "/v1/youtube/search",
      queryParams: (query) => ({
        query,
        uploadDate: "this_month",
        sortBy: "popular",
        type: "shorts",
        region,
        includeExtras: "true",
      }),
      rows: (data) => firstArray(data, ["shorts", "videos", "items", "results"]),
      parse: youtubeCandidate,
    })
  );

  const results: Array<{ run: LaneRun; semantic: LaneSemantic }> = [];
  for (const run of laneRuns) {
    const semantic = await semanticForLane(run, niche, pillar, semanticLimit);
    results.push({ run, semantic });
    printLaneSummary(run, semantic, pillar);
  }

  printComparison(results, pillar);
  console.log(`TOTAL SCRAPECREATORS CALLS: ${providerCallCount}`);
  console.log(
    `TOTAL SEMANTIC HAIKU CALLS: ${results.reduce((sum, row) => sum + row.semantic.haikuCalls, 0)}`
  );
  console.log(
    "Interpretation note: search lanes with missing follower or view metrics may still be excellent discovery lanes; they simply require later profile/post enrichment before production strict virality scoring."
  );
}

main().catch((error) => {
  console.error("[viral-posts-discovery-matrix-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
