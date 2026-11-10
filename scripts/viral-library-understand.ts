/**
 * Process viral library videos now instead of waiting for the worker, and
 * match every creator profile to topics. Same pipeline as the worker:
 * transcript (shared store first), frames, creator topics, how we found it,
 * caption as a weak hint. Stops at the daily cap
 * (VIRAL_LIBRARY_DAILY_BUDGET_USD, default $5).
 *
 * Requires migrations 0108 and 0109. Safe to re-run: each video is processed once.
 *   pnpm viral-library:understand            (up to 100 videos)
 *   pnpm viral-library:understand --max=20
 */
import { matchProfileTopics, topicCoverage } from "../server/viralPosts/topics";
import { processLibraryVideos, understandingReport } from "../server/viralPosts/videoUnderstanding";

async function main() {
  const maxArg = process.argv.find(a => a.startsWith("--max="))?.slice(6);
  const maxVideos = Math.max(1, Math.min(2_000, Number(maxArg) || 100));

  let profiles = 0;
  let newTopics = 0;
  for (let round = 0; round < 100; round++) {
    const r = await matchProfileTopics({ maxProfiles: 50 });
    if (r.skipped) {
      console.error(`Stopped: ${r.skipped}. Apply drizzle/0108 and 0109 first.`);
      process.exit(1);
    }
    profiles += r.matched;
    newTopics += r.newTopics;
    if (r.matched === 0) break;
  }

  let processed = 0;
  let failed = 0;
  let cost = 0;
  while (processed + failed < maxVideos) {
    const r = await processLibraryVideos({ maxVideos: Math.min(20, maxVideos - processed - failed) });
    processed += r.processed;
    failed += r.failed;
    cost += r.costUsd;
    console.info(`videos: processed=${r.processed} failed=${r.failed} cost=$${r.costUsd.toFixed(4)}`);
    if (r.skipped) {
      console.info(`stopped: ${r.skipped}`);
      break;
    }
    if (r.processed + r.failed === 0) break;
  }

  const report = await understandingReport();
  console.info(
    `SUMMARY profiles_matched=${profiles} new_topics=${newTopics} videos_processed=${processed} videos_failed=${failed} cost_usd=${cost.toFixed(4)} spent_today_usd=${report.spentTodayUsd.toFixed(4)} status=${JSON.stringify(report.byStatus)}`
  );
  for (const t of await topicCoverage()) {
    console.info(`TOPIC ${t.category}/${t.slug} videos=${t.videos} creators=${t.profiles}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
