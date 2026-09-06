/**
 * READ-ONLY YouTube seed-quality benchmark.
 *
 * Verifies candidate handles via ScrapeCreators /v1/youtube/channel, scrapes
 * Shorts with scrapeYouTubeShorts, applies shared scoreViralMetrics, then the
 * restaurant semantic judge. Does not write DB / pools / seeds.
 */
import "dotenv/config";
import {
  scrapeYouTubeShorts,
  type YouTubeVideoData,
} from "../server/youtube";
import {
  scoreViralMetrics,
  type ViralMetricsScore,
} from "../server/discovery/scoring";
import { adaptYouTubeShorts } from "../server/viralPosts/platformAdapters";
import {
  classifySemanticPoolRelevance,
  MIN_SEMANTIC_POOL_CONFIDENCE,
  routeSemanticPoolCandidates,
  type SemanticPoolVerdict,
} from "../server/viralPosts/semanticPoolRelevance";
import { DEFAULT_CONTENT_PILLARS } from "../server/viralPosts/constants";

delete process.env.DATABASE_URL;

if (!process.env.ANTHROPIC_API_KEY || !process.env.SCRAPECREATORS_API_KEY) {
  throw new Error(
    "ANTHROPIC_API_KEY and SCRAPECREATORS_API_KEY are required for this read-only benchmark"
  );
}

const API_BASE = "https://api.scrapecreators.com";
const NICHE = "Business & Entrepreneurship";
const MAX_SHORTS_PER_SEED = 30;
const DAYS_90_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_SC_USD_PER_CREDIT = 0.002;
const APPROX_SC_CALLS_PER_VERIFIED_SEED = 4;

/** Failed production catalog from migration 0089 (reference only). */
const MIGRATION_0089_YOUTUBE_SEEDS = [
  "RestaurantOwnerTV",
  "DavidScottPeters",
  "RestaurantBusiness",
] as const;

/**
 * Replacement candidates for this read-only run only.
 * Do NOT insert into viral_post_seed_creators from this script.
 */
const REPLACEMENT_CANDIDATE_HANDLES = [
  "Restaurant365",
  "TheRestaurantBoss",
  "RestaurantUnstoppable",
  "RestaurantRockstars",
] as const;

type ChannelVerify = {
  handle: string;
  ok: boolean;
  channelId: string | null;
  channelName: string | null;
  subscriberCount: number;
  error?: string;
};

type StrictRow = {
  video: YouTubeVideoData;
  handle: string;
  subscribers: number;
  score: ViralMetricsScore;
};

type SeedReport = {
  handle: string;
  verified: boolean;
  channelId: string | null;
  channelName: string | null;
  subscribers: number;
  scraped: number;
  last90d: number;
  ge1k: number;
  ge5k: number;
  strict: number;
  tier1: number;
  tier2: number;
  domainStrict: number;
  bestPillar: string;
  classification: "GOOD SEED" | "BORDERLINE" | "BAD SEED" | "UNRESOLVED";
  note: string;
};

function argValue(name: string): string | null {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]!.trim() : null;
}

function short(value: string | null | undefined, max = 160): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "(no title)";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function seedsToScrape(): string[] {
  const explicit = argValue("--handles");
  if (explicit) {
    return explicit
      .split("|")
      .map((handle) => handle.replace(/^@/, "").trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  const mode = (argValue("--mode") || "replacement").toLowerCase();
  if (mode === "migration" || mode === "legacy") {
    return [...MIGRATION_0089_YOUTUBE_SEEDS];
  }
  return [...REPLACEMENT_CANDIDATE_HANDLES];
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

function finiteNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function verifyYouTubeHandle(handle: string): Promise<ChannelVerify> {
  const clean = handle.replace(/^@/, "").trim();
  const url = new URL(`${API_BASE}/v1/youtube/channel`);
  url.searchParams.set("handle", clean);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
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
    const record = asRecord(data);
    if (response.status === 404 || record.success === false) {
      return {
        handle: clean,
        ok: false,
        channelId: null,
        channelName: null,
        subscriberCount: 0,
        error: firstString(record.message, record.error, `HTTP ${response.status}`) || "not_found",
      };
    }
    if (response.status < 200 || response.status >= 300) {
      return {
        handle: clean,
        ok: false,
        channelId: null,
        channelName: null,
        subscriberCount: 0,
        error: `HTTP ${response.status}`,
      };
    }
    return {
      handle: firstString(record.handle, clean).replace(/^@/, ""),
      ok: true,
      channelId: firstString(record.channelId, record.id) || null,
      channelName: firstString(record.name, record.title, record.handle) || null,
      subscriberCount: finiteNumber(record.subscriberCount),
    };
  } catch (error) {
    return {
      handle: clean,
      ok: false,
      channelId: null,
      channelName: null,
      subscriberCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function dedupeVideos(videos: YouTubeVideoData[]): YouTubeVideoData[] {
  const byId = new Map<string, YouTubeVideoData>();
  for (const video of videos) {
    if (!video.videoId?.trim()) continue;
    if (!byId.has(video.videoId)) byId.set(video.videoId, video);
  }
  return [...byId.values()];
}

function strictScore(
  video: YouTubeVideoData,
  subscribers: number
): ViralMetricsScore | null {
  if (
    typeof video.viewCount !== "number" ||
    !Number.isFinite(video.viewCount) ||
    video.viewCount <= 0 ||
    subscribers <= 0
  ) {
    return null;
  }
  return scoreViralMetrics({
    views: video.viewCount,
    likes: typeof video.likeCount === "number" ? video.likeCount : 0,
    comments: typeof video.commentCount === "number" ? video.commentCount : 0,
    followers: subscribers,
  });
}

function inLast90Days(video: YouTubeVideoData, now: Date): boolean {
  if (!video.postedAt || Number.isNaN(video.postedAt.getTime())) return false;
  return now.getTime() - video.postedAt.getTime() <= DAYS_90_MS;
}

function classifySeed(domainStrict: number): SeedReport["classification"] {
  if (domainStrict >= 2) return "GOOD SEED";
  if (domainStrict === 1) return "BORDERLINE";
  return "BAD SEED";
}

async function main(): Promise<void> {
  const handles = seedsToScrape();
  const now = new Date();

  console.log("============================================================");
  console.log("SPYREELS READ-ONLY YOUTUBE SEED QUALITY BENCHMARK");
  console.log("============================================================");
  console.log(`niche: ${NICHE}`);
  console.log(`candidate handles: ${handles.map((h) => `@${h}`).join(", ")}`);
  console.log(`max Shorts per channel: ${MAX_SHORTS_PER_SEED}`);
  console.log("NO DB WRITES. NO SEED MUTATIONS. NO POOL REFRESH.");
  console.log("DATABASE_URL deleted for this process.");

  console.log("\nHANDLE VERIFICATION");
  const verified: ChannelVerify[] = [];
  for (const handle of handles) {
    const result = await verifyYouTubeHandle(handle);
    verified.push(result);
    if (result.ok) {
      console.log(
        `OK @${result.handle} | channelId=${result.channelId || "n/a"} | name=${result.channelName || "n/a"} | subs=${result.subscriberCount}`
      );
    } else {
      console.log(`FAIL @${result.handle} | ${result.error || "unresolved"}`);
    }
  }

  const okHandles = verified.filter((row) => row.ok);
  if (okHandles.length === 0) {
    console.log("\nNo verified channels. STOP.");
    return;
  }

  const seedReports: SeedReport[] = [];
  const allVideos: Array<{ video: YouTubeVideoData; handle: string; subscribers: number }> =
    [];
  const unresolved = verified.filter((row) => !row.ok);
  for (const row of unresolved) {
    seedReports.push({
      handle: row.handle,
      verified: false,
      channelId: null,
      channelName: null,
      subscribers: 0,
      scraped: 0,
      last90d: 0,
      ge1k: 0,
      ge5k: 0,
      strict: 0,
      tier1: 0,
      tier2: 0,
      domainStrict: 0,
      bestPillar: "(none)",
      classification: "UNRESOLVED",
      note: row.error || "handle did not resolve",
    });
  }

  for (const channel of okHandles) {
    try {
      const result = await scrapeYouTubeShorts(channel.handle, undefined, {
        maxVideos: MAX_SHORTS_PER_SEED,
        timeoutMs: 120_000,
      });
      const videos = result.videos.slice(0, MAX_SHORTS_PER_SEED);
      const subscribers =
        result.subscriberCount > 0 ? result.subscriberCount : channel.subscriberCount;
      let strict = 0;
      let tier1 = 0;
      let tier2 = 0;
      for (const video of videos) {
        allVideos.push({ video, handle: channel.handle, subscribers });
        const scored = strictScore(video, subscribers);
        if (!scored) continue;
        strict += 1;
        if (scored.tier === 1) tier1 += 1;
        else tier2 += 1;
      }
      const last90d = videos.filter((video) => inLast90Days(video, now)).length;
      const note =
        last90d === 0 && videos.length > 0
          ? "Shorts returned, but none in last 90 days (may be long-form-heavy channel with stale Shorts)"
          : last90d < Math.min(5, videos.length)
            ? "Limited recent Shorts activity in last 90 days"
            : "Recent Shorts activity present";
      seedReports.push({
        handle: channel.handle,
        verified: true,
        channelId: channel.channelId,
        channelName: channel.channelName,
        subscribers,
        scraped: videos.length,
        last90d,
        ge1k: videos.filter((v) => (v.viewCount ?? 0) >= 1_000).length,
        ge5k: videos.filter((v) => (v.viewCount ?? 0) >= 5_000).length,
        strict,
        tier1,
        tier2,
        domainStrict: 0,
        bestPillar: "(none)",
        classification: "BAD SEED",
        note,
      });
      console.log(
        `\nSCRAPE @${channel.handle}: subs=${subscribers} shorts=${videos.length} last90d=${last90d} >=1k=${seedReports.at(-1)!.ge1k} >=5k=${seedReports.at(-1)!.ge5k} strict=${strict} t1=${tier1} t2=${tier2}`
      );
    } catch (error) {
      seedReports.push({
        handle: channel.handle,
        verified: true,
        channelId: channel.channelId,
        channelName: channel.channelName,
        subscribers: channel.subscriberCount,
        scraped: 0,
        last90d: 0,
        ge1k: 0,
        ge5k: 0,
        strict: 0,
        tier1: 0,
        tier2: 0,
        domainStrict: 0,
        bestPillar: "(none)",
        classification: "BAD SEED",
        note: error instanceof Error ? error.message : String(error),
      });
      console.warn("[youtube-seed-quality] scrape_failed", {
        handle: channel.handle,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const uniqueVideos = dedupeVideos(allVideos.map((row) => row.video));
  const subscribersByVideo = new Map(
    allVideos.map((row) => [row.video.videoId, row.subscribers] as const)
  );
  const handleByVideo = new Map(
    allVideos.map((row) => [row.video.videoId, row.handle] as const)
  );

  const strictRows: StrictRow[] = [];
  for (const video of uniqueVideos) {
    const subscribers = subscribersByVideo.get(video.videoId) ?? 0;
    const score = strictScore(video, subscribers);
    if (!score) continue;
    strictRows.push({
      video,
      handle: handleByVideo.get(video.videoId) || video.ownerHandle || "unknown",
      subscribers,
      score,
    });
  }

  const adapted = adaptYouTubeShorts(
    strictRows.map((row) => row.video),
    { niche: NICHE, creatorFollowers: null }
  ).map((candidate) => {
    const strict = strictRows.find((row) => row.video.videoId === candidate.sourceId);
    if (!strict) return candidate;
    return {
      ...candidate,
      creatorFollowers: strict.subscribers,
      creatorHandle: `@${strict.handle.replace(/^@/, "")}`,
      creatorName: strict.handle,
      views: strict.video.viewCount,
      likes: strict.video.likeCount,
      comments: strict.video.commentCount,
      reachMultiplier: strict.score.reachMultiplier,
      engagementRate: strict.score.engagementRate,
    };
  });

  let haikuCalls = 0;
  let verdicts: SemanticPoolVerdict[] = [];
  if (adapted.length > 0) {
    const classified = await classifySemanticPoolRelevance({
      niche: NICHE,
      candidates: adapted,
    });
    haikuCalls = classified.haikuCalls;
    verdicts = classified.verdicts;
  }

  const routed = routeSemanticPoolCandidates({
    sourcePillar: "restaurant operations",
    candidates: adapted,
    verdicts,
  });

  const byPillar = new Map<string, number>();
  for (const pillar of DEFAULT_CONTENT_PILLARS) byPillar.set(pillar, 0);
  let domainRelevant = 0;
  const domainByHandle = new Map<string, number>();
  const pillarCountsByHandle = new Map<string, Map<string, number>>();

  const verdictById = new Map(verdicts.map((verdict) => [verdict.sourceId, verdict]));
  for (const row of strictRows) {
    const verdict = verdictById.get(row.video.videoId);
    if (
      !verdict?.domainRelevant ||
      !verdict.primaryPillar ||
      verdict.confidence < MIN_SEMANTIC_POOL_CONFIDENCE
    ) {
      continue;
    }
    domainRelevant += 1;
    byPillar.set(verdict.primaryPillar, (byPillar.get(verdict.primaryPillar) ?? 0) + 1);
    domainByHandle.set(row.handle, (domainByHandle.get(row.handle) ?? 0) + 1);
    if (!pillarCountsByHandle.has(row.handle)) {
      pillarCountsByHandle.set(row.handle, new Map());
    }
    const local = pillarCountsByHandle.get(row.handle)!;
    local.set(verdict.primaryPillar, (local.get(verdict.primaryPillar) ?? 0) + 1);
  }

  for (const report of seedReports) {
    if (!report.verified) continue;
    report.domainStrict = domainByHandle.get(report.handle) ?? 0;
    const local = pillarCountsByHandle.get(report.handle);
    if (local && local.size > 0) {
      report.bestPillar = [...local.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    }
    report.classification = classifySeed(report.domainStrict);
  }

  const winningChannels = seedReports.filter((row) => row.domainStrict > 0).length;
  const approxSc =
    verified.length + okHandles.length * APPROX_SC_CALLS_PER_VERIFIED_SEED;

  console.log("\n============================================================");
  console.log("PER-CHANNEL SUMMARY");
  console.log("============================================================");
  for (const row of seedReports) {
    console.log(
      `@${row.handle} | verified=${row.verified} | subs=${row.subscribers} | shorts=${row.scraped} | last90d=${row.last90d} | >=1k=${row.ge1k} | >=5k=${row.ge5k} | strict=${row.strict} | domainStrict=${row.domainStrict} | best=${row.bestPillar} | ${row.classification}`
    );
    console.log(`  note: ${row.note}`);
  }

  console.log("\nCHANNEL COMPARISON");
  console.log(
    "channel | subscribers | shorts | >=1k | >=5k | strict | restaurant-domain strict | best pillar | result"
  );
  for (const row of seedReports) {
    console.log(
      `${row.handle} | ${row.subscribers} | ${row.scraped} | ${row.ge1k} | ${row.ge5k} | ${row.strict} | ${row.domainStrict} | ${row.bestPillar} | ${row.classification}`
    );
  }

  console.log("\nCOMBINED");
  console.log(`verified channels: ${okHandles.length}/${handles.length}`);
  console.log(`total unique Shorts: ${uniqueVideos.length}`);
  console.log(`total strict viral: ${strictRows.length}`);
  console.log(`strict domain-relevant restaurant/hospitality: ${domainRelevant}`);
  for (const pillar of DEFAULT_CONTENT_PILLARS) {
    console.log(`${pillar}: ${byPillar.get(pillar) ?? 0}`);
  }
  console.log(`semantic reroutes (from ops lens): ${routed.rerouted.length}`);
  console.log(`semantic rejected: ${routed.rejected.length}`);
  console.log(`channels contributing domain winners: ${winningChannels}`);
  console.log(`semantic Haiku calls: ${haikuCalls}`);
  console.log(`approx SC calls: ~${approxSc}`);
  console.log(`estimated SC cost: ~$${(approxSc * DEFAULT_SC_USD_PER_CREDIT).toFixed(4)}`);

  const pass = domainRelevant >= 5 && winningChannels >= 2;
  const softPass = domainRelevant >= 5;
  console.log(
    `\nDECISION GATE: ${pass ? "PASS" : softPass ? "SOFT PASS (one-channel concentration)" : "FAIL"}`
  );
  console.log(
    `threshold: >=5 domain-relevant strict (${domainRelevant}) and preferably >=2 channels (${winningChannels})`
  );

  console.log("\nSTRICT DOMAIN-RELEVANT CANDIDATES");
  const domainRows = strictRows.filter((row) => {
    const verdict = verdictById.get(row.video.videoId);
    return (
      verdict?.domainRelevant === true &&
      Boolean(verdict.primaryPillar) &&
      (verdict.confidence ?? 0) >= MIN_SEMANTIC_POOL_CONFIDENCE
    );
  });
  if (domainRows.length === 0) console.log("None.");
  for (const row of domainRows.sort((a, b) => b.score.reachMultiplier - a.score.reachMultiplier)) {
    const verdict = verdictById.get(row.video.videoId)!;
    console.log(
      `@${row.handle} | ${row.video.videoId} | views=${row.video.viewCount} | subs=${row.subscribers} | reach=${row.score.reachMultiplier.toFixed(2)}x | likes=${row.video.likeCount} | comments=${row.video.commentCount} | tier=${row.score.tier} | viralScore=${row.score.viralScore.toFixed(2)}`
    );
    console.log(`  title: ${short(row.video.title || row.video.description)}`);
    console.log(
      `  semantic=${verdict.primaryPillar} | conf=${verdict.confidence.toFixed(2)} | published=${row.video.postedAt?.toISOString?.() || "n/a"}`
    );
    console.log(
      `  ${row.video.videoPageUrl || `https://www.youtube.com/shorts/${row.video.videoId}`}`
    );
  }
  console.log("============================================================\n");
}

main().catch((error) => {
  console.error("[viral-posts-youtube-seed-quality-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
