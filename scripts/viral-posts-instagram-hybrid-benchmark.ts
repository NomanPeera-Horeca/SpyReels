import "dotenv/config";
import { discoverInstagramHybridCandidates } from "../server/viralPosts/instagramHybridDiscovery";

delete process.env.DATABASE_URL;
if (!process.env.ANTHROPIC_API_KEY || !process.env.SCRAPECREATORS_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY and SCRAPECREATORS_API_KEY are required for this read-only benchmark");
}

function argValue(name: string): string | null {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]!.trim() : null;
}

function short(value: string | null | undefined, max = 160): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "(no caption)";
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

async function main() {
  const niche = argValue("--niche") || "Business & Entrepreneurship";
  const pillar = argValue("--pillar") || "restaurant operations";
  const region = argValue("--region") || "US";

  const result = await discoverInstagramHybridCandidates({
    niche,
    pillar,
    region,
  });

  console.log("\n============================================================");
  console.log("SPYREELS READ-ONLY INSTAGRAM HYBRID BENCHMARK");
  console.log("============================================================");
  console.log(`pillar: ${pillar}`);
  console.log(`niche: ${niche}`);
  console.log(`region: ${region}`);
  console.log("NO DB WRITES. NO POOL REFRESH. NO PRODUCTION WIRING.");

  console.log("\nSEARCH");
  console.log(`generated concepts: ${result.generatedQueries.join(" | ")}`);
  console.log(`Popular queries: ${result.popularQueries.join(" | ")}`);
  console.log(`keyword queries: ${result.keywordQueries.join(" | ")}`);
  console.log(`hashtag queries: ${result.hashtagQueries.join(" | ")}`);
  console.log(`Popular calls: ${result.popularCalls}`);
  console.log(`keyword calls: ${result.keywordCalls}`);
  console.log(`hashtag calls: ${result.hashtagCalls}`);
  console.log(`raw Popular: ${result.rawPopular}`);
  console.log(`raw keyword: ${result.rawKeyword}`);
  console.log(`raw hashtag: ${result.rawHashtag}`);
  console.log(`unique posts: ${result.uniquePosts}`);
  console.log(`unique creators: ${result.uniqueCreators}`);
  console.log(`cross-lane overlap: ${result.crossLaneOverlap}`);

  console.log("\nSEMANTIC PREFILTER");
  console.log(`domain relevant: ${result.prefilterDomainRelevant}`);
  console.log(`primary operations: ${result.prefilterPrimaryOperations}`);
  console.log(`sibling pillar: ${result.prefilterSibling}`);
  console.log(`rejected: ${result.prefilterRejected}`);
  console.log(`Haiku calls: ${result.prefilterHaikuCalls}`);

  console.log("\nENRICHMENT");
  console.log(`Popular creators selected: ${result.popularCreatorsSelected.join(", ") || "(none)"}`);
  console.log(`profile calls: ${result.profileCalls}`);
  console.log(`keyword/hashtag posts selected: ${result.keywordHashtagPostsSelected}`);
  console.log(`post-detail calls: ${result.postDetailCalls}`);
  console.log(`enrichment failures: ${result.enrichmentFailures}`);
  console.log(`views recovered: ${result.viewsRecovered}`);
  console.log(`followers recovered: ${result.followersRecovered}`);
  console.log(`both metrics present after enrichment: ${result.bothMetricsRecovered}`);
  console.log(`metric_missing after shortlist: ${result.metricMissing}`);

  console.log("\nSTRICT");
  console.log(`strict viral total: ${result.strictViral}`);
  console.log(`current operations: ${result.adapted.length}`);
  console.log(`sibling reroutes: ${result.semanticRerouted}`);
  console.log(`rejected: ${result.semanticRejected}`);

  console.log("\nCOST");
  console.log(`search SC calls: ${result.searchCalls}`);
  console.log(`TOTAL SC CALLS: ${result.totalScCalls}`);
  console.log(`estimated SC cost: $${result.costEstimateUsd.toFixed(4)}`);
  console.log(`query-generation Haiku calls: ${result.queryGenerationHaikuCalls}`);
  console.log(`semantic Haiku calls: ${result.semanticHaikuCalls}`);
  console.log(`wasted enrichment calls (no strict viral): ${result.wastedEnrichmentCalls}`);

  console.log("\nSTRICT VIRAL RESULTS");
  console.log("------------------------------------------------------------");
  if (result.strictRows.length === 0) {
    console.log("None.");
  }
  for (const row of result.strictRows) {
    const adapted =
      result.adapted.find((item) => item.sourceId === row.post.shortcode) ||
      result.reroutedCandidates.find((item) => item.candidate.sourceId === row.post.shortcode)
        ?.candidate ||
      result.semanticRejectedCandidates.find((item) => item.candidate.sourceId === row.post.shortcode)
        ?.candidate;
    const raw = adapted?.rawProviderPayload || {};
    const primary =
      (typeof raw.semanticPrimaryPillar === "string" && raw.semanticPrimaryPillar) ||
      adapted?.contentPillar ||
      "(none)";
    const confidence =
      typeof raw.semanticPillarConfidence === "number"
        ? raw.semanticPillarConfidence
        : adapted?.pillarConfidence;
    const rejected = result.semanticRejectedCandidates.find(
      (item) => item.candidate.sourceId === row.post.shortcode
    );
    const rerouted = result.reroutedCandidates.find(
      (item) => item.candidate.sourceId === row.post.shortcode
    );
    const admitted = result.adapted.some((item) => item.sourceId === row.post.shortcode);
    const disposition = rejected
      ? `rejected (${rejected.reason})`
      : rerouted
        ? `rerouted to ${rerouted.targetPillar}`
        : admitted
          ? pillar
          : "unclassified";
    console.log(
      `${row.post.ownerUsername || "(unknown)"} | ${row.post.shortcode} | lanes=${row.post.lanes.join("+")} | views=${row.views} | followers=${row.followers} | reach=${row.score.reachMultiplier.toFixed(2)}x | likes=${row.post.likes ?? "n/a"} | comments=${row.post.comments ?? "n/a"} | tier=${row.score.tier} score=${row.score.viralScore.toFixed(2)}`
    );
    console.log(`  query: ${row.post.queries.join(" | ")}`);
    console.log(`  caption: ${short(row.post.caption)}`);
    console.log(
      `  primary=${primary} | conf=${confidence == null ? "n/a" : Number(confidence).toFixed(2)} | disposition=${disposition}`
    );
    console.log(`  ${row.post.sourceUrl}`);
  }
  console.log("============================================================\n");
}

main().catch((error) => {
  console.error("[viral-posts-instagram-hybrid-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
