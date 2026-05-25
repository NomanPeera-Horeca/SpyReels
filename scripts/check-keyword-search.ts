import 'dotenv/config';
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function main() {
  console.log('Testing apidojo keyword search with "restaurant owner"...');
  const run = await client.actor('apidojo/instagram-user-scraper').call({
    searchKeywords: ['restaurant owner'],
    getFollowers: false,
    getFollowings: false,
    maxItems: 5
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`Got ${items.length} items`);
  if (items.length > 0) {
    console.log('First item keys:', Object.keys(items[0] as object));
    console.log('First item sample:');
    const first = items[0] as any;
    console.log(`  @${first.username} | ${first.followerCount} followers | bio: ${(first.biography || '').slice(0, 80)}`);
  } else {
    console.log('NO ITEMS RETURNED - field name may be wrong');
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
