/**
 * Bing discovery helper. The old bing.com/ping sitemap API returns 410 Gone.
 *
 * Usage:
 *   pnpm tsx scripts/notify-bing-sitemap.ts
 *
 * Manual (required once):
 *   1. Verify https://spyreels.ai at https://www.bing.com/webmasters
 *   2. Submit sitemap: https://spyreels.ai/sitemap.xml
 *   3. Use URL Inspection for new canonical pages after publish
 *
 * Optional IndexNow (after key is configured):
 *   export INDEXNOW_KEY=your-hex-key
 *   pnpm tsx scripts/notify-bing-sitemap.ts --submit https://spyreels.ai/blog/SLUG
 */
const SITE_HOST = "spyreels.ai";
const SITEMAP_URL = `https://${SITE_HOST}/sitemap.xml`;

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

async function submitIndexNow(urls: string[]): Promise<void> {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) {
    console.log(
      "IndexNow skipped: set INDEXNOW_KEY in .env and host the key at https://spyreels.ai/{key}.txt"
    );
    return;
  }

  const keyLocation = `https://${SITE_HOST}/${key}.txt`;
  const payload = {
    host: SITE_HOST,
    key,
    keyLocation,
    urlList: urls,
  };

  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (res.status === 200 || res.status === 202) {
    console.log(`IndexNow OK (HTTP ${res.status}) for ${urls.length} URL(s)`);
    return;
  }

  const body = await res.text();
  console.error(`IndexNow failed: HTTP ${res.status}`);
  console.error(body.slice(0, 400));
  process.exit(1);
}

async function main() {
  const submitArgs = process.argv.slice(2);
  const submitFlagIdx = submitArgs.indexOf("--submit");
  const urlsToSubmit =
    submitFlagIdx >= 0
      ? submitArgs.slice(submitFlagIdx + 1).filter((a) => a.startsWith("http"))
      : [`https://${SITE_HOST}/`, SITEMAP_URL];

  console.log("Bing discovery checklist for SpyReels\n");
  console.log("1. Verify site at Bing Webmaster Tools:");
  console.log("   https://www.bing.com/webmasters");
  console.log("2. Submit sitemap (once):");
  console.log(`   ${SITEMAP_URL}`);
  console.log("3. After each blog publish, inspect the canonical URL in Bing (not legacy slugs).");
  console.log("4. robots.txt must allow Bingbot (deploy server/_core/index.ts change).\n");
  console.log(
    "Note: bing.com/ping returns HTTP 410. Bing deprecated sitemap ping. Use Webmaster Tools + IndexNow.\n"
  );

  if (process.env.INDEXNOW_KEY?.trim()) {
    await submitIndexNow(urlsToSubmit);
  } else {
    console.log(
      "Optional: configure IndexNow for faster URL updates (see docs/BLOG_PUBLISH_CHECKLIST.md Bing section)."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
