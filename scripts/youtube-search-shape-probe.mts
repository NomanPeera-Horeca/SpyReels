/**
 * YouTube Shorts search filter check (1 provider call per variant): which
 * filter combinations still return results, and the fields of the first
 * short. No secrets, no database. PROBE_QUERY sets the query.
 */
const key = process.env.SCRAPECREATORS_API_KEY?.trim();
if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set.");
const query = process.env.PROBE_QUERY?.trim() || "startup success story";
const variants: Array<Record<string, string>> = [
  { type: "shorts" },
  { type: "shorts", uploadDate: "this_month" },
  { type: "shorts", sortBy: "popular" },
  {},
];
for (const params of variants) {
  const url = new URL("https://api.scrapecreators.com/v1/youtube/search");
  url.searchParams.set("query", query);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("includeExtras", "true");
  const res = await fetch(url, { headers: { "x-api-key": key } });
  const data = (await res.json()) as Record<string, unknown>;
  const sizes = Object.entries(data)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k}=${(v as unknown[]).length}`)
    .join(" ");
  console.log(`VARIANT ${JSON.stringify(params)} STATUS ${res.status} ${sizes}`);
  const first = (Array.isArray(data.shorts) && data.shorts[0]) || (Array.isArray(data.videos) && data.videos[0]);
  if (first && typeof first === "object") {
    const r = first as Record<string, unknown>;
    const summary: Record<string, unknown> = {};
    for (const [rk, rv] of Object.entries(r)) {
      summary[rk] = typeof rv === "object" && rv !== null ? `{${Object.keys(rv).join(",")}}` : typeof rv === "string" ? rv.slice(0, 40) : rv;
    }
    console.log(`FIRST ${JSON.stringify(summary)}`);
  }
}
