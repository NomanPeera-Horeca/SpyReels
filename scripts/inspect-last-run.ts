import 'dotenv/config';
import { ApifyClient } from 'apify-client';
import { writeFileSync } from 'fs';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function main() {
  // Last user scraper run from Step 4
  const runId = 'ocHKGz2WacPi4VYVw';
  console.log(`Fetching dataset from run ${runId}...`);

  const run = await client.run(runId).get();
  if (!run) {
    console.error('Run not found');
    return;
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`Got ${items.length} profiles\n`);

  // Save full data for analysis
  writeFileSync('scripts/last-enriched-profiles.json', JSON.stringify(items, null, 2));
  console.log('Saved full data to scripts/last-enriched-profiles.json\n');

  // Print compact summary of all 99 profiles
  console.log('=== ALL ENRICHED PROFILES ===');
  console.log('username | followers | posts | isBusiness | isVerified | bio (first 80 chars)');
  console.log('---');
  for (const item of items as any[]) {
    const bio = (item.biography || '').replace(/\n/g, ' ').slice(0, 80);
    const followers = item.followerCount?.toLocaleString() ?? 'N/A';
    const posts = item.postCount ?? 'N/A';
    const biz = item.isBusiness ? 'BIZ' : '   ';
    const ver = item.isVerified ? 'VER' : '   ';
    console.log(`@${item.username} | ${followers} | ${posts}p | ${biz} | ${ver} | ${bio}`);
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
