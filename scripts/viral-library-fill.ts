/**
 * Run the topic fill now instead of waiting for the worker (3 pools every
 * 5 minutes). Same pipeline and the same total cap
 * (VIRAL_TOPIC_FILL_BUDGET_USD, default $20).
 *   pnpm viral-library:fill            (up to 30 pools)
 *   pnpm viral-library:fill --max=10
 */
import { runTopicFill } from "../server/viralPosts/topicFill";

async function main() {
  const maxArg = process.argv.find(a => a.startsWith("--max="))?.slice(6);
  const maxPools = Math.max(1, Math.min(500, Number(maxArg) || 30));
  let searched = 0;
  let candidates = 0;
  let last = await runTopicFill({ maxPools: 0 + Math.min(5, maxPools) });
  searched += last.searched;
  candidates += last.candidates;
  while (!last.skipped && searched < maxPools && last.searched > 0) {
    last = await runTopicFill({ maxPools: Math.min(5, maxPools - searched) });
    searched += last.searched;
    candidates += last.candidates;
  }
  console.info(
    `SUMMARY pools_searched=${searched} videos_admitted=${candidates} spent_total_usd=${last.spentTotalUsd.toFixed(2)} pools_remaining=${last.remaining}${last.skipped ? ` stopped=${last.skipped}` : ""}`
  );
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
