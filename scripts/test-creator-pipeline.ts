/**
 * Verify runCreatorDiscoveryPipeline (real server module, not the experiment script).
 *
 * Run:
 *   pnpm tsx scripts/test-creator-pipeline.ts
 *   pnpm tsx scripts/test-creator-pipeline.ts "your business description"
 *
 * Requires ANTHROPIC_API_KEY and SCRAPECREATORS_API_KEY in .env
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  runCreatorDiscoveryPipeline,
  type CreatorDiscoveryCreatorEntry,
  type CreatorDiscoveryResult,
} from "../server/discovery/creatorPipeline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUTPUT_DIR = join(__dirname, "output");

const DEFAULT_BUSINESS_DESCRIPTION =
  "I run a laundromat business and I want to grow my Instagram by posting reels about owning and operating laundromats.";

function printCreator(entry: CreatorDiscoveryCreatorEntry, index?: number): void {
  const c = entry;
  const reach =
    c.owner.followers > 0
      ? (c.bestReel.views / c.owner.followers).toFixed(1)
      : "?";
  const rankPrefix =
    index != null ? `${String(index + 1).padStart(3)}. ` : "     ";
  console.log(
    `${rankPrefix}@${c.owner.username.padEnd(24)} followers=${String(c.owner.followers).padStart(9)} views=${String(c.bestReel.views).padStart(10)} reach=${reach.padStart(6)}x score=${c.bestReel.viralScore.toFixed(1).padStart(8)} T${c.bestReel.tier}`
  );
  console.log(
    `     pillar:  [${c.foundViaPillar}] via "${c.foundViaTopic}"`
  );
  console.log(`     name:    ${c.owner.fullName || "(none)"}`);
  console.log(
    `     peer:    ${c.peerKeep ? "KEEP" : "DROP"} - ${c.peerReason}`
  );
  console.log(
    `     caption: ${c.bestReel.caption.replace(/\s+/g, " ").trim().slice(0, 110) || "(empty)"}`
  );
  console.log(`     url:     ${c.bestReel.reelUrl}\n`);
}

function printPillarsAndTopics(result: CreatorDiscoveryResult): void {
  const byPillar = new Map<string, string[]>();
  for (const t of result.topicsUsed) {
    if (!byPillar.has(t.pillar)) byPillar.set(t.pillar, []);
    byPillar.get(t.pillar)!.push(t.phrase);
  }
  for (const pillar of result.pillarsUsed) {
    console.log(`  [${pillar.name}]${pillar.why ? ` (${pillar.why})` : ""}`);
    const phrases = byPillar.get(pillar.name) ?? pillar.topics;
    for (const phrase of phrases) {
      console.log(`      - ${phrase}`);
    }
  }
  console.log(`  total topics: ${result.topicsUsed.length}\n`);
}

async function main(): Promise<void> {
  const businessDescription = process.argv[2]?.trim() || DEFAULT_BUSINESS_DESCRIPTION;

  console.log("=".repeat(78));
  console.log("CREATOR-FIRST PIPELINE TEST (runCreatorDiscoveryPipeline)");
  console.log("=".repeat(78));
  console.log(`Business: ${businessDescription}\n`);

  const result = await runCreatorDiscoveryPipeline(
    businessDescription,
    async (update) => {
      const parts = [`[progress] phase=${update.phase}`];
      if (update.topicsTotal != null) parts.push(`topicsTotal=${update.topicsTotal}`);
      if (update.topicsSearched != null) parts.push(`topicsSearched=${update.topicsSearched}`);
      if (update.reelsKept != null) parts.push(`reelsKept=${update.reelsKept}`);
      if (update.creatorsFound != null) parts.push(`creatorsFound=${update.creatorsFound}`);
      if (update.partial?.rankedCreators.length) {
        parts.push(`partialRanked=${update.partial.rankedCreators.length}`);
      }
      console.log(parts.join(" "));
    }
  );

  console.log("\n" + "=".repeat(78));
  console.log(`ROUTED NICHE: ${result.routedNiche}`);
  console.log("=".repeat(78));
  console.log("\nPillars + topics:");
  printPillarsAndTopics(result);

  console.log("=".repeat(78));
  console.log(`RANKED PEERS (kept): ${result.rankedCreators.length}`);
  console.log("=".repeat(78));
  result.rankedCreators.forEach((entry, i) => printCreator(entry, i));

  console.log("=".repeat(78));
  console.log(`FLAGGED AS COLLISIONS (dropped): ${result.droppedCollisions.length}`);
  console.log("=".repeat(78));
  result.droppedCollisions.forEach((entry) => printCreator(entry));

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(OUTPUT_DIR, `creator-pipeline-${timestamp}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
  console.log("=".repeat(78));
  console.log(`Wrote full result JSON: ${outPath}`);
  console.log("=".repeat(78));
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Pipeline test failed:", err);
  process.exit(1);
});
