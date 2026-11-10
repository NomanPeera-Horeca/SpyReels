/**
 * One-time fill of the shared viral library from data we already have.
 * No provider or model calls.
 *
 * 1. Copies every finished research job (Instagram, TikTok, YouTube) into
 *    the library and records each creator's usual views.
 * 2. Gives every library video saved before step A its viral verdict.
 * 3. Prints counts per platform and status.
 *
 * Requires migration drizzle/0108_viral_library.sql. Safe to re-run.
 *   pnpm viral-library:backfill
 */
import {
  classifyUnlabeledLibraryRows,
  ingestResearchJobs,
  libraryStatusCounts,
} from "../server/viralPosts/library";

async function main() {
  let jobs = 0;
  let videos = 0;
  for (let round = 0; round < 500; round++) {
    const r = await ingestResearchJobs({ perSource: 25 });
    if (r.skipped) {
      console.error(`Stopped: ${r.skipped}. Apply drizzle/0108_viral_library.sql first.`);
      process.exit(1);
    }
    jobs += r.jobs;
    videos += r.videos;
    console.info(`research round ${round + 1}: jobs=${r.jobs} videos=${r.videos}`);
    if (r.jobs === 0) break;
  }

  let labeled = 0;
  for (let round = 0; round < 1_000; round++) {
    const n = await classifyUnlabeledLibraryRows(1_000);
    labeled += n;
    if (n === 0) break;
  }

  console.info(`SUMMARY research_jobs=${jobs} research_videos=${videos} older_rows_labeled=${labeled}`);
  for (const row of await libraryStatusCounts()) {
    console.info(`COUNT platform=${row.platform} status=${row.status} n=${row.n}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
