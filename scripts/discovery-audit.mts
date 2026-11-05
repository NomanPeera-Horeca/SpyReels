/** Discovery & personalization audit (read-only; no names, emails or handles of users). */
import mysql from "mysql2/promise";
const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });
const q = async (s: string, p: unknown[] = []) => ((await conn.query(s, p)) as unknown as [Array<Record<string, any>>])[0];
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").slice(0, n);

console.log("=== A. Fill and refresh spend ===");
for (const r of await q(`SELECT day, usd, videos FROM viral_processing_spend WHERE day = 'fill-total' OR day LIKE 'rf%' ORDER BY day`)) console.log(`SPEND ${r.day} $${r.usd} searches ${r.videos}`);

console.log("\n=== B. Topics vs pools (pool pillar = topic label) ===");
const topics = await q(`
  SELECT t.slug, t.label, t.category, t.source, t.createdAt,
    (SELECT COUNT(*) FROM viral_post_pools p WHERE LOWER(p.pillar) = LOWER(t.label)) AS pools,
    (SELECT COUNT(*) FROM viral_post_pools p WHERE LOWER(p.pillar) = LOWER(t.label) AND p.lastRefreshedAt IS NOT NULL) AS searched,
    (SELECT MAX(p.lastRefreshedAt) FROM viral_post_pools p WHERE LOWER(p.pillar) = LOWER(t.label)) AS lastSearch,
    (SELECT COUNT(*) FROM viral_profile_topics pt WHERE pt.topicSlug = t.slug) AS profiles,
    (SELECT COUNT(*) FROM viral_keywords k WHERE k.topicSlug = t.slug) AS phrases,
    (SELECT COUNT(DISTINCT vt.candidateId) FROM viral_video_topics vt JOIN viral_library_status s ON s.candidateId = vt.candidateId WHERE vt.topicSlug = t.slug AND s.status IN ('viral','rising')) AS videos
  FROM viral_topics t ORDER BY t.createdAt`);
const never = topics.filter(t => Number(t.searched) === 0);
console.log(`TOPICS ${topics.length} | never searched on any platform: ${never.length} | with no pool at all: ${topics.filter(t => Number(t.pools) === 0).length}`);
const firstSearchEnd = await q(`SELECT MAX(lastRefreshedAt) AS m, MIN(lastRefreshedAt) AS n FROM viral_post_pools WHERE lastRefreshedAt IS NOT NULL`);
console.log(`POOLS searched between ${firstSearchEnd[0].n} and ${firstSearchEnd[0].m}`);
for (const t of never) console.log(`NEVER ${t.category} | ${t.label} | ${t.source} | created ${new Date(t.createdAt).toISOString().slice(0, 16)} | pools ${t.pools} | profiles ${t.profiles} | phrases ${t.phrases} | videos ${t.videos}`);
const bySrc = new Map<string, { n: number; zero: number; under10: number }>();
for (const t of topics) {
  const k = String(t.source);
  const v = bySrc.get(k) ?? { n: 0, zero: 0, under10: 0 };
  v.n++; if (Number(t.videos) === 0) v.zero++; if (Number(t.videos) < 10) v.under10++;
  bySrc.set(k, v);
}
for (const [k, v] of bySrc) console.log(`SOURCE ${k}: topics ${v.n}, 0 videos ${v.zero}, under 10 videos ${v.under10}`);
const late = topics.filter(t => new Date(t.createdAt) > new Date("2026-11-01T23:59:59Z"));
console.log(`TOPICS CREATED AFTER NOV 1: ${late.length}`);
for (const t of late) console.log(`LATE ${t.label} | created ${new Date(t.createdAt).toISOString().slice(0, 16)} | pools ${t.pools} searched ${t.searched} last ${t.lastSearch ? new Date(t.lastSearch).toISOString().slice(0, 16) : "-"} | videos ${t.videos}`);

console.log("\n=== C. Profiles and coverage ===");
const prof = await q(`
  SELECT pt.socialProfileId AS id, COUNT(*) AS topics,
    SUM((SELECT COUNT(DISTINCT vt.candidateId) FROM viral_video_topics vt JOIN viral_library_status s ON s.candidateId = vt.candidateId WHERE vt.topicSlug = pt.topicSlug AND s.status IN ('viral','rising')) >= 10) AS covered
  FROM viral_profile_topics pt GROUP BY pt.socialProfileId`);
console.log(`PROFILES matched ${prof.length} | all topics covered (10+ videos each): ${prof.filter(p => Number(p.covered) === Number(p.topics)).length} | none covered: ${prof.filter(p => Number(p.covered) === 0).length}`);
const kinds = await q(`SELECT kind, COUNT(DISTINCT socialProfileId) AS profiles FROM personalization_items WHERE status = 'confirmed' AND kind IN ('niche','pillar','audience','goal','problem_solution') GROUP BY kind`);
for (const k of kinds) console.log(`CONFIRMED ${k.kind}: ${k.profiles} profiles`);
for (const c of await q(`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME LIKE '%mbedding%'`)) {
  const n = await q(`SELECT COUNT(*) AS n FROM \`${c.TABLE_NAME}\` WHERE \`${c.COLUMN_NAME}\` IS NOT NULL`);
  console.log(`EMBEDDINGS ${c.TABLE_NAME}.${c.COLUMN_NAME}: ${n[0].n} rows`);
}

console.log("\n=== D. Four example users ===");
const examples: Array<{ name: string; where: string; caption: string }> = [
  { name: "busy-mom fitness coach", where: `(t LIKE '%mom%' OR t LIKE '%mother%' OR t LIKE '%postpartum%') AND (t LIKE '%fit%' OR t LIKE '%workout%' OR t LIKE '%exercise%')`, caption: `(c.caption LIKE '%mom%' OR c.caption LIKE '%postpartum%') AND (c.caption LIKE '%workout%' OR c.caption LIKE '%fitness%' OR c.caption LIKE '%exercise%')` },
  { name: "laundromat owner", where: `t LIKE '%laundr%'`, caption: `c.caption LIKE '%laundromat%'` },
  { name: "restaurant-profit consultant", where: `t LIKE '%restaurant%' AND (t LIKE '%profit%' OR t LIKE '%consult%' OR t LIKE '%margin%' OR t LIKE '%cost%')`, caption: `c.caption LIKE '%restaurant%' AND (c.caption LIKE '%profit%' OR c.caption LIKE '%margin%' OR c.caption LIKE '%food cost%')` },
  { name: "Dubai rental-law creator", where: `t LIKE '%dubai%' AND (t LIKE '%rent%' OR t LIKE '%tenant%' OR t LIKE '%landlord%' OR t LIKE '%law%')`, caption: `c.caption LIKE '%dubai%' AND (c.caption LIKE '%rent%' OR c.caption LIKE '%tenant%' OR c.caption LIKE '%landlord%')` },
];
for (const ex of examples) {
  console.log(`\n--- ${ex.name}`);
  const users = await q(`
    SELECT socialProfileId AS id, GROUP_CONCAT(DISTINCT kind) AS kinds FROM (
      SELECT socialProfileId, kind, LOWER(CAST(payload AS CHAR)) AS t FROM personalization_items WHERE status = 'confirmed' AND kind IN ('niche','pillar')
    ) x WHERE ${ex.where} GROUP BY socialProfileId LIMIT 3`);
  console.log(`MATCHING USERS: ${users.length}`);
  for (const u of users.slice(0, 2)) {
    const items = await q(`SELECT kind, CAST(payload AS CHAR) AS p FROM personalization_items WHERE socialProfileId = ? AND status = 'confirmed' AND kind IN ('niche','pillar','audience','goal') ORDER BY kind`, [u.id]);
    console.log(`USER ${String(u.id).slice(0, 8)}`);
    for (const it of items) console.log(`  ${it.kind}: ${clip(it.p, 220)}`);
    const subs = await q(`SELECT label FROM pillar_subtopics WHERE socialProfileId = ? AND status <> 'dismissed' LIMIT 8`, [u.id]).catch(() => []);
    if (subs.length) console.log(`  subtopics: ${subs.map(s => s.label).join("; ")}`);
    const tp = await q(`SELECT t.label, t.category, t.source,
        (SELECT COUNT(DISTINCT vt.candidateId) FROM viral_video_topics vt JOIN viral_library_status s ON s.candidateId = vt.candidateId WHERE vt.topicSlug = t.slug AND s.status IN ('viral','rising')) AS videos
      FROM viral_profile_topics pt JOIN viral_topics t ON t.slug = pt.topicSlug WHERE pt.socialProfileId = ?`, [u.id]);
    console.log(`  MATCHED TOPICS: ${tp.map(t => `${t.label} [${t.category}, ${t.source}, ${t.videos} videos]`).join(" | ") || "(none)"}`);
    const tier1 = await q(`
      SELECT DISTINCT c.platform, c.sourceUrl, c.caption, s.status, s.multiple, t.label
      FROM viral_profile_topics pt JOIN viral_video_topics vt ON vt.topicSlug = pt.topicSlug JOIN viral_topics t ON t.slug = vt.topicSlug
      JOIN viral_post_candidates c ON c.id = vt.candidateId JOIN viral_library_status s ON s.candidateId = c.id
      WHERE pt.socialProfileId = ? AND s.status IN ('viral','rising') ORDER BY s.multiple DESC LIMIT 8`, [u.id]);
    console.log(`  TIER-1 CANDIDATES (their topics, top by viral multiple):`);
    for (const v of tier1) console.log(`    [${v.label}] ${v.platform} ${v.status} x${v.multiple} | ${v.sourceUrl} | ${clip(v.caption, 90)}`);
  }
  const lib = await q(`SELECT COUNT(*) AS n FROM viral_post_candidates c JOIN viral_library_status s ON s.candidateId = c.id WHERE s.status IN ('viral','rising') AND ${ex.caption}`);
  const tagged = await q(`
    SELECT t.label, COUNT(*) AS n FROM viral_post_candidates c JOIN viral_library_status s ON s.candidateId = c.id
    JOIN viral_video_topics vt ON vt.candidateId = c.id JOIN viral_topics t ON t.slug = vt.topicSlug
    WHERE s.status IN ('viral','rising') AND ${ex.caption} GROUP BY t.label ORDER BY n DESC LIMIT 6`);
  console.log(`LIBRARY viral/rising videos whose caption matches this sub-niche: ${lib[0].n}; tagged as: ${tagged.map(t => `${t.label} (${t.n})`).join(", ") || "-"}`);
  const sample = await q(`SELECT c.platform, c.sourceUrl, c.caption, s.multiple FROM viral_post_candidates c JOIN viral_library_status s ON s.candidateId = c.id WHERE s.status IN ('viral','rising') AND ${ex.caption} ORDER BY s.multiple DESC LIMIT 4`);
  for (const v of sample) console.log(`    sub-niche match: ${v.platform} x${v.multiple} | ${v.sourceUrl} | ${clip(v.caption, 90)}`);
}

console.log("\n=== E. Category-level fallback example: what a 'Fitness' tier-2 user sees ===");
for (const v of await q(`
  SELECT c.platform, c.sourceUrl, c.caption, s.multiple, t.label FROM viral_video_topics vt JOIN viral_topics t ON t.slug = vt.topicSlug
  JOIN viral_post_candidates c ON c.id = vt.candidateId JOIN viral_library_status s ON s.candidateId = c.id
  WHERE t.category = 'fitness' AND s.status IN ('viral','rising') ORDER BY s.multiple DESC LIMIT 6`)) console.log(`  [${v.label}] ${v.platform} x${v.multiple} | ${v.sourceUrl} | ${clip(v.caption, 90)}`);
await conn.end();
