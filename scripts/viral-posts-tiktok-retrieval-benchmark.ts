import "dotenv/config";
import { discoverTikTokPoolCandidates } from "../server/viralPosts/tiktokPoolDiscovery";

delete process.env.DATABASE_URL;

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
  const maxScCalls = Math.min(6, Math.max(1, Number(argValue("--maxCalls") || "6") || 6));

  const result = await discoverTikTokPoolCandidates({
    niche,
    pillar,
    maxScCalls,
  });

  const verdictById = new Map(
    [
      ...result.adapted.map((candidate) => [candidate.sourceId, candidate] as const),
      ...result.reroutedCandidates.map((row) => [row.candidate.sourceId, row.candidate] as const),
      ...result.semanticRejectedCandidates.map((row) => [row.candidate.sourceId, row.candidate] as const),
    ]
  );

  console.log("\n============================================================");
  console.log("SPYREELS READ-ONLY TIKTOK RETRIEVAL BENCHMARK");
  console.log("============================================================");
  console.log(`pillar: ${pillar}`);
  console.log(`niche: ${niche}`);
  console.log(`generated queries: ${result.generatedQueries.join(" | ")}`);
  console.log(`keyword queries: ${result.keywordQueries.join(" | ")}`);
  console.log(`top queries: ${result.topQueries.join(" | ")}`);
  console.log(`keyword calls: ${result.keywordCalls}`);
  console.log(`top calls: ${result.topCalls}`);
  console.log(`TOTAL SC CALLS: ${result.totalScCalls}`);
  console.log(`query-generation Haiku calls: ${result.queryGenerationHaikuCalls}`);
  console.log(`semantic Haiku calls: ${result.semanticHaikuCalls}`);
  console.log(`estimated SC cost: $${result.costEstimateUsd.toFixed(4)}`);
  console.log(`raw videos: ${result.rawVideos}`);
  console.log(`unique videos: ${result.uniqueVideos}`);
  console.log(`unique creators: ${result.uniqueCreators}`);
  console.log(`keyword/Top overlap: ${result.keywordTopOverlap}`);
  console.log(`views available: ${result.viewsAvailable}/${result.uniqueVideos}`);
  console.log(`followers available: ${result.followersAvailable}/${result.uniqueVideos}`);
  console.log(`both views + followers: ${result.bothMetricsAvailable}/${result.uniqueVideos}`);
  console.log(`STRICT VIRAL: ${result.drilledViralCandidates}`);
  console.log(`SEMANTICALLY REJECTED: ${result.semanticRejected}`);
  console.log(`REROUTED: ${result.semanticRerouted}`);
  console.log(`CURRENT-POOL ADMITTED: ${result.adapted.length}`);
  console.log("NO DB WRITES. NO POOL REFRESH.");

  console.log("\nSTRICT VIRAL RESULTS");
  console.log("------------------------------------------------------------");
  if (result.strictViralRows.length === 0) {
    console.log("None.");
  }
  for (const row of result.strictViralRows) {
    const adapted = verdictById.get(row.video.awemeId);
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
      (item) => item.candidate.sourceId === row.video.awemeId
    );
    const rerouted = result.reroutedCandidates.find(
      (item) => item.candidate.sourceId === row.video.awemeId
    );
    const admitted = result.adapted.some((item) => item.sourceId === row.video.awemeId);
    const disposition = rejected
      ? `rejected (${rejected.reason})`
      : rerouted
        ? `rerouted to ${rerouted.targetPillar}`
        : admitted
          ? pillar
          : "unclassified";
    console.log(
      `${row.video.ownerUsername || "(unknown)"} | ${row.video.awemeId} | views=${row.video.viewCount} | followers=${row.video.creatorFollowerCount ?? "n/a"} | reach=${row.reachMultiplier.toFixed(2)}x | likes=${row.video.likeCount} | comments=${row.video.commentCount} | shares=${row.video.shareCount} | tier=${row.tier}`
    );
    console.log(`  caption: ${short(row.video.caption)}`);
    console.log(
      `  primary=${primary} | conf=${confidence == null ? "n/a" : Number(confidence).toFixed(2)} | disposition=${disposition}`
    );
    console.log(`  ${row.video.videoPageUrl}`);
  }
  console.log("============================================================\n");
}

main().catch((error) => {
  console.error("[viral-posts-tiktok-retrieval-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
