/**
 * Does ScrapeCreators return related / similar accounts? One profile call per
 * platform (3 calls). Prints the paths of any field whose name looks like
 * related/similar/suggested/chaining/recommended, how many items it holds and
 * a few handles. No secrets, no database.
 */
const key = process.env.SCRAPECREATORS_API_KEY?.trim();
if (!key) throw new Error("SCRAPECREATORS_API_KEY is not set.");
const calls: Array<[string, string, Record<string, string>]> = [
  ["instagram", "/v1/instagram/profile", { handle: "garyvee" }],
  ["tiktok", "/v1/tiktok/profile", { handle: "garyvee" }],
  ["youtube", "/v1/youtube/channel", { handle: "GaryVee" }],
];
const pattern = /related|similar|suggest|chain|recommend|also_follow|edge_related/i;
function walk(value: unknown, path: string, out: string[], depth = 0): void {
  if (depth > 6 || value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length > 0) walk(value[0], `${path}[0]`, out, depth + 1);
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const p = path ? `${path}.${k}` : k;
    if (pattern.test(k)) {
      const arr = Array.isArray(v)
        ? v
        : v && typeof v === "object" && Array.isArray((v as { edges?: unknown[] }).edges)
          ? ((v as { edges: unknown[] }).edges)
          : null;
      const sample = (arr ?? []).slice(0, 5).map(x => {
        const o = (x && typeof x === "object" ? ((x as { node?: unknown }).node ?? x) : x) as Record<string, unknown>;
        return o && typeof o === "object" ? String(o.username ?? o.handle ?? o.uniqueId ?? o.title ?? o.id ?? "?") : String(o);
      });
      out.push(`${p} type=${Array.isArray(v) ? "array" : typeof v} items=${arr ? arr.length : "-"} sample=${JSON.stringify(sample)}`);
    }
    walk(v, p, out, depth + 1);
  }
}
for (const [platform, path, params] of calls) {
  const url = new URL(`https://api.scrapecreators.com${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { "x-api-key": key } });
  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = null; }
  const found: string[] = [];
  walk(data, "", found);
  const top = data && typeof data === "object" ? Object.keys(data as object).slice(0, 25).join(",") : "";
  console.log(`PLATFORM ${platform} STATUS ${res.status} BYTES ${text.length} TOP ${top}`);
  for (const line of found.slice(0, 15)) console.log(`  FOUND ${line}`);
  if (found.length === 0) console.log("  FOUND none");
}
