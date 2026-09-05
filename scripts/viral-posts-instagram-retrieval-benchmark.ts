import "dotenv/config";
import {
  discoverInstagramPoolCandidates,
  type InstagramPoolDiscoveryResult,
} from "../server/viralPosts/instagramPoolDiscovery";

function argValue(name: string): string | null {
  const argv = process.argv.slice(2);
  const inline = argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1]!.trim() : null;
}

function short(value: string | null | undefined, max = 100): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "(no caption)";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function printResult(result: InstagramPoolDiscoveryResult): void {
  console.log("\n============================================================");
  console.log("SPYREELS — INSTAGRAM RETRIEVAL DEPTH BENCHMARK");
  console.log("============================================================");
  console.log(`Description: ${result.description}`);
  console.log(`Routed niche: ${result.routedNiche}`);
  console.log(`Hashtags (${result.hashtagsUsed.length}): ${result.hashtagsUsed.map((tag) => `#${tag}`).join(", ")}`);
  if (result.hashtagFailures.length > 0) {
    console.log(`Hashtag failures: ${result.hashtagFailures.join(", ")}`);
  }

  console.log("\nCALL ALLOCATION");
  console.log("------------------------------------------------------------");
  console.log(`Route/hashtag-generation probe calls: ${result.routeProbeScCalls}`);
  console.log(`Raw hashtag creator-search calls: ${result.rawHashtagScCalls}`);
  console.log(`Total shallow discovery calls: ${result.shallowScCalls}`);
  console.log(`Selective drill calls: ${result.drillScCalls}`);
  console.log(`TOTAL SC CALLS: ${result.totalScCalls}`);
  console.log(`Estimated cost: $${result.costEstimateUsd.toFixed(4)}`);

  console.log("\nDISCOVERY DEPTH");
  console.log("------------------------------------------------------------");
  console.log(`Metric-bearing shallow viral candidates: ${result.shallowCandidateCount}`);
  console.log(`Raw hashtag posts read: ${result.rawHashtagPosts}`);
  console.log(`Metricless creator seeds: ${result.metriclessCreatorSeeds}`);
  console.log(`Unique shallow creators: ${result.uniqueShallowCreators}`);
  console.log(`Creators selected for drilling: ${result.selectedCreators.length}`);
  console.log(`Creators actually drilled before fuse: ${result.drilledCreatorHandles.length}`);
  console.log(`90-day reels read from drilled creators: ${result.drilledReelsRead}`);
  console.log(`Strict viral candidates unlocked by drilling: ${result.drilledViralCandidates}`);
  console.log(`Rejected by direct-pillar pool admission: ${result.poolAdmissionRejected}`);
  console.log(`Final pool-admitted candidate universe: ${result.adapted.length}`);

  console.log("\nCREATORS SELECTED FOR DRILLING");
  console.log("------------------------------------------------------------");
  result.selectedCreators.forEach((creator, index) => {
    const drilled = result.drilledCreatorHandles.includes(creator.handle) ? "DRILLED" : "NOT REACHED";
    console.log(
      `${index + 1}. @${creator.handle} | ${drilled} | seed=${creator.seedMode} | topic=${creator.topicSignalScore} | hashtag posts=${creator.hashtagReelCount} | hashtags=${creator.matchedHashtags.map((tag) => `#${tag}`).join(",") || "(scored only)"} | tier1=${creator.tier1Count} | best viral=${creator.bestViralScore.toFixed(2)} | best views=${creator.bestViews}`
    );
    if (creator.sampleCaption) {
      console.log(`   seed caption: ${short(creator.sampleCaption, 140)}`);
    }
  });

  console.log("\nPOOL-ADMITTED CREATOR-DRILL CANDIDATES");
  console.log("------------------------------------------------------------");
  const drilled = result.adapted
    .filter((candidate) => candidate.rawProviderPayload?.retrievalDepth === "creator_drill")
    .sort((a, b) => {
      const reachDiff = (b.reachMultiplier ?? 0) - (a.reachMultiplier ?? 0);
      if (reachDiff !== 0) return reachDiff;
      return (b.views ?? 0) - (a.views ?? 0);
    })
    .slice(0, 20);

  if (drilled.length === 0) {
    console.log("No creator-drill candidates passed direct-pillar pool admission.");
  } else {
    drilled.forEach((candidate, index) => {
      const confidence = Number(candidate.pillarConfidence ?? 0);
      console.log(
        `${index + 1}. ${candidate.creatorHandle || candidate.creatorName} | views=${candidate.views ?? 0} | followers=${candidate.creatorFollowers ?? 0} | reach=${(candidate.reachMultiplier ?? 0).toFixed(2)}x | pillarConf=${confidence.toFixed(2)} | trend=${candidate.trendStatus}`
      );
      console.log(`   ${short(candidate.hook || candidate.caption)}`);
      console.log(`   ${candidate.sourceUrl}`);
    });
  }
  console.log("============================================================\n");
}

async function main() {
  const niche = argValue("--niche") || "Business & Entrepreneurship";
  const pillar = argValue("--pillar") || "restaurant operations";
  const callsRaw = Number(argValue("--maxCalls") || "35");
  const maxScCalls = Number.isFinite(callsRaw)
    ? Math.max(1, Math.min(35, Math.floor(callsRaw)))
    : 35;
  const result = await discoverInstagramPoolCandidates({
    niche,
    pillar,
    maxScCalls,
  });
  printResult(result);
}

main().catch((error) => {
  console.error("[viral-posts-instagram-retrieval-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
