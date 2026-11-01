/**
 * Tag library videos with topics and match every creator profile to topics,
 * all at once instead of waiting for the hourly job. Uses Haiku only
 * (about 20 videos per call); no ScrapeCreators calls.
 *
 * Requires migrations 0108 and 0109. Safe to re-run: each video and each
 * strategy version is read once.
 *   pnpm viral-library:topics            (up to 3,000 videos)
 *   pnpm viral-library:topics --max=500
 */
import { matchProfileTopics, tagLibraryVideos, topicCoverage } from "../server/viralPosts/topics";

async function main() {
  const maxArg = process.argv.find(a => a.startsWith("--max="))?.slice(6);
  const maxVideos = Math.max(1, Math.min(20_000, Number(maxArg) || 3_000));
  let read = 0;
  let tagged = 0;
  let aiCalls = 0;
  while (read < maxVideos) {
    const r = await tagLibraryVideos({ maxVideos: Math.min(500, maxVideos - read) });
    if (r.skipped) {
      console.error(`Stopped: ${r.skipped}. Apply drizzle/0108 and 0109 first.`);
      process.exit(1);
    }
    read += r.read;
    tagged += r.tagged;
    aiCalls += r.aiCalls;
    console.info(`videos: read=${r.read} tagged=${r.tagged}`);
    if (r.read === 0) break;
  }

  let profiles = 0;
  let newTopics = 0;
  for (let round = 0; round < 100; round++) {
    const r = await matchProfileTopics({ maxProfiles: 50 });
    profiles += r.matched;
    newTopics += r.newTopics;
    if (r.matched === 0) break;
  }

  console.info(`SUMMARY videos_read=${read} videos_tagged=${tagged} ai_calls=${aiCalls} profiles_matched=${profiles} new_topics=${newTopics}`);
  for (const t of await topicCoverage()) {
    console.info(`TOPIC ${t.category}/${t.slug} videos=${t.videos} creators=${t.profiles}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
