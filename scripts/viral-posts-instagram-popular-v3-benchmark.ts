import "dotenv/config";
import {
  enrichInstagramPostByUrl,
  fetchProfile,
  searchInstagramPopular,
  type InstagramSearchPost,
} from "../server/instagram";
import {
  TIER2_MIN_REACH_MULTIPLIER,
  TIER2_MIN_VIEWS,
  scoreViralMetrics,
  type ViralMetricsScore,
} from "../server/discovery/scoring";
import type { AdaptedCandidate } from "../server/viralPosts/candidateAdapter";
import { deriveHook } from "../server/viralPosts/candidateAdapter";
import {
  classifySemanticPoolRelevance,
  MIN_SEMANTIC_POOL_CONFIDENCE,
  routeSemanticPoolCandidates,
  type SemanticPoolVerdict,
} from "../server/viralPosts/semanticPoolRelevance";

delete process.env.DATABASE_URL;

if (!process.env.ANTHROPIC_API_KEY || !process.env.SCRAPECREATORS_API_KEY) {
  throw new Error(
    "ANTHROPIC_API_KEY and SCRAPECREATORS_API_KEY are required for this read-only benchmark"
  );
}

const DEFAULT_SC_USD_PER_CREDIT = 0.002;
const MAX_POPULAR_CALLS = 5;
const MAX_PROFILE_CALLS = 8;
const MAX_POST_DETAIL_CALLS = 5;
const MAX_TOTAL_SC_CALLS = MAX_POPULAR_CALLS + MAX_PROFILE_CALLS + MAX_POST_DETAIL_CALLS;
const TOP_PREFILTER_ROWS_TO_PRINT = 15;

const PILLAR_QUERY_FALLBACKS: Record<string, string[]> = {
  "restaurant operations": [
    "restaurant management",
    "staff training",
    "restaurant inventory",
    "restaurant SOP",
    "kitchen workflow",
  ],
  "restaurant profitability": [
    "restaurant profit",
    "food cost",
    "restaurant margins",
    "restaurant pricing",
    "restaurant growth",
  ],
  "restaurant marketing": [
    "restaurant marketing",
    "restaurant promotion",
    "restaurant social",
    "restaurant loyalty",
    "restaurant branding",
  ],
  "kitchen buildouts": [
    "restaurant equipment",
    "kitchen equipment",
    "kitchen layout",
    "restaurant buildout",
    "kitchen workflow",
  ],
};

type PopularRow = InstagramSearchPost & { queries: string[] };
type StrictRow = { post: PopularRow; score: ViralMetricsScore };

type RankedPrimaryRow = {
  post: PopularRow;
  verdict: SemanticPoolVerdict;
  score: number;
};

function argValue(name: string): string | null {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]!.trim() : null;
}

function short(value: string | null | undefined, max = 180): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "(no caption)";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function queriesForPillar(pillar: string): string[] {
  const explicit = argValue("--queries");
  if (explicit) {
    return explicit
      .split("|")
      .map((query) => query.replace(/#/g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, MAX_POPULAR_CALLS);
  }
  return (
    PILLAR_QUERY_FALLBACKS[pillar] || [
      pillar,
      `${pillar} tips`,
      `${pillar} systems`,
      `${pillar} strategy`,
      `${pillar} management`,
    ]
  ).slice(0, MAX_POPULAR_CALLS);
}

function mergePopularRows(rows: Array<InstagramSearchPost & { query: string }>): PopularRow[] {
  const byId = new Map<string, PopularRow>();
  for (const row of rows) {
    const existing = byId.get(row.shortcode);
    if (!existing) {
      byId.set(row.shortcode, { ...row, queries: [row.query] });
      continue;
    }
    if (!existing.queries.includes(row.query)) existing.queries.push(row.query);
    if ((row.views ?? 0) > (existing.views ?? 0)) existing.views = row.views;
    if ((row.likes ?? 0) > (existing.likes ?? 0)) existing.likes = row.likes;
    if ((row.comments ?? 0) > (existing.comments ?? 0)) existing.comments = row.comments;
    if (!existing.ownerUsername && row.ownerUsername) existing.ownerUsername = row.ownerUsername;
  }
  return [...byId.values()];
}

function toAdapted(post: PopularRow, niche: string): AdaptedCandidate {
  const caption = post.caption || "";
  return {
    platform: "instagram",
    sourceId: post.shortcode,
    sourceUrl: post.sourceUrl,
    creatorId: post.ownerUsername || null,
    creatorName: post.ownerUsername || "Instagram creator",
    creatorHandle: post.ownerUsername ? `@${post.ownerUsername}` : null,
    creatorAvatarUrl: null,
    creatorFollowers: post.ownerFollowerCount,
    thumbnailUrl: post.thumbnailUrl,
    videoUrl: post.videoUrl,
    caption,
    transcript: null,
    hashtags: [],
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
    relevanceLabel: "Instagram Popular v3 benchmark",
    relevanceReason: `Popular search candidate for ${niche}`,
    hook: deriveHook(caption),
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: {
      source: "instagram_popular_v3_benchmark",
      queries: post.queries,
    },
  };
}

function verdictMap(verdicts: SemanticPoolVerdict[]): Map<string, SemanticPoolVerdict> {
  return new Map(verdicts.map((verdict) => [verdict.sourceId, verdict]));
}

function rankPrimaryRows(args: {
  posts: PopularRow[];
  verdicts: SemanticPoolVerdict[];
  pillar: string;
}): RankedPrimaryRow[] {
  const byVerdict = verdictMap(args.verdicts);
  return args.posts
    .map((post) => {
      const verdict = byVerdict.get(post.shortcode);
      if (
        post.views == null ||
        post.views < TIER2_MIN_VIEWS ||
        !post.ownerUsername ||
        !verdict?.domainRelevant ||
        verdict.primaryPillar !== args.pillar ||
        verdict.confidence < MIN_SEMANTIC_POOL_CONFIDENCE
      ) {
        return null;
      }
      const score = verdict.confidence * Math.log10(1 + post.views);
      return { post, verdict, score };
    })
    .filter((row): row is RankedPrimaryRow => row !== null)
    .sort((a, b) => b.score - a.score);
}

/**
 * Select creator profiles with query diversity before filling remaining slots by rank.
 * This tests whether the v2 winner concentration was a shortlist-allocation artifact.
 */
function selectDiversifiedCreators(args: {
  ranked: RankedPrimaryRow[];
  queries: string[];
  maxCreators: number;
}): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const query of args.queries) {
    if (selected.length >= args.maxCreators) break;
    const row = args.ranked.find((candidate) => {
      if (!candidate.post.queries.includes(query)) return false;
      const handle = candidate.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
      return handle && !seen.has(handle);
    });
    if (!row) continue;
    const handle = row.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
    seen.add(handle);
    selected.push(handle);
  }

  for (const row of args.ranked) {
    if (selected.length >= args.maxCreators) break;
    const handle = row.post.ownerUsername.replace(/^@/, "").trim().toLowerCase();
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    selected.push(handle);
  }

  return selected;
}

function applyProfile(
  posts: PopularRow[],
  handle: string,
  profile: Awaited<ReturnType<typeof fetchProfile>>
): number {
  const clean = handle.replace(/^@/, "").trim().toLowerCase();
  let touched = 0;
  for (const post of posts) {
    if (post.ownerUsername.replace(/^@/, "").trim().toLowerCase() !== clean) continue;
    if (!post.ownerFollowerCount && profile.followerCount > 0) {
      post.ownerFollowerCount = profile.followerCount;
      touched++;
    }
    post.ownerIsPrivate = profile.isPrivate;
    post.ownerIsVerified = profile.isVerified;
  }
  return touched;
}

function prequalifiesForDetail(post: PopularRow): boolean {
  if (
    post.views == null ||
    post.views < TIER2_MIN_VIEWS ||
    post.ownerFollowerCount == null ||
    post.ownerFollowerCount <= 0 ||
    post.ownerIsPrivate === true
  ) {
    return false;
  }
  return post.views / post.ownerFollowerCount >= TIER2_MIN_REACH_MULTIPLIER;
}

function selectPostsForDetail(args: {
  posts: PopularRow[];
  verdicts: SemanticPoolVerdict[];
  pillar: string;
  maxPosts: number;
}): PopularRow[] {
  const byVerdict = verdictMap(args.verdicts);
  return args.posts
    .filter((post) => {
      const verdict = byVerdict.get(post.shortcode);
      return (
        prequalifiesForDetail(post) &&
        verdict?.domainRelevant === true &&
        verdict.primaryPillar === args.pillar &&
        verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE
      );
    })
    .sort((a, b) => {
      const va = byVerdict.get(a.shortcode)?.confidence ?? 0;
      const vb = byVerdict.get(b.shortcode)?.confidence ?? 0;
      const reachA = (a.views ?? 0) / Math.max(1, a.ownerFollowerCount ?? 1);
      const reachB = (b.views ?? 0) / Math.max(1, b.ownerFollowerCount ?? 1);
      return vb * Math.log10(1 + reachB) - va * Math.log10(1 + reachA);
    })
    .slice(0, Math.max(0, args.maxPosts));
}

function mergePostDetail(post: PopularRow, detail: InstagramSearchPost): void {
  post.views = detail.views ?? post.views;
  post.likes = detail.likes ?? post.likes;
  post.comments = detail.comments ?? post.comments;
  post.publishedAt = detail.publishedAt ?? post.publishedAt;
  post.thumbnailUrl = detail.thumbnailUrl ?? post.thumbnailUrl;
  post.videoUrl = detail.videoUrl ?? post.videoUrl;
  post.ownerUsername = detail.ownerUsername || post.ownerUsername;
  post.ownerFollowerCount = detail.ownerFollowerCount ?? post.ownerFollowerCount;
  post.ownerIsPrivate = detail.ownerIsPrivate ?? post.ownerIsPrivate;
  post.ownerIsVerified = detail.ownerIsVerified ?? post.ownerIsVerified;
}

function strictScore(post: PopularRow): ViralMetricsScore | null {
  if (
    post.views == null ||
    post.views <= 0 ||
    post.ownerFollowerCount == null ||
    post.ownerFollowerCount <= 0
  ) {
    return null;
  }
  return scoreViralMetrics({
    views: post.views,
    likes: post.likes ?? 0,
    comments: post.comments ?? 0,
    followers: post.ownerFollowerCount,
    isPrivate: post.ownerIsPrivate === true,
  });
}

async function main(): Promise<void> {
  const niche = argValue("--niche") || "Business & Entrepreneurship";
  const pillar = argValue("--pillar") || "restaurant operations";
  const queries = queriesForPillar(pillar);

  const collected: Array<InstagramSearchPost & { query: string }> = [];
  const perQuery = new Map<string, { ok: boolean; raw: number }>();
  let popularCalls = 0;

  for (const query of queries) {
    try {
      const result = await searchInstagramPopular(query);
      popularCalls += 1;
      perQuery.set(query, { ok: true, raw: result.rawCount });
      for (const post of result.posts) collected.push({ ...post, query });
    } catch (error) {
      popularCalls += 1;
      perQuery.set(query, { ok: false, raw: 0 });
      console.warn("[instagram-popular-v3] popular_failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const posts = mergePopularRows(collected);
  const prefilter = await classifySemanticPoolRelevance({
    niche,
    candidates: posts.map((post) => toAdapted(post, niche)),
  });
  const rankedPrimary = rankPrimaryRows({ posts, verdicts: prefilter.verdicts, pillar });

  console.log("\nTOP PRIMARY PREFILTER CANDIDATES BEFORE ENRICHMENT");
  for (const row of rankedPrimary.slice(0, TOP_PREFILTER_ROWS_TO_PRINT)) {
    console.log(
      `${row.post.ownerUsername} | ${row.post.shortcode} | query=${row.post.queries.join("+")} | views=${row.post.views ?? "n/a"} | conf=${row.verdict.confidence.toFixed(2)} | ${short(row.post.caption, 120)}`
    );
  }

  const selectedCreators = selectDiversifiedCreators({
    ranked: rankedPrimary,
    queries,
    maxCreators: MAX_PROFILE_CALLS,
  });

  let profileCalls = 0;
  let profileFailures = 0;
  const profileTouchCounts = new Map<string, number>();
  for (const handle of selectedCreators) {
    try {
      const profile = await fetchProfile(handle);
      profileCalls += 1;
      profileTouchCounts.set(handle, applyProfile(posts, handle, profile));
    } catch (error) {
      profileCalls += 1;
      profileFailures += 1;
      profileTouchCounts.set(handle, 0);
      console.warn("[instagram-popular-v3] profile_failed", {
        handle,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const detailSelected = selectPostsForDetail({
    posts,
    verdicts: prefilter.verdicts,
    pillar,
    maxPosts: MAX_POST_DETAIL_CALLS,
  });

  let postDetailCalls = 0;
  let postDetailFailures = 0;
  for (const post of detailSelected) {
    try {
      const detail = await enrichInstagramPostByUrl(post.sourceUrl);
      postDetailCalls += 1;
      if (!detail) {
        postDetailFailures += 1;
        continue;
      }
      mergePostDetail(post, detail);
    } catch (error) {
      postDetailCalls += 1;
      postDetailFailures += 1;
      console.warn("[instagram-popular-v3] post_detail_failed", {
        shortcode: post.shortcode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const prefilterById = verdictMap(prefilter.verdicts);
  const strictRows: StrictRow[] = [];
  for (const post of posts) {
    const verdict = prefilterById.get(post.shortcode);
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
    candidates: strictRows.map((row) => {
      const candidate = toAdapted(row.post, niche);
      candidate.creatorFollowers = row.post.ownerFollowerCount;
      candidate.views = row.post.views;
      candidate.likes = row.post.likes;
      candidate.comments = row.post.comments;
      candidate.reachMultiplier = row.score.reachMultiplier;
      candidate.engagementRate = row.score.engagementRate;
      return candidate;
    }),
  });

  const routed = routeSemanticPoolCandidates({
    sourcePillar: pillar,
    candidates: strictRows.map((row) => {
      const candidate = toAdapted(row.post, niche);
      candidate.creatorFollowers = row.post.ownerFollowerCount;
      candidate.views = row.post.views;
      candidate.likes = row.post.likes;
      candidate.comments = row.post.comments;
      candidate.reachMultiplier = row.score.reachMultiplier;
      candidate.engagementRate = row.score.engagementRate;
      return candidate;
    }),
    verdicts: finalSemantic.verdicts,
  });

  const primaryPrefilter = rankedPrimary.length;
  const siblingPrefilter = prefilter.verdicts.filter(
    (verdict) =>
      verdict.domainRelevant &&
      verdict.primaryPillar &&
      verdict.primaryPillar !== pillar &&
      verdict.confidence >= MIN_SEMANTIC_POOL_CONFIDENCE
  ).length;
  const rejectedPrefilter = posts.length - primaryPrefilter - siblingPrefilter;

  const strictIds = new Set(strictRows.map((row) => row.post.shortcode));
  const strictCreators = new Set(
    strictRows.map((row) => row.post.ownerUsername.replace(/^@/, "").trim().toLowerCase())
  );
  const wastedProfileCalls = selectedCreators.filter((handle) => !strictCreators.has(handle)).length;
  const wastedPostDetailCalls = detailSelected.filter((post) => !strictIds.has(post.shortcode)).length;
  const robustStrict = strictRows.filter(
    (row) => row.post.likes != null || row.post.comments != null
  ).length;
  const totalScCalls = popularCalls + profileCalls + postDetailCalls;

  console.log("\n============================================================");
  console.log("SPYREELS READ-ONLY INSTAGRAM POPULAR V3 ALLOCATION BENCHMARK");
  console.log("============================================================");
  console.log(`pillar: ${pillar}`);
  console.log(`niche: ${niche}`);
  console.log(`queries: ${queries.join(" | ")}`);
  console.log("NO DB WRITES. NO POOL REFRESH. NO PRODUCTION WIRING.");

  console.log("\nSEARCH");
  for (const query of queries) {
    const result = perQuery.get(query);
    console.log(`${query}: ${result?.ok ? "OK" : "FAIL"} raw=${result?.raw ?? 0}`);
  }
  console.log(`Popular calls: ${popularCalls}/${MAX_POPULAR_CALLS}`);
  console.log(`unique posts: ${posts.length}`);
  console.log(`unique creators: ${new Set(posts.map((p) => p.ownerUsername.toLowerCase()).filter(Boolean)).size}`);

  console.log("\nSEMANTIC PREFILTER");
  console.log(`primary ${pillar}: ${primaryPrefilter}`);
  console.log(`sibling pillar: ${siblingPrefilter}`);
  console.log(`rejected/low/missing: ${rejectedPrefilter}`);
  console.log(`Haiku calls: ${prefilter.haikuCalls}`);

  console.log("\nENRICHMENT");
  console.log(`selected creators: ${selectedCreators.join(", ") || "(none)"}`);
  console.log(`profile calls: ${profileCalls}/${MAX_PROFILE_CALLS}`);
  console.log(`profile failures: ${profileFailures}`);
  for (const handle of selectedCreators) {
    console.log(`  @${handle}: follower data attached to ${profileTouchCounts.get(handle) ?? 0} post(s)`);
  }
  console.log(`post-detail calls: ${postDetailCalls}/${MAX_POST_DETAIL_CALLS}`);
  console.log(`post-detail failures: ${postDetailFailures}`);
  console.log(`wasted profile calls: ${wastedProfileCalls}`);
  console.log(`wasted post-detail calls: ${wastedPostDetailCalls}`);

  console.log("\nSTRICT + FINAL ROUTING");
  console.log(`strict viral primary-prefilter rows: ${strictRows.length}`);
  console.log(`strict with real likes/comments: ${robustStrict}`);
  console.log(`FINAL current-pool admitted: ${routed.currentPool.length}`);
  console.log(`FINAL sibling rerouted: ${routed.rerouted.length}`);
  console.log(`FINAL rejected: ${routed.rejected.length}`);
  console.log(`final semantic Haiku calls: ${finalSemantic.haikuCalls}`);

  console.log("\nCOST");
  console.log(`TOTAL SC CALLS: ${totalScCalls}/${MAX_TOTAL_SC_CALLS}`);
  console.log(`estimated SC cost: $${(totalScCalls * DEFAULT_SC_USD_PER_CREDIT).toFixed(4)}`);
  console.log(`total semantic Haiku calls: ${prefilter.haikuCalls + finalSemantic.haikuCalls}`);

  console.log("\nSTRICT ROWS");
  const finalById = verdictMap(finalSemantic.verdicts);
  for (const row of strictRows.sort((a, b) => b.score.reachMultiplier - a.score.reachMultiplier)) {
    const verdict = finalById.get(row.post.shortcode);
    const disposition = routed.currentPool.some((item) => item.sourceId === row.post.shortcode)
      ? pillar
      : routed.rerouted.find((item) => item.candidate.sourceId === row.post.shortcode)?.targetPillar ||
        (routed.rejected.some((item) => item.candidate.sourceId === row.post.shortcode)
          ? "rejected"
          : "unclassified");
    console.log(
      `${row.post.ownerUsername || "(unknown)"} | ${row.post.shortcode} | query=${row.post.queries.join("+")} | views=${row.post.views ?? "n/a"} | followers=${row.post.ownerFollowerCount ?? "n/a"} | reach=${row.score.reachMultiplier.toFixed(2)}x | likes=${row.post.likes ?? "n/a"} | comments=${row.post.comments ?? "n/a"} | tier=${row.score.tier} | viralScore=${row.score.viralScore.toFixed(2)}`
    );
    console.log(`  caption: ${short(row.post.caption)}`);
    console.log(
      `  semantic=${verdict?.primaryPillar || "(none)"} | conf=${verdict?.confidence?.toFixed(2) ?? "n/a"} | disposition=${disposition}`
    );
    console.log(`  ${row.post.sourceUrl}`);
  }
  console.log("============================================================\n");
}

main().catch((error) => {
  console.error("[viral-posts-instagram-popular-v3-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
