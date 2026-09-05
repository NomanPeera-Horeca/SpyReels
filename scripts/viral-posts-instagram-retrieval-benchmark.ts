import "dotenv/config";
import {
  discoverInstagramPoolCandidates,
  type InstagramPoolDiscoveryResult,
} from "../server/viralPosts/instagramPoolDiscovery";
import {
  SEMANTIC_POOL_MODEL,
  type SemanticPoolRejected,
  type SemanticPoolReroute,
} from "../server/viralPosts/semanticPoolRelevance";
import type { AdaptedCandidate } from "../server/viralPosts/candidateAdapter";

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
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}

function printSemanticRow(
  index: number,
  candidate: AdaptedCandidate,
  extras: {
    domainRelevant?: boolean | null;
    primaryPillar?: string | null;
    secondaryPillar?: string | null;
    confidence?: number | null;
    reason?: string | null;
  }
): void {
  const domain =
    extras.domainRelevant === true
      ? "yes"
      : extras.domainRelevant === false
        ? "no"
        : "unknown";
  const confidence =
    extras.confidence == null ? "n/a" : extras.confidence.toFixed(2);
  console.log(
    `${index + 1}. ${candidate.creatorHandle || candidate.creatorName} | sourceId=${candidate.sourceId}`
  );
  console.log(`   caption/hook: ${short(candidate.hook || candidate.caption, 160)}`);
  console.log(`   domain relevant: ${domain}`);
  console.log(`   primary pillar: ${extras.primaryPillar || "(none)"}`);
  console.log(`   secondary pillar: ${extras.secondaryPillar || "(none)"}`);
  console.log(`   confidence: ${confidence}`);
  console.log(`   reason: ${short(extras.reason, 180)}`);
  console.log(
    `   views=${candidate.views ?? 0} | followers=${candidate.creatorFollowers ?? 0} | reach=${(candidate.reachMultiplier ?? 0).toFixed(2)}x`
  );
  console.log(`   ${candidate.sourceUrl}`);
}

function printRejected(rows: SemanticPoolRejected[]): void {
  if (rows.length === 0) {
    console.log("None.");
    return;
  }
  rows.forEach((row, index) => {
    printSemanticRow(index, row.candidate, {
      domainRelevant: row.verdict?.domainRelevant ?? null,
      primaryPillar: row.verdict?.primaryPillar ?? null,
      secondaryPillar: row.verdict?.secondaryPillar ?? null,
      confidence: row.verdict?.confidence ?? null,
      reason: row.verdict?.reason || row.reason,
    });
  });
}

function printRerouted(rows: SemanticPoolReroute[]): void {
  if (rows.length === 0) {
    console.log("None.");
    return;
  }
  rows.forEach((row, index) => {
    printSemanticRow(index, row.candidate, {
      domainRelevant: row.verdict.domainRelevant,
      primaryPillar: row.verdict.primaryPillar,
      secondaryPillar: row.verdict.secondaryPillar,
      confidence: row.verdict.confidence,
      reason: `${row.verdict.reason} -> ${row.targetPillar}`,
    });
  });
}

function printAdmitted(rows: AdaptedCandidate[]): void {
  if (rows.length === 0) {
    console.log("None.");
    return;
  }
  rows.forEach((candidate, index) => {
    const raw = candidate.rawProviderPayload || {};
    printSemanticRow(index, candidate, {
      domainRelevant: raw.semanticDomainRelevant === true,
      primaryPillar:
        (typeof raw.semanticPrimaryPillar === "string" && raw.semanticPrimaryPillar) ||
        candidate.contentPillar,
      secondaryPillar:
        typeof raw.semanticSecondaryPillar === "string"
          ? raw.semanticSecondaryPillar
          : null,
      confidence:
        typeof raw.semanticPillarConfidence === "number"
          ? raw.semanticPillarConfidence
          : candidate.pillarConfidence,
      reason:
        (typeof raw.semanticPillarReason === "string" && raw.semanticPillarReason) ||
        candidate.relevanceReason,
    });
  });
}

function printResult(result: InstagramPoolDiscoveryResult): void {
  console.log("\n============================================================");
  console.log("SPYREELS INSTAGRAM RETRIEVAL DEPTH BENCHMARK");
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
  console.log(`Semantic model: ${SEMANTIC_POOL_MODEL}`);
  console.log(`Semantic Haiku calls: ${result.semanticHaikuCalls}`);

  console.log("\nDISCOVERY DEPTH");
  console.log("------------------------------------------------------------");
  console.log(`Metric-bearing shallow viral candidates: ${result.shallowCandidateCount}`);
  console.log(`Raw hashtag posts read: ${result.rawHashtagPosts}`);
  console.log(`Metricless creator seeds: ${result.metriclessCreatorSeeds}`);
  console.log(`Unique shallow creators: ${result.uniqueShallowCreators}`);
  console.log(`Creators selected for drilling: ${result.selectedCreators.length}`);
  console.log(`Creators actually drilled before fuse: ${result.drilledCreatorHandles.length}`);
  console.log(`90-day reels read from drilled creators: ${result.drilledReelsRead}`);
  console.log(`STRICT VIRAL CANDIDATES: ${result.drilledViralCandidates}`);
  console.log(`SEMANTICALLY REJECTED: ${result.semanticRejected}`);
  console.log(`REROUTED TO SIBLING PILLARS: ${result.semanticRerouted}`);
  console.log(`CURRENT-POOL ADMITTED: ${result.adapted.length}`);

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

  console.log("\nSTRICT VIRAL CANDIDATES");
  console.log("------------------------------------------------------------");
  const strictViral = [
    ...result.adapted,
    ...result.reroutedCandidates.map((row) => row.candidate),
    ...result.semanticRejectedCandidates.map((row) => row.candidate),
  ];
  const seen = new Set<string>();
  const uniqueStrict = strictViral.filter((candidate) => {
    if (seen.has(candidate.sourceId)) return false;
    seen.add(candidate.sourceId);
    return true;
  });
  if (uniqueStrict.length === 0) {
    console.log("None.");
  } else {
    uniqueStrict.forEach((candidate, index) => {
      console.log(
        `${index + 1}. ${candidate.creatorHandle || candidate.creatorName} | sourceId=${candidate.sourceId} | views=${candidate.views ?? 0} | followers=${candidate.creatorFollowers ?? 0} | reach=${(candidate.reachMultiplier ?? 0).toFixed(2)}x`
      );
      console.log(`   ${short(candidate.hook || candidate.caption, 160)}`);
      console.log(`   ${candidate.sourceUrl}`);
    });
  }

  console.log("\nSEMANTICALLY REJECTED");
  console.log("------------------------------------------------------------");
  printRejected(result.semanticRejectedCandidates);

  console.log("\nREROUTED TO SIBLING PILLARS");
  console.log("------------------------------------------------------------");
  printRerouted(result.reroutedCandidates);

  console.log("\nCURRENT-POOL ADMITTED");
  console.log("------------------------------------------------------------");
  printAdmitted(result.adapted);
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
