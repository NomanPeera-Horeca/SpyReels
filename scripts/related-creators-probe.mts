/**
 * Which ScrapeCreators endpoints can search for CREATORS by niche keywords?
 * One call per endpoint. Prints status, array sizes and the first item's keys
 * (with follower-like numbers). No secrets, no database.
 */
const key = process.env.SCRAPECREATORS_API_KEY?.trim();
if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set.");
const q = "home workout coach";
const calls: Array<[string, string, Record<string, string>]> = [
  ["tiktok users", "/v1/tiktok/search/users", { query: q }],
  ["youtube channels", "/v1/youtube/search", { query: q, type: "channel" }],
  ["instagram search", "/v1/instagram/search", { query: q }],
  ["instagram reels search", "/v1/instagram/reels/search", { query: q }],
];
for (const [name, path, params] of calls) {
  const url = new URL(`https://api.scrapecreators.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { headers: { "x-api-key": key } });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text); } catch { /* not json */ }
    const arrays = Object.entries(data).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k}=${(v as unknown[]).length}`);
    console.log(`ENDPOINT ${name} ${path} STATUS ${res.status} BYTES ${text.length} ARRAYS ${arrays.join(" ") || "-"} TOP ${Object.keys(data).slice(0, 12).join(",")}`);
    const firstArr = Object.values(data).find(v => Array.isArray(v) && v.length > 0) as unknown[] | undefined;
    const first = firstArr?.[0];
    if (first && typeof first === "object") {
      const o = ((first as { user?: unknown; user_info?: unknown }).user ?? (first as { user_info?: unknown }).user_info ?? first) as Record<string, unknown>;
      const keys = Object.keys(o).slice(0, 30).join(",");
      const pick = ["unique_id", "uniqueId", "username", "handle", "nickname", "title", "follower_count", "followerCount", "subscriberCount", "subscriberCountText", "followers"]
        .filter(k => k in o).map(k => `${k}=${JSON.stringify(o[k]).slice(0, 40)}`).join(" ");
      console.log(`  FIRST keys=${keys}`);
      console.log(`  FIRST ${pick}`);
    }
  } catch (e) {
    console.log(`ENDPOINT ${name} ERROR ${e instanceof Error ? e.message : String(e)}`);
  }
}
