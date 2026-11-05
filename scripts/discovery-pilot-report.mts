/**
 * Discovery repair pilot report (read-only login, EVAL_DB_READONLY_URL).
 *
 *   pnpm exec tsx scripts/discovery-pilot-report.mts [pilotId]
 *
 * Videos are deduplicated per topic and platform (one row each). A video
 * found by several routes is listed under each route it came from, but the
 * topic/platform totals count it once.
 *
 * useful = on topic AND not in the library before the pilot AND (viral OR
 * rising confirmed by the growth check). Pending verdicts are reported as
 * pending, never as failures. Recent and evergreen are reported separately.
 */
import mysql from "mysql2/promise";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });
const wanted = Number(process.argv[2]) || null;
const [pilots] = (await conn.query(
  wanted ? `SELECT * FROM viral_discovery_pilots WHERE id = ?` : `SELECT * FROM viral_discovery_pilots ORDER BY id DESC LIMIT 1`,
  wanted ? [wanted] : []
)) as unknown as [Array<Record<string, unknown>>];
const p = pilots[0];
if (!p) {
  console.log("No pilot found.");
  process.exit(0);
}
const spent = Number(p.instagramUsd) + Number(p.youtubeUsd) + Number(p.tiktokUsd);
console.log(`PILOT ${p.id} "${p.name}" status ${p.status} started ${p.startedAt ?? "-"} discovery done ${p.discoveryDoneAt ?? "-"} ended ${p.endedAt ?? "-"}`);
console.log(`SPEND $${spent.toFixed(4)} of $${Number(p.capUsd).toFixed(2)} | instagram $${Number(p.instagramUsd).toFixed(4)}/${p.instagramCapUsd} youtube $${Number(p.youtubeUsd).toFixed(4)}/${p.youtubeCapUsd} tiktok $${Number(p.tiktokUsd).toFixed(4)}/${p.tiktokCapUsd}`);
console.log(`NOTE ${p.note ?? ""}`);

type Item = Record<string, any> & { routes: string[] };
const [rawItems] = (await conn.query(`SELECT * FROM viral_discovery_pilot_items WHERE pilotId = ?`, [p.id])) as unknown as [Array<Record<string, any>>];
const items: Item[] = rawItems.map(r => ({ ...r, routes: Array.isArray(r.routes) ? r.routes : JSON.parse(String(r.routes || "[]")) }));
const [calls] = (await conn.query(
  `SELECT platform, topicSlug, route, kind, SUM(requests) AS requests, SUM(blocked) AS blocked, SUM(usd) AS usd, COUNT(*) AS steps
   FROM viral_discovery_pilot_calls WHERE pilotId = ? GROUP BY platform, topicSlug, route, kind`,
  [p.id]
)) as unknown as [Array<Record<string, any>>];

const useful = (i: Item) => i.topicVerdict === "relevant" && !Number(i.inLibraryBefore) && (i.verdict === "viral" || i.verdict === "rising");
const cnt = (xs: Item[], f: (i: Item) => boolean) => xs.filter(f).length;

console.log("\nBY TOPIC AND PLATFORM (deduplicated)");
console.log("topic | platform | videos | on-topic | off-topic | not checked | already in library | viral | rising confirmed | pending growth | pending baseline | growth check failed | useful recent | useful evergreen | useful undated | $ | $/useful");
const cells = [...new Set(items.map(i => `${i.topicSlug}|${i.platform}`)), ...calls.map(c => `${c.topicSlug}|${c.platform}`)];
for (const key of [...new Set(cells)].sort()) {
  const [topic, platform] = key.split("|");
  const xs = items.filter(i => i.topicSlug === topic && i.platform === platform);
  const usd = calls.filter(c => c.topicSlug === topic && c.platform === platform).reduce((a, c) => a + Number(c.usd), 0);
  const u = xs.filter(useful);
  console.log([
    topic, platform, xs.length, cnt(xs, i => i.topicVerdict === "relevant"), cnt(xs, i => i.topicVerdict === "rejected"), cnt(xs, i => i.topicVerdict === "not_checked"),
    cnt(xs, i => Number(i.inLibraryBefore) === 1), cnt(xs, i => i.verdict === "viral"), cnt(xs, i => i.verdict === "rising"),
    cnt(xs, i => i.verdict === "pending_growth"), cnt(xs, i => i.verdict === "pending_baseline"), cnt(xs, i => i.verdict === "growth_check_failed"),
    cnt(u, i => i.recency === "recent"), cnt(u, i => i.recency === "evergreen"), cnt(u, i => i.recency === "undated"),
    usd.toFixed(4), u.length ? (usd / u.length).toFixed(4) : "-",
  ].join(" | "));
}

console.log("\nBY ROUTE (a video found by two routes counts for both; spend is the route's own)");
console.log("platform | topic | route | steps | requests | blocked by budget | $ | videos | on-topic | useful | duplicates of library | $/useful");
for (const c of [...calls].sort((a, b) => `${a.platform}${a.topicSlug}${a.route}`.localeCompare(`${b.platform}${b.topicSlug}${b.route}`))) {
  const xs = items.filter(i => i.platform === c.platform && i.topicSlug === c.topicSlug && i.routes.includes(c.route));
  const u = cnt(xs, useful);
  console.log([c.platform, c.topicSlug, c.route, c.steps, c.requests, c.blocked, Number(c.usd).toFixed(4), xs.length, cnt(xs, i => i.topicVerdict === "relevant"), u, cnt(xs, i => Number(i.inLibraryBefore) === 1), u ? (Number(c.usd) / u).toFixed(4) : "-"].join(" | "));
}

const [creators] = (await conn.query(
  `SELECT platform, topicSlug, handle, channelId, foundBy, scanned, usualViews FROM viral_discovery_pilot_creators
   WHERE pilotId = ? AND knownBefore = 0 AND topicMatch = 1 ORDER BY platform, topicSlug, handle`,
  [p.id]
)) as unknown as [Array<Record<string, any>>];
console.log(`\nNEW RELEVANT CREATORS (${creators.length})`);
for (const c of creators) console.log(`  ${c.platform} | ${c.topicSlug} | @${c.handle}${c.channelId ? ` (${c.channelId})` : ""} | found by ${c.foundBy} | scanned ${c.scanned ? "yes" : "no"} | usual views ${c.usualViews ?? "?"}`);

const line = (i: Item) => `  ${i.platform} | ${i.verdict} | ${i.recency} | views ${i.views1 ?? "?"}${i.views2 != null ? ` -> ${i.views2}` : ""} | usual ${i.usualViews ?? "?"} (${i.baselineSource ?? "-"}) | ${i.routes.join("+")} | ${i.url} | ${String(i.caption ?? "").replace(/\s+/g, " ").slice(0, 90)}`;
for (const topic of [...new Set(items.map(i => i.topicSlug))].sort()) {
  for (const platform of ["instagram", "youtube", "tiktok"]) {
    const xs = items.filter(i => i.topicSlug === topic && i.platform === platform);
    if (!xs.length) continue;
    console.log(`\n=== ${topic} / ${platform}`);
    console.log("USEFUL (new, on topic, viral or confirmed rising):");
    for (const i of xs.filter(useful).slice(0, 15)) console.log(line(i));
    console.log("PENDING (growth check or baseline):");
    for (const i of xs.filter(i => i.topicVerdict === "relevant" && (i.verdict === "pending_growth" || i.verdict === "pending_baseline")).slice(0, 10)) console.log(line(i));
    console.log("REJECTED BY TOPIC CHECK (examples):");
    for (const i of xs.filter(i => i.topicVerdict === "rejected").slice(0, 8)) console.log(`${line(i)} | why: ${i.topicReason ?? ""}`);
  }
}
await conn.end();
