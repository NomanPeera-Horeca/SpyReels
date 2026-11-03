/**
 * TikTok search suggestions (autocomplete) through ScrapeCreators: response
 * shape and whether it adds real phrases. 3 calls. No secrets, no database.
 */
const key = process.env.SCRAPECREATORS_API_KEY?.trim();
if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set.");
for (const query of ["meal prep", "restaurant marketing", "home workout"]) {
  for (const param of ["query"]) {
    const url = new URL("https://api.scrapecreators.com/v1/tiktok/search/suggestions");
    url.searchParams.set(param, query);
    try {
      const res = await fetch(url, { headers: { "x-api-key": key } });
      const text = await res.text();
      console.log(`QUERY ${query} STATUS ${res.status} BYTES ${text.length}`);
      console.log(`  BODY ${text.slice(0, 1500).replace(/\s+/g, " ")}`);
    } catch (e) {
      console.log(`QUERY ${query} ERROR ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
