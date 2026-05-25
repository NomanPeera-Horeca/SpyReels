import 'dotenv/config';
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function main() {
  console.log('Testing apidojo keyword search with "restaurant owner" using keywords field...');
  const run = await client.actor('apidojo/instagram-user-scraper').call({
    keywords: ['restaurant owner'],
    getFollowers: false,
    getFollowings: false,
    maxItems: 5
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(`Got ${items.length} items`);
  if (items.length > 0) {
    console.log('First item keys:', Object.keys(items[0] as object).slice(0, 15));
    console.log('First 3 items:');
    for (const item of items.slice(0, 3) as any[]) {
      const bio = (item.biography || '').replace(/\n/g, ' ').slice(0, 80);
      console.log(`  @${item.username} | ${item.followerCount} followers | bio: ${bio}`);
    }
  } else {
    console.log('STILL NO ITEMS - need to check actor docs');
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
