import 'dotenv/config';
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

async function main() {
  console.log('Calling apidojo/instagram-user-scraper for @rowanthegoldenboy...');
  const run = await client.actor('apidojo/instagram-user-scraper').call({
    startUrls: ['https://www.instagram.com/rowanthegoldenboy/'],
    getFollowers: false,
    getFollowings: false,
    maxItems: 1
  });

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log('=== FIELD NAMES AT TOP LEVEL ===');
  console.log(Object.keys(items[0] ?? {}));
  console.log();
  console.log('=== FULL FIRST ITEM ===');
  console.log(JSON.stringify(items[0], null, 2));
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
