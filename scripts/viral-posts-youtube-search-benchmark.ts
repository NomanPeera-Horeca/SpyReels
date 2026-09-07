import "dotenv/config";

import type { AdaptedCandidate } from "../server/viralPosts/candidateAdapter";
import {
  deriveHook,
  extractHashtags,
  inferFormatFromCopy,
} from "../server/viralPosts/candidateAdapter";
import {
  TIER2_MIN_REACH_MULTIPLIER,
  TIER2_MIN_VIEWS,
  scoreViralMetrics,
  type ViralMetricsScore,
} from "../server/discovery/scoring";
import {
  classifySemanticPoolRelevance,
  MIN_SEMANTIC_POOL_CONFIDENCE,
  routeSemanticPoolCandidates,
  type SemanticPoolVerdict,
} from "../server/viralPosts/semanticPoolRelevance";

delete process.env.DATABASE_URL;

if (!process.env.SCRAPECREATORS_API_KEY || !process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    "SCRAPECREATORS_API_KEY and ANTHROPIC_API_KEY are required for this read-only benchmark"
  );
}

const API_BASE = "https://api.scrapecreators.com";
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_SC_USD_PER_CREDIT = 0.002;
const MAX_SEARCH_CALLS = 5;
const MAX_CHANNEL_CALLS = 8;
const MAX_VIDEO_DETAIL_CALLS = 5;
const MAX_TOTAL_SC_CALLS =
  MAX_SEARCH_CALLS + MAX_CHANNEL_CALLS + MAX_VIDEO_DETAIL_CALLS;

const PILLAR_QUERY_FALLBACKS: Record<string, string[]> = {
  "restaurant operations": [
    "restaurant management",
    "staff training",
    "restaurant SOP",
    "restaurant inventory",
    "kitchen workflow",
  ],
  "restaurant profitability": [
    "restaurant profit",
    "food cost",
    "menu pricing",
    "restaurant sales",
    "restaurant margins",
  ],
  "restaurant marketing": [
    "restaurant marketing",
    "restaurant branding",
    "restaurant loyalty",
    "restaurant promotion",
    "restaurant ads",
  ],
  "kitchen buildouts": [
    "restaurant equipment",
    "commercial kitchen",
    "kitchen layout",
    "restaurant buildout",
    "kitchen equipment",
  ],
  "menu engineering": [
    "menu engineering",
    "menu pricing",
    "food cost",
    "menu design",
    "restaurant upselling",
  ],
  "hospitality leadership": [
    "hospitality leadership",
    "restaurant leadership",
    "restaurant culture",
    "restaurant hiring",
    "restaurant owner",
  ],
};

type ProviderResponse = {
  status: number;
  data: unknown;
};

type SearchRow = {
  videoId: string;
  sourceUrl: string;
  title: string;
  description: string;
  caption: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  channelId: string | null;
  channelHandle: string | null;
  channelTitle: string;
  channelSubscribers: number | null;
  channelAvatarUrl: string | null;
  queries: string[];
};

type ChannelDetail = {
  channelId: string | null;
  name: string;
  subscriberCount: number | null;
  avatarUrl: string | null;
};

type StrictRow = {
  post: SearchRow;
  score: ViralMetricsScore;
};

let providerCallCount = 0;

function argValue(name: string): string | null {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]!.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
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

function short(value: string | null | undefined, max = 180): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "(no copy)";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function cleanHandle(value: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/^@/, "").trim();
  if (!clean || /^channel\//i.test(clean)) return null;
  return clean;
}

function channelKey(post: SearchRow): string | null {
  if (post.channelId?.trim()) return `id:${post.channelId.trim()}`;
  const handle = cleanHandle(post.channelHandle);
  return handle ? `handle:${handle.toLowerCase()}` : null;
}

function queriesForPillar(pillar: string): string[] {
  const explicit = argValue("--queries");
  if (explicit) {
    return explicit
      .split("|")
      .map((query) => query.replace(/#/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, MAX_SEARCH_CALLS);
  }
  return (
    PILLAR_QUERY_FALLBACKS[pillar] || [
      pillar,
      `${pillar} tips`,
      `${pillar} strategy`,
      `${pillar} systems`,
      `${pillar} advice`,
    ]
  ).slice(0, MAX_SEARCH_CALLS);
}

async function scGet(
  path: string,
  query: Record<string, string | undefined>
): Promise<ProviderResponse> {
  if (providerCallCount >= MAX_TOTAL_SC_CALLS) {
    return { status: 429, data: { error: "benchmark_sc_budget_exhausted" } };
  }
  providerCallCount++;
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") url.searchParams.set(key, value);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: { "x-api-key": process.env.SCRAPECREATORS_API_KEY!.trim() },
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

function parseSearchRow(raw: unknown, query: string): SearchRow | null {
  const item = asRecord(raw);
  const type = firstString(item.type).toLowerCase();
  if (type && type !== "short" && type !== "shorts" && type !== "video") {
    return null;
  }
  const videoId = firstString(item.id, item.videoId);
  if (!videoId) return null;
  const channel = asRecord(item.channel);
  const channelId = firstString(channel.id, item.channelId) || null;
  const channelHandle =
    cleanHandle(firstString(channel.handle, item.channelHandle, item.handle) || null);
  const channelTitle =
    firstString(channel.title, channel.name, item.channelTitle, channelHandle) ||
    "YouTube creator";
  const title = firstString(item.title);
  const description = firstString(item.description, item.snippet);
  return {
    videoId,
    sourceUrl:
      firstString(item.url, item.videoUrl) ||
      `https://www.youtube.com/shorts/${videoId}`,
    title,
    description,
    caption: [title, description].filter(Boolean).join(". "),
    views: finiteNumber(item.viewCountInt ?? item.viewCount ?? item.views),
    likes: finiteNumber(item.likeCountInt ?? item.likeCount ?? item.likes),
    comments: finiteNumber(
      item.commentCountInt ?? item.commentCount ?? item.comments
    ),
    publishedAt: parseDate(
      item.publishDate ?? item.publishedAt ?? item.publishedTime
    ),
    thumbnailUrl:
      firstString(item.thumbnail, item.thumbnailUrl, asRecord(item.thumbnail).url) ||
      null,
    channelId,
    channelHandle,
    channelTitle,
    channelSubscribers: finiteNumber(
      channel.subscriberCount ?? item.subscriberCount ?? item.channelSubscriberCount
    ),
    channelAvatarUrl:
      firstString(channel.thumbnail, channel.avatar, item.channelThumbnail) || null,
    queries: [query],
  };
}

function mergeRows(rows: SearchRow[]): SearchRow[] {
  const byId = new Map<string, SearchRow>();
  for (const row of rows) {
    const existing = byId.get(row.videoId);
    if (!existing) {
      byId.set(row.videoId, row);
      continue;
    }
    for (const query of row.queries) {
      if (!existing.queries.includes(query)) existing.queries.push(query);
    }
    if ((row.views ?? 0) > (existing.views ?? 0)) existing.views = row.views;
    if ((row.likes ?? -1) > (existing.likes ?? -1)) existing.likes = row.likes;
    if ((row.comments ?? -1) > (existing.comments ?? -1)) {
      existing.comments = row.comments;
    }
    if (!existing.channelId && row.channelId) existing.channelId = row.channelId;
    if (!existing.channelHandle && row.channelHandle) {
      existing.channelHandle = row.channelHandle;
    }
    if (!existing.description && row.description) existing.description = row.description;
  }
  return [...byId.values()];
}

function toAdapted(post: SearchRow, niche: string): AdaptedCandidate {
  const hashtags = extractHashtags(post.caption);
  const hook = deriveHook(post.caption);
  const handle = cleanHandle(post.channelHandle);
  return {
    platform: "youtube",
    sourceId: post.videoId,
    sourceUrl: post.sourceUrl,
    creatorId: post.channelId || handle,
    creatorName: post.channelTitle,
    creatorHandle: handle ? `@${handle}` : null,
    creatorAvatarUrl: post.channelAvatarUrl,
    creatorFollowers: post.channelSubscribers,
    thumbnailUrl: post.thumbnailUrl,
    videoUrl: null,
    caption: post.caption || null,
    transcript: null,
    hashtags,
    publishedAt: post.publishedAt,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    shares: null,
    saves: null,
    reachMultiplier: null,
    engagementRate: null,
    viewsPerHour: null,
    trendStatus: "proven-format",
    relevanceHint: 50,
    contentPillar: null,
    relevanceLabel: "YouTube Shorts search benchmark",
    relevanceReason: `Found via YouTube Shorts search for ${niche}`,
    hook,
    format: inferFormatFromCopy({ caption: post.caption, hook }),
    hashtagKey: hashtags[0] || null,
    rawProviderPayload: {
      source: "youtube_search_benchmark",
      channelId: post.channelId,
      discoveryQueries: post.queries,
    },
  };
}

function verdictMap(verdicts: SemanticPoolVerdict[]): Map<string, SemanticPoolVerdict> {
  return new Map(verdicts.map((verdict) => [verdict.sourceId, verdict]));
}

function rankPrimaryChannels(args: {
  posts: SearchRow[];
  verdicts: SemanticPoolVerdict[];
  pillar: string;
}): string[] {
  const byVerdict = verdictMap(args.verdicts);
  const best = new Map<string, number>();
  for (const post of args.posts) {
    if (post.views == null || post.views < TIER2_MIN_VIEWS) continue;
    const key = channelKey(post);
    if (!key) continue;
    const verdict = byVerdict.get(post.videoId);
    if (
      !verdict?.domainRelevant ||
      verdict.primaryPillar !== args.pillar ||
      verdict.confidence < MIN_SEMANTIC_POOL_CONFIDENCE
    ) {
      continue;
    }
    const rank = verdict.confidence * Math.log10(1 + post.views);
    if (rank > (best.get(key) ?? 0)) best.set(key, rank);
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_CHANNEL_CALLS)
    .map(([key]) => key);
}

async function fetchChannelDetail(key: string): Promise<ChannelDetail | null> {
  const response = key.startsWith("id:")
    ? await scGet("/v1/youtube/channel", { channelId: key.slice(3) })
    : await scGet("/v1/youtube/channel", { handle: key.slice(7) });
  if (response.status < 200 || response.status >= 300) return null;
  const data = asRecord(response.data);
  const avatarSources = asRecord(asRecord(data.avatar).image).sources;
  const avatarUrl = Array.isArray(avatarSources)
    ? firstString(asRecord(avatarSources[0]).url) || null
    : null;
  return {
    channelId: firstString(data.channelId) || null,
    name: firstString(data.name),
    subscriberCount: finiteNumber(data.subscriberCount),
    avatarUrl,
  };
}

function applyChannelDetail(
  posts: SearchRow[],
  selectedKey: string,
  detail: ChannelDetail
): number {
  let touched = 0;
  for (const post of posts) {
    if (channelKey(post) !== selectedKey) continue;
    if (detail.channelId && !post.channelId) post.channelId = detail.channelId;
    if (detail.name) post.channelTitle = detail.name;
    if (detail.avatarUrl) post.channelAvatarUrl = detail.avatarUrl;
    if (detail.subscriberCount != null && detail.subscriberCount > 0) {
      post.channelSubscribers = detail.subscriberCount;
      touched++;
    }
  }
  return touched;
}

function prequalifiesForDetail(post: SearchRow): boolean {
  if (
    post.views == null ||
    post.views < TIER2_MIN_VIEWS ||
    post.channelSubscribers == null ||
    post.channelSubscribers <= 0
  ) {
    return false;
  }
  return post.views / post.channelSubscribers >= TIER2_MIN_REACH_MULTIPLIER;
}

function selectVideoDetails(args: {
  posts: SearchRow[];
  verdicts: SemanticPoolVerdict[];
  pillar: string;
}): SearchRow[] {
  const byVerdict = verdictMap(args.verdicts);
  return args.posts
    .filter((post) => {
      const verdict = byVerdict.get(post.videoId);
      const missingEngagement = post.likes == null || post.comments == null;
      return (
        missingEngagement &&
        prequalifiesForDetail(post) &&
        verdict?.domainRelevant === true &&
        verdict.primaryPillar === args.pillar &&
        verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE
      );
    })
    .sort((a, b) => {
      const va = byVerdict.get(a.videoId)?.confidence ?? 0;
      const vb = byVerdict.get(b.videoId)?.confidence ?? 0;
      const reachA = (a.views ?? 0) / Math.max(1, a.channelSubscribers ?? 1);
      const reachB = (b.views ?? 0) / Math.max(1, b.channelSubscribers ?? 1);
      return vb * Math.log10(1 + reachB) - va * Math.log10(1 + reachA);
    })
    .slice(0, MAX_VIDEO_DETAIL_CALLS);
}

async function enrichVideoDetail(post: SearchRow): Promise<boolean> {
  const response = await scGet("/v1/youtube/video", {
    url: post.sourceUrl,
    language: "en",
    cache_max_age: "7d",
  });
  if (response.status < 200 || response.status >= 300) return false;
  const data = asRecord(response.data);
  post.views = finiteNumber(data.viewCountInt ?? data.viewCount) ?? post.views;
  post.likes = finiteNumber(data.likeCountInt ?? data.likeCount) ?? post.likes;
  post.comments =
    finiteNumber(data.commentCountInt ?? data.commentCount) ?? post.comments;
  post.description = firstString(data.description) || post.description;
  post.title = firstString(data.title) || post.title;
  post.caption = [post.title, post.description].filter(Boolean).join(". ");
  post.publishedAt = parseDate(data.publishDate) ?? post.publishedAt;
  post.thumbnailUrl = firstString(data.thumbnail) || post.thumbnailUrl;
  return true;
}

function strictScore(post: SearchRow): ViralMetricsScore | null {
  if (
    post.views == null ||
    post.views <= 0 ||
    post.channelSubscribers == null ||
    post.channelSubscribers <= 0
  ) {
    return null;
  }
  return scoreViralMetrics({
    views: post.views,
    likes: post.likes ?? 0,
    comments: post.comments ?? 0,
    followers: post.channelSubscribers,
  });
}

async function main(): Promise<void> {
  const pillar = argValue("--pillar") || "restaurant operations";
  const niche = argValue("--niche") || "Business & Entrepreneurship";
  const region = (argValue("--region") || "US").toUpperCase();
  const queries = queriesForPillar(pillar);

  const collected: SearchRow[] = [];
  const searchResults: Array<{ query: string; status: number; raw: number }> = [];

  for (const query of queries) {
    const response = await scGet("/v1/youtube/search", {
      query,
      uploadDate: "this_month",
      sortBy: "relevance",
      type: "shorts",
      region,
      includeExtras: "true",
    });
    const rows =
      response.status >= 200 && response.status < 300
        ? firstArray(response.data, ["shorts", "videos", "items", "results"])
        : [];
    searchResults.push({ query, status: response.status, raw: rows.length });
    for (const raw of rows) {
      const parsed = parseSearchRow(raw, query);
      if (parsed) collected.push(parsed);
    }
  }

  const posts = mergeRows(collected);
  const prefilter = await classifySemanticPoolRelevance({
    niche,
    candidates: posts.map((post) => toAdapted(post, niche)),
  });
  const prefilterById = verdictMap(prefilter.verdicts);

  const rankedPrimary = posts
    .map((post) => ({ post, verdict: prefilterById.get(post.videoId) }))
    .filter(
      (row): row is { post: SearchRow; verdict: SemanticPoolVerdict } =>
        row.verdict?.domainRelevant === true &&
        row.verdict.primaryPillar === pillar &&
        row.verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE
    )
    .sort(
      (a, b) =>
        b.verdict.confidence * Math.log10(1 + (b.post.views ?? 0)) -
        a.verdict.confidence * Math.log10(1 + (a.post.views ?? 0))
    );

  const selectedChannels = rankPrimaryChannels({
    posts,
    verdicts: prefilter.verdicts,
    pillar,
  });
  const channelOutcomes: Array<{
    key: string;
    success: boolean;
    postsWithSubscribers: number;
  }> = [];
  for (const key of selectedChannels) {
    const detail = await fetchChannelDetail(key);
    const touched = detail ? applyChannelDetail(posts, key, detail) : 0;
    channelOutcomes.push({ key, success: Boolean(detail), postsWithSubscribers: touched });
  }

  const detailSelected = selectVideoDetails({
    posts,
    verdicts: prefilter.verdicts,
    pillar,
  });
  const videoDetailOutcomes: Array<{
    videoId: string;
    success: boolean;
  }> = [];
  for (const post of detailSelected) {
    const success = await enrichVideoDetail(post);
    videoDetailOutcomes.push({ videoId: post.videoId, success });
  }

  const strictRows: StrictRow[] = [];
  for (const post of posts) {
    const verdict = prefilterById.get(post.videoId);
    if (
      !verdict?.domainRelevant ||
      verdict.primaryPillar !== pillar ||
      verdict.confidence < MIN_SEMANTIC_POOL_CONFIDENCE
    ) {
      continue;
    }
    const score = strictScore(post);
    if (score) strictRows.push({ post, score });
  }

  const finalSemantic = await classifySemanticPoolRelevance({
    niche,
    candidates: strictRows.map((row) => toAdapted(row.post, niche)),
  });
  const routed = routeSemanticPoolCandidates({
    sourcePillar: pillar,
    candidates: strictRows.map((row) => toAdapted(row.post, niche)),
    verdicts: finalSemantic.verdicts,
  });
  const finalById = verdictMap(finalSemantic.verdicts);

  const targetPrefilter = prefilter.verdicts.filter(
    (verdict) =>
      verdict.domainRelevant &&
      verdict.primaryPillar === pillar &&
      verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE
  ).length;
  const siblingPrefilter = prefilter.verdicts.filter(
    (verdict) =>
      verdict.domainRelevant &&
      verdict.primaryPillar &&
      verdict.primaryPillar !== pillar &&
      verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE
  ).length;
  const robustStrict = strictRows.filter(
    (row) => row.post.likes != null && row.post.comments != null
  ).length;
  const uniqueChannels = new Set(posts.map(channelKey).filter(Boolean)).size;
  const metricReady = posts.filter(
    (post) =>
      post.views != null &&
      post.views > 0 &&
      post.channelSubscribers != null &&
      post.channelSubscribers > 0
  ).length;

  console.log("\n============================================================");
  console.log("SPYREELS READ-ONLY YOUTUBE SHORTS SEARCH BENCHMARK");
  console.log("============================================================");
  console.log(`pillar: ${pillar}`);
  console.log(`niche: ${niche}`);
  console.log(`region: ${region}`);
  console.log(`queries: ${queries.join(" | ")}`);
  console.log("NO DB WRITES. NO POOL REFRESH. NO PRODUCTION WIRING.");

  console.log("\nSEARCH");
  for (const row of searchResults) {
    console.log(`  ${row.query} | HTTP ${row.status} | raw=${row.raw}`);
  }
  console.log(`search calls: ${searchResults.length}/${MAX_SEARCH_CALLS}`);
  console.log(`unique posts: ${posts.length}`);
  console.log(`unique channels: ${uniqueChannels}`);
  console.log(
    `views available: ${posts.filter((post) => (post.views ?? 0) > 0).length}/${posts.length}`
  );
  console.log(
    `likes/comments from search: ${posts.filter((post) => post.likes != null && post.comments != null).length}/${posts.length}`
  );
  console.log(
    `channelId available: ${posts.filter((post) => Boolean(post.channelId)).length}/${posts.length}`
  );

  console.log("\nSEMANTIC PREFILTER");
  console.log(`Haiku calls: ${prefilter.haikuCalls}`);
  console.log(`primary ${pillar}: ${targetPrefilter}`);
  console.log(`sibling pillar: ${siblingPrefilter}`);
  console.log(`rejected/low/missing: ${posts.length - targetPrefilter - siblingPrefilter}`);
  console.log("top 15 target candidates before channel enrichment:");
  for (const row of rankedPrimary.slice(0, 15)) {
    console.log(
      `  ${row.post.channelTitle} | ${row.post.videoId} | views=${row.post.views ?? "n/a"} | conf=${row.verdict.confidence.toFixed(2)} | channelId=${row.post.channelId ?? "n/a"}`
    );
    console.log(`    queries: ${row.post.queries.join(" | ")}`);
    console.log(`    ${short(row.post.caption)}`);
  }

  console.log("\nCHANNEL ENRICHMENT");
  console.log(`selected channels: ${selectedChannels.join(", ") || "(none)"}`);
  console.log(`channel calls: ${channelOutcomes.length}/${MAX_CHANNEL_CALLS}`);
  for (const row of channelOutcomes) {
    console.log(
      `  ${row.key} | ${row.success ? "OK" : "FAIL"} | posts_with_subscribers=${row.postsWithSubscribers}`
    );
  }
  console.log(`metric-ready after channel enrichment: ${metricReady}/${posts.length}`);

  console.log("\nVIDEO DETAIL ENRICHMENT");
  console.log(`video-detail calls: ${videoDetailOutcomes.length}/${MAX_VIDEO_DETAIL_CALLS}`);
  for (const row of videoDetailOutcomes) {
    console.log(`  ${row.videoId} | ${row.success ? "OK" : "FAIL"}`);
  }

  console.log("\nSTRICT + FINAL ROUTING");
  console.log(`strict viral: ${strictRows.length}`);
  console.log(`strict with real likes/comments: ${robustStrict}`);
  console.log(`FINAL current-pool admitted: ${routed.currentPool.length}`);
  console.log(`FINAL sibling rerouted: ${routed.rerouted.length}`);
  console.log(`FINAL rejected: ${routed.rejected.length}`);
  console.log(`final semantic Haiku calls: ${finalSemantic.haikuCalls}`);

  console.log("\nSTRICT ROWS");
  if (strictRows.length === 0) console.log("None.");
  for (const row of strictRows.sort(
    (a, b) => b.score.reachMultiplier - a.score.reachMultiplier
  )) {
    const verdict = finalById.get(row.post.videoId);
    const disposition = routed.currentPool.some(
      (item) => item.sourceId === row.post.videoId
    )
      ? pillar
      : routed.rerouted.find(
            (item) => item.candidate.sourceId === row.post.videoId
          )?.targetPillar || "rejected";
    console.log(
      `${row.post.channelTitle} | ${row.post.videoId} | views=${row.post.views ?? "n/a"} | subscribers=${row.post.channelSubscribers ?? "n/a"} | reach=${row.score.reachMultiplier.toFixed(2)}x | likes=${row.post.likes ?? "n/a"} | comments=${row.post.comments ?? "n/a"} | tier=${row.score.tier} | viralScore=${row.score.viralScore.toFixed(2)}`
    );
    console.log(`  queries: ${row.post.queries.join(" | ")}`);
    console.log(`  caption: ${short(row.post.caption)}`);
    console.log(
      `  semantic=${verdict?.primaryPillar || "(none)"} | conf=${verdict?.confidence?.toFixed(2) ?? "n/a"} | disposition=${disposition}`
    );
    console.log(`  ${row.post.sourceUrl}`);
  }

  console.log("\nCOST");
  console.log(`TOTAL SC CALLS: ${providerCallCount}/${MAX_TOTAL_SC_CALLS}`);
  console.log(
    `estimated SC cost: $${(providerCallCount * DEFAULT_SC_USD_PER_CREDIT).toFixed(4)}`
  );
  console.log(
    `total semantic Haiku calls: ${prefilter.haikuCalls + finalSemantic.haikuCalls}`
  );
  console.log("============================================================\n");
}

main().catch((error) => {
  console.error("[viral-posts-youtube-search-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
