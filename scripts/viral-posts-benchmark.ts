import "dotenv/config";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  benchmarkViralTodayPicks,
  type ViralBenchmarkCandidate,
  type ViralBenchmarkSource,
} from "../server/viralPosts/benchmark";
import { loadTransferableFeaturedBenchmarkSupply } from "../server/viralPosts/benchmarkTransferableSupply";

type Args = {
  userId: number | null;
  email: string | null;
  json: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const valueFor = (names: string[]) => {
    for (const name of names) {
      const prefix = `${name}=`;
      const inline = argv.find((arg) => arg.startsWith(prefix));
      if (inline) return inline.slice(prefix.length).trim();
      const index = argv.indexOf(name);
      if (index >= 0 && argv[index + 1]) return argv[index + 1]!.trim();
    }
    return null;
  };
  const userRaw = valueFor(["--userId", "--user-id"]);
  const emailRaw = valueFor(["--email"]);
  const userId = userRaw ? Number(userRaw) : null;
  if (userRaw && (!Number.isInteger(userId) || (userId ?? 0) <= 0)) {
    throw new Error(`Invalid --userId: ${userRaw}`);
  }
  return {
    userId,
    email: emailRaw?.toLowerCase() || null,
    json: argv.includes("--json"),
  };
}

async function resolveUserId(args: Args): Promise<number> {
  if (args.userId) return args.userId;
  if (!args.email) {
    throw new Error(
      "Pass either --userId=<id> or --email=<account email>. Example: pnpm tsx scripts/viral-posts-benchmark.ts --email=creator@example.com"
    );
  }
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, args.email))
    .limit(1);
  if (!row) throw new Error(`No SpyReels user found for ${args.email}`);
  return row.id;
}

const SOURCE_LABELS: Record<ViralBenchmarkSource, string> = {
  direct_instagram_pool: "Direct IG pool",
  direct_tiktok_seed: "Direct TikTok seed",
  direct_youtube_seed: "Direct YouTube seed",
  transferable_featured: "Transferable Featured",
  collected: "Collected",
  creator_radar: "Creator Radar",
  similar_creator: "Similar creator",
  personal_other: "Other personal",
};

function pad(value: string | number, width: number): string {
  const text = String(value);
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function short(text: string | null | undefined, max = 78): string {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "(no hook/caption)";
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max - 1)}…`;
}

function printCandidate(candidate: ViralBenchmarkCandidate, index?: number): void {
  const prefix = index != null ? `${index}. ` : "- ";
  console.log(
    `${prefix}${candidate.creatorHandle || candidate.creatorName} | ${SOURCE_LABELS[candidate.source]} | ${candidate.platform} | score ${candidate.finalScore.toFixed(3)} | adapt ${candidate.adaptabilityScore.toFixed(0)} | rel ${candidate.relevanceScore.toFixed(0)}`
  );
  console.log(`   ${short(candidate.hook || candidate.caption)}`);
  console.log(
    `   pillar=${candidate.pillar} | format=${candidate.format || "unknown"} | trend=${candidate.trendStatus}`
  );
  if (candidate.rejectReason) {
    console.log(`   REJECTED: ${candidate.rejectReason}`);
  }
  console.log(`   ${candidate.sourceUrl}`);
}

function verdict(finalSelected: number, aboveFloor: number): string {
  if (finalSelected >= 7) {
    return "SUPPLY TARGET HIT — inspect the 7 manually for real remakeability/relevance.";
  }
  if (finalSelected >= 5) {
    return "USABLE BUT BELOW 7 — inspect quality before deciding whether retrieval needs widening.";
  }
  if (aboveFloor >= 5) {
    return "SELECTION/DIVERSITY BOTTLENECK — enough candidates pass quality, but fewer than 5 survive final selection.";
  }
  return "RETRIEVAL/QUALITY STARVATION — fewer than 5 candidates survive the quality floor.";
}

async function main() {
  const args = parseArgs();
  const userId = await resolveUserId(args);
  const report = await benchmarkViralTodayPicks({ userId });
  const transferableFeatured = await loadTransferableFeaturedBenchmarkSupply({
    niche: report.niche,
    pillars: report.pillars,
  });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          ...report,
          transferableFeaturedAvailable: transferableFeatured,
        },
        null,
        2
      )
    );
    return;
  }

  console.log("\n============================================================");
  console.log("SPYREELS — VIRAL POSTS TODAY'S PICKS BENCHMARK");
  console.log("============================================================");
  console.log(`User ID: ${report.userId}`);
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Niche: ${report.niche}`);
  console.log(`Pillars: ${report.pillars.join(" | ")}`);
  console.log(
    `Mode: ${report.benchmarkMode} | provider calls=${report.providerCalls} | daily-feed writes=${report.mutatesDailyFeed ? "yes" : "no"} | marks shown=${report.marksCandidatesShown ? "yes" : "no"}`
  );

  console.log("\nCANDIDATE SUPPLY");
  console.log("------------------------------------------------------------");
  for (const [key, count] of Object.entries(report.sourceCounts)) {
    console.log(`${pad(SOURCE_LABELS[key as ViralBenchmarkSource], 26)} ${count}`);
  }
  console.log(`${pad("Pools", 26)} ${report.poolCount}`);
  console.log(`${pad("Pooled candidates", 26)} ${report.funnel.pooledCandidates}`);
  console.log(
    `${pad("Personal offered", 26)} ${report.funnel.personalCandidatesOffered}`
  );
  console.log(
    `${pad("Personal added after dedupe", 26)} ${report.funnel.personalCandidatesAddedAfterCanonicalDedupe}`
  );
  console.log(`${pad("Canonical universe", 26)} ${report.funnel.canonicalUniverse}`);

  console.log("\nTRANSFERABLE FEATURED CATALOG — AVAILABLE NOW");
  console.log("------------------------------------------------------------");
  console.log(
    `Unique available: ${transferableFeatured.totalUnique} (diagnostic only; these are not automatically added to this benchmark ranking)`
  );
  for (const pillar of report.pillars) {
    console.log(
      `${pad(pillar, 30)} ${transferableFeatured.matchesByPillar[pillar] ?? 0}`
    );
  }
  if (transferableFeatured.examples.length > 0) {
    console.log("Examples:");
    for (const example of transferableFeatured.examples) {
      console.log(
        `- ${example.creatorHandle || "unknown creator"} | ${example.pillar} | ${example.format || "unknown"} | views=${example.views ?? "unknown"}`
      );
      console.log(`  ${short(example.hook)}`);
      console.log(`  ${example.sourceUrl}`);
    }
  }

  console.log("\nFILTER / RANKING FUNNEL");
  console.log("------------------------------------------------------------");
  console.log(`${pad("Hidden creator", 30)} ${report.funnel.hiddenCreators}`);
  console.log(`${pad("Recently dismissed", 30)} ${report.funnel.recentlyDismissed}`);
  console.log(`${pad("Shown in last 90 days", 30)} ${report.funnel.recentlyShown90d}`);
  console.log(
    `${pad("Eligible before quality floor", 30)} ${report.funnel.eligibleBeforeQualityFloor}`
  );
  console.log(`${pad("Above .45 quality floor", 30)} ${report.funnel.aboveQualityFloor}`);
  console.log(
    `${pad("Selected before pillar diversity", 30)} ${report.funnel.selectedBeforePillarDiversity}`
  );
  console.log(`${pad("FINAL SELECTED", 30)} ${report.funnel.finalSelected}`);

  console.log("\nPERSONALIZATION SUPPLY");
  console.log("------------------------------------------------------------");
  console.log(`Collected read: ${report.personalization.collectedRead}`);
  console.log(`Collected candidates: ${report.personalization.collectedCandidates}`);
  console.log(`Explicit creator handles: ${report.personalization.explicitCreatorHandles}`);
  console.log(`Radar searches read: ${report.personalization.radarSearchesRead}`);
  console.log(`Radar creators read: ${report.personalization.radarCreatorsRead}`);
  console.log(`Radar candidates: ${report.personalization.radarCandidates}`);
  console.log(`Similar niche slugs: ${report.personalization.similarNicheSlugs}`);
  console.log(`Similar creators read: ${report.personalization.similarCreatorsRead}`);
  console.log(`Similar candidates: ${report.personalization.similarCandidates}`);
  console.log(`Canonical reused: ${report.personalization.canonicalReused}`);
  console.log(`Canonical inserted: ${report.personalization.canonicalInserted}`);

  console.log("\nFINAL PICKS — MANUALLY REVIEW THESE");
  console.log("------------------------------------------------------------");
  if (report.selected.length === 0) {
    console.log("No candidates selected.");
  } else {
    report.selected.forEach((candidate, index) => printCandidate(candidate, index + 1));
  }

  console.log("\nSTRONGEST REJECTED CANDIDATES");
  console.log("------------------------------------------------------------");
  if (report.topRejected.length === 0) {
    console.log("No rejected candidates in the benchmark universe.");
  } else {
    report.topRejected.forEach((candidate) => printCandidate(candidate));
  }

  console.log("\nBENCHMARK VERDICT");
  console.log("------------------------------------------------------------");
  console.log(verdict(report.funnel.finalSelected, report.funnel.aboveQualityFloor));
  console.log(
    "Important: this verdict measures supply/ranking. Human review of the final reel URLs is still required to decide whether each idea is genuinely realistic to remake."
  );
  console.log("============================================================\n");
}

main().catch((error) => {
  console.error("[viral-posts-benchmark] FAILED");
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
