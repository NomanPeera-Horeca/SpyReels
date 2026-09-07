import "dotenv/config";

import type { AdaptedCandidate } from "../server/viralPosts/candidateAdapter";
import {
  deriveHook,
  extractHashtags,
  inferFormatFromCopy,
} from "../server/viralPosts/candidateAdapter";
import {
  classifySemanticPoolRelevance,
  MIN_SEMANTIC_POOL_CONFIDENCE,
  type SemanticPoolVerdict,
} from "../server/viralPosts/semanticPoolRelevance";

/**
 * READ-ONLY YouTube search-mode probe.
 *
 * Purpose: determine whether the weak restaurant-operations result from the
 * first full YouTube benchmark was caused mainly by the `this_month` recency
 * window / sort mode before spending channel-enrichment credits.
 *
 * No DB. No pool refresh. No persistence. No production wiring.
 */

delete process.env.DATABASE_URL;

if (!process.env.SCRAPECREATORS_API_KEY || !process.env.ANTHROPIC_API_KEY) {
  throw new Error(
    "SCRAPECREATORS_API_KEY and ANTHROPIC_API_KEY are required for this read-only probe"
  );
}

const API_BASE = "https://api.scrapecreators.com";
const FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_SC_USD_PER_CREDIT = 0.002;
const NICHE = "Business & Entrepreneurship";
const PILLAR = "restaurant operations";
const QUERIES = [
  "restaurant operations",
  "restaurant management",
  "restaurant systems",
] as const;

const MODES = [
  { name: "year_relevance", uploadDate: "this_year", sortBy: "relevance" },
  { name: "year_popular", uploadDate: "this_year", sortBy: "popular" },
  { name: "all_popular", uploadDate: undefined, sortBy: "popular" },
] as const;

type ModeName = (typeof MODES)[number]["name"];

type SearchRow = {
  mode: ModeName;
  query: string;
  videoId: string;
  sourceUrl: string;
  title: string;
  description: string;
  caption: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: Date | null;
  channelId: string | null;
  channelHandle: string | null;
  channelTitle: string;
  thumbnailUrl: string | null;
};

let providerCalls = 0;

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

function cleanHandle(value: string | null): string | null {
  if (!value) return null;
  const clean = value.replace(/^@/, "").trim();
  if (!clean || /^channel\//i.test(clean)) return null;
  return clean;
}

function short(value: string, max = 150): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "(no copy)";
  return clean.length <= max ? clean : `${clean.slice(0, max - 3)}...`;
}

async function scGet(
  path: string,
  query: Record<string, string | undefined>
): Promise<{ status: number; data: unknown }> {
  providerCalls++;
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

function parseRow(raw: unknown, mode: ModeName, query: string): SearchRow | null {
  const item = asRecord(raw);
  const type = firstString(item.type).toLowerCase();
  if (type && type !== "short" && type !== "shorts" && type !== "video") {
    return null;
  }
  const videoId = firstString(item.id, item.videoId);
  if (!videoId) return null;

  const channel = asRecord(item.channel);
  const channelHandle = cleanHandle(
    firstString(channel.handle, item.channelHandle, item.handle) || null
  );
  const title = firstString(item.title);
  const description = firstString(item.description, item.snippet);

  return {
    mode,
    query,
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
    channelId: firstString(channel.id, item.channelId) || null,
    channelHandle,
    channelTitle:
      firstString(channel.title, channel.name, item.channelTitle, channelHandle) ||
      "YouTube creator",
    thumbnailUrl:
      firstString(item.thumbnail, item.thumbnailUrl, asRecord(item.thumbnail).url) ||
      null,
  };
}

function dedupe(rows: SearchRow[]): SearchRow[] {
  const byId = new Map<string, SearchRow>();
  for (const row of rows) {
    const existing = byId.get(row.videoId);
    if (!existing || (row.views ?? -1) > (existing.views ?? -1)) {
      byId.set(row.videoId, row);
    }
  }
  return [...byId.values()];
}

function toAdapted(row: SearchRow): AdaptedCandidate {
  const hashtags = extractHashtags(row.caption);
  const hook = deriveHook(row.caption);
  const handle = cleanHandle(row.channelHandle);
  return {
    platform: "youtube",
    sourceId: row.videoId,
    sourceUrl: row.sourceUrl,
    creatorId: row.channelId || handle,
    creatorName: row.channelTitle,
    creatorHandle: handle ? `@${handle}` : null,
    creatorAvatarUrl: null,
    creatorFollowers: null,
    thumbnailUrl: row.thumbnailUrl,
    videoUrl: null,
    caption: row.caption || null,
    transcript: null,
    hashtags,
    publishedAt: row.publishedAt,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: null,
    saves: null,
    reachMultiplier: null,
    engagementRate: null,
    viewsPerHour: null,
    trendStatus: "proven-format",
    relevanceHint: 50,
    contentPillar: null,
    relevanceLabel: "YouTube search-mode probe",
    relevanceReason: `${row.mode}: ${row.query}`,
    hook,
    format: inferFormatFromCopy({ caption: row.caption, hook }),
    hashtagKey: hashtags[0] || null,
    rawProviderPayload: {
      source: "youtube_search_mode_probe",
      mode: row.mode,
      query: row.query,
      channelId: row.channelId,
    },
  };
}

function verdictMap(verdicts: SemanticPoolVerdict[]): Map<string, SemanticPoolVerdict> {
  return new Map(verdicts.map((verdict) => [verdict.sourceId, verdict]));
}

async function main(): Promise<void> {
  console.log("============================================================");
  console.log("SPYREELS READ-ONLY YOUTUBE SEARCH MODE PROBE");
  console.log("============================================================");
  console.log(`pillar: ${PILLAR}`);
  console.log(`queries: ${QUERIES.join(" | ")}`);
  console.log("NO DB WRITES. NO POOL REFRESH. NO PRODUCTION WIRING.");

  const allResults: Array<{
    mode: ModeName;
    rows: SearchRow[];
    verdicts: SemanticPoolVerdict[];
    haikuCalls: number;
    statuses: Array<{ query: string; status: number; raw: number }>;
  }> = [];

  for (const mode of MODES) {
    const collected: SearchRow[] = [];
    const statuses: Array<{ query: string; status: number; raw: number }> = [];

    for (const query of QUERIES) {
      const response = await scGet("/v1/youtube/search", {
        query,
        uploadDate: mode.uploadDate,
        sortBy: mode.sortBy,
        type: "shorts",
        region: "US",
        includeExtras: "true",
      });
      const rawRows =
        response.status >= 200 && response.status < 300
          ? firstArray(response.data, ["shorts", "videos", "items", "results"])
          : [];
      statuses.push({ query, status: response.status, raw: rawRows.length });
      for (const raw of rawRows) {
        const parsed = parseRow(raw, mode.name, query);
        if (parsed) collected.push(parsed);
      }
    }

    const rows = dedupe(collected);
    const semantic = await classifySemanticPoolRelevance({
      niche: NICHE,
      candidates: rows.map(toAdapted),
    });
    allResults.push({
      mode: mode.name,
      rows,
      verdicts: semantic.verdicts,
      haikuCalls: semantic.haikuCalls,
      statuses,
    });
  }

  for (const result of allResults) {
    const byVerdict = verdictMap(result.verdicts);
    const primary = result.rows.filter((row) => {
      const verdict = byVerdict.get(row.videoId);
      return (
        verdict?.domainRelevant === true &&
        verdict.primaryPillar === PILLAR &&
        verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE
      );
    });
    const primary1k = primary.filter((row) => (row.views ?? 0) >= 1_000);
    const primary5k = primary.filter((row) => (row.views ?? 0) >= 5_000);
    const withChannelId = result.rows.filter((row) => Boolean(row.channelId));
    const withChannelKey = result.rows.filter(
      (row) => Boolean(row.channelId || cleanHandle(row.channelHandle))
    );
    const primaryEnrichable = primary1k.filter(
      (row) => Boolean(row.channelId || cleanHandle(row.channelHandle))
    );

    console.log("\n============================================================");
    console.log(`MODE: ${result.mode}`);
    console.log("============================================================");
    for (const status of result.statuses) {
      console.log(`${status.query} | HTTP ${status.status} | raw=${status.raw}`);
    }
    console.log(`unique Shorts: ${result.rows.length}`);
    console.log(
      `views available: ${result.rows.filter((row) => (row.views ?? 0) > 0).length}/${result.rows.length}`
    );
    console.log(`canonical channelId: ${withChannelId.length}/${result.rows.length}`);
    console.log(`any channel key: ${withChannelKey.length}/${result.rows.length}`);
    console.log(`semantic Haiku calls: ${result.haikuCalls}`);
    console.log(`PRIMARY ${PILLAR}: ${primary.length}`);
    console.log(`PRIMARY >=1k views: ${primary1k.length}`);
    console.log(`PRIMARY >=5k views: ${primary5k.length}`);
    console.log(`PRIMARY >=1k + channel key: ${primaryEnrichable.length}`);

    console.log("top primary rows:");
    const top = [...primary]
      .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
      .slice(0, 10);
    if (top.length === 0) {
      console.log("  none");
    }
    for (const row of top) {
      const verdict = byVerdict.get(row.videoId);
      console.log(
        `  - ${row.channelTitle} | ${row.videoId} | views=${row.views ?? "n/a"} | channelId=${row.channelId ?? "n/a"} | handle=${row.channelHandle ?? "n/a"} | conf=${verdict?.confidence?.toFixed(2) ?? "n/a"}`
      );
      console.log(`    query=${row.query}`);
      console.log(`    ${short(row.caption)}`);
      console.log(`    ${row.sourceUrl}`);
    }
  }

  console.log("\n============================================================");
  console.log("COMPARISON");
  console.log("============================================================");
  console.log(
    "mode | unique | channelId | channelKey | primary | primary>=1k | primary>=5k | enrichable>=1k"
  );
  for (const result of allResults) {
    const byVerdict = verdictMap(result.verdicts);
    const primary = result.rows.filter((row) => {
      const verdict = byVerdict.get(row.videoId);
      return (
        verdict?.domainRelevant === true &&
        verdict.primaryPillar === PILLAR &&
        verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE
      );
    });
    const channelId = result.rows.filter((row) => Boolean(row.channelId)).length;
    const channelKey = result.rows.filter(
      (row) => Boolean(row.channelId || cleanHandle(row.channelHandle))
    ).length;
    const primary1k = primary.filter((row) => (row.views ?? 0) >= 1_000);
    const primary5k = primary.filter((row) => (row.views ?? 0) >= 5_000);
    const enrichable = primary1k.filter(
      (row) => Boolean(row.channelId || cleanHandle(row.channelHandle))
    ).length;
    console.log(
      `${result.mode} | ${result.rows.length} | ${channelId} | ${channelKey} | ${primary.length} | ${primary1k.length} | ${primary5k.length} | ${enrichable}`
    );
  }
  console.log(`TOTAL SC CALLS: ${providerCalls}/9`);
  console.log(`estimated SC cost: $${(providerCalls * DEFAULT_SC_USD_PER_CREDIT).toFixed(4)}`);
  console.log("============================================================\n");
}

main().catch((error) => {
  console.error("[viral-posts-youtube-search-mode-probe] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
