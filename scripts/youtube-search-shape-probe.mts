/**
 * One live YouTube Shorts search (1 provider call) to see the response shape:
 * top-level keys, array sizes, and the fields of the first rows. No secrets,
 * no database. PROBE_QUERY sets the query.
 */
const key = process.env.SCRAPECREATORS_API_KEY?.trim();
if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set.");
const query = process.env.PROBE_QUERY?.trim() || "startup success story";
const url = new URL("https://api.scrapecreators.com/v1/youtube/search");
url.searchParams.set("query", query);
url.searchParams.set("type", "shorts");
url.searchParams.set("sortBy", "popular");
url.searchParams.set("uploadDate", "this_month");
url.searchParams.set("includeExtras", "true");
const res = await fetch(url, { headers: { "x-api-key": key } });
const data = (await res.json()) as Record<string, unknown>;
console.log("STATUS", res.status, "KEYS", Object.keys(data).join(","));
for (const [k, v] of Object.entries(data)) {
  if (Array.isArray(v)) {
    console.log(`ARRAY ${k} length=${v.length}`);
    for (const row of v.slice(0, 2)) {
      const r = row as Record<string, unknown>;
      const summary: Record<string, unknown> = {};
      for (const [rk, rv] of Object.entries(r)) {
        summary[rk] = typeof rv === "object" && rv !== null ? `{${Object.keys(rv).join(",")}}` : typeof rv === "string" ? rv.slice(0, 60) : rv;
      }
      console.log(`ROW ${k}`, JSON.stringify(summary));
    }
  }
}
