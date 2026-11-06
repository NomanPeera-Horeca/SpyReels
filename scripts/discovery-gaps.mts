/**
 * Discovery gaps (read-only DB). Two questions:
 *  A) Untagged viral/rising videos: why? not processed yet / processing failed /
 *     processed but AI tagged no topic. For the last group, nearest existing topic
 *     by meaning: close = tagging missed it, far = genuinely new subject (sub-niche ideas).
 *  B) Coverage: share of real creator profiles with at least 5 genuine matches
 *     from the new ranking (rel-2026-11-06c), by detailed / sparse / place-specific.
 * Paid calls: OpenAI embeddings for topic labels and profile texts (~$0.001).
 */
import mysql from "mysql2/promise";
import { cosine, profileSignals, rankForProfile, relevanceProfileText, type RelevanceProfile, type RelevanceVideo } from "../server/viralPosts/relevanceRanking";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const OPENAI = process.env.OPENAI_API_KEY?.trim();
if (!OPENAI) throw new Error("OPENAI_API_KEY is not configured.");
const conn = await mysql.createConnection({ uri: url });
const q = async (s: string, p: unknown[] = []) => ((await conn.query(s, p)) as unknown as [Array<Record<string, any>>])[0];
const parse = (v: unknown) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").slice(0, n).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
let tokens = 0;
async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 500) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts.slice(i, i + 500).map(t => t || "-"), dimensions: 512 }),
    });
    const body = (await res.json()) as { data?: Array<{ embedding: number[] }>; usage?: { total_tokens: number } };
    if (!res.ok || !body.data) throw new Error(`embeddings HTTP ${res.status}`);
    tokens += body.usage?.total_tokens ?? 0;
    out.push(...body.data.map(d => d.embedding));
  }
  return out;
}

/* ---------- A) untagged videos ---------- */
const lib = await q(`
  SELECT c.id, c.platform, c.caption, s.status, i.status AS istatus, i.summary, i.embedding, i.error,
    (SELECT COUNT(*) FROM viral_video_topics t WHERE t.candidateId = c.id) AS ntags
  FROM viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId
  LEFT JOIN viral_video_insights i ON i.candidateId = c.id
  WHERE s.status IN ('viral','rising')`);
const untagged = lib.filter(r => Number(r.ntags) === 0);
console.log(`LIBRARY viral+rising ${lib.length} | untagged ${untagged.length}`);
const bucket = new Map<string, any[]>();
for (const r of untagged) {
  const k = !r.istatus ? "not_processed_no_row" : r.istatus !== "done" ? `not_done:${r.istatus}` : "processed_no_topic";
  bucket.set(k, [...(bucket.get(k) ?? []), r]);
}
for (const [k, v] of [...bucket].sort((a, b) => b[1].length - a[1].length)) {
  const byP: Record<string, number> = {};
  for (const r of v) byP[r.platform] = (byP[r.platform] ?? 0) + 1;
  console.log(`UNTAGGED ${k}: ${v.length} | ${Object.entries(byP).map(([p, n]) => `${p} ${n}`).join(", ")}`);
  const errs: Record<string, number> = {};
  for (const r of v) if (r.error) errs[clip(r.error, 60)] = (errs[clip(r.error, 60)] ?? 0) + 1;
  Object.entries(errs).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([e, n]) => console.log(`  ERROR x${n} ${e}`));
}
const topics = await q(`SELECT slug, label, category FROM viral_topics`);
const topicVecs = await embed(topics.map(t => `${t.label} (${t.category})`));
const processedNoTopic = (bucket.get("processed_no_topic") ?? []).filter(r => Array.isArray(parse(r.embedding)));
let close = 0;
const far: Array<{ r: any; best: string; c: number }> = [];
const nearestCount = new Map<string, number>();
for (const r of processedNoTopic) {
  const v = parse(r.embedding) as number[];
  let best = -1, bi = 0;
  topicVecs.forEach((t, i) => { const c = cosine(v, t); if (c > best) { best = c; bi = i; } });
  const label = `${topics[bi].label} [${topics[bi].category}]`;
  if (best >= 0.45) { close++; nearestCount.set(label, (nearestCount.get(label) ?? 0) + 1); }
  else far.push({ r, best: label, c: best });
}
console.log(`PROCESSED_NO_TOPIC with embedding ${processedNoTopic.length} | close to an existing topic (cos>=0.45) ${close} | far from every topic ${far.length}`);
[...nearestCount].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([l, n]) => console.log(`  NEAREST_TOPIC x${n} ${l}`));
const farByCat = new Map<string, number>();
for (const f of far) { const cat = f.best.replace(/.*\[(.*)\]$/, "$1"); farByCat.set(cat, (farByCat.get(cat) ?? 0) + 1); }
console.log(`  FAR by nearest category: ${[...farByCat].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(", ")}`);
far.sort(() => 0).slice(0, 40).forEach(f => console.log(`  FAR_SAMPLE cos ${f.c.toFixed(2)} near "${f.best}" | ${f.r.platform} | ${clip(f.r.summary || f.r.caption, 150)}`));

/* ---------- B) coverage of real profiles ---------- */
const rows = await q(`
  SELECT c.id, c.platform, c.sourceUrl, c.caption, c.creatorHandle, c.creatorId, c.publishedAt, s.status, s.multiple, i.summary, i.format, i.embedding
  FROM viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId
  LEFT JOIN viral_video_insights i ON i.candidateId = c.id
  WHERE s.status IN ('viral','rising') AND (c.publishedAt IS NULL OR c.publishedAt >= NOW() - INTERVAL 365 DAY)`);
const tags = await q(`SELECT candidateId, topicSlug FROM viral_video_topics`);
const topicsBy = new Map<number, string[]>();
for (const t of tags) topicsBy.set(Number(t.candidateId), [...(topicsBy.get(Number(t.candidateId)) ?? []), t.topicSlug]);
const library: RelevanceVideo[] = rows.map(r => {
  const e = parse(r.embedding);
  return {
    id: Number(r.id), platform: String(r.platform), url: String(r.sourceUrl ?? ""), caption: String(r.caption ?? ""),
    summary: r.summary ? String(r.summary) : null, format: r.format ? String(r.format) : null,
    topicSlugs: topicsBy.get(Number(r.id)) ?? [], status: String(r.status), multiple: r.multiple == null ? null : Number(r.multiple),
    publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
    creatorKey: `${r.platform}:${String(r.creatorHandle || r.creatorId || "").trim().replace(/^@+/, "").toLowerCase()}`,
    embedding: Array.isArray(e) ? Float32Array.from(e) : null,
  };
});
const items = await q(`SELECT socialProfileId AS id, kind, CAST(payload AS CHAR) AS p FROM personalization_items WHERE status = 'confirmed' AND kind IN ('niche','pillar','audience','goal','language')`);
const subs = await q(`SELECT socialProfileId AS id, label FROM pillar_subtopics WHERE status <> 'dismissed'`).catch(() => []);
const ptops = await q(`SELECT socialProfileId AS id, topicSlug FROM viral_profile_topics`);
const byId = new Map<string, { its: Array<{ kind: string; p: any }>; subs: string[]; topics: Set<string> }>();
const get = (id: string) => { let x = byId.get(id); if (!x) byId.set(id, (x = { its: [], subs: [], topics: new Set() })); return x; };
for (const r of items) get(String(r.id)).its.push({ kind: r.kind, p: parse(r.p) ?? {} });
for (const r of subs) get(String(r.id)).subs.push(String(r.label));
for (const r of ptops) get(String(r.id)).topics.add(String(r.topicSlug));
const profiles: RelevanceProfile[] = [];
for (const [id, x] of byId) {
  const niche = x.its.find(i => i.kind === "niche")?.p;
  if (!niche || x.topics.size === 0) continue;
  profiles.push({
    id, niche: String(niche.label ?? ""), category: niche.categoryLabel ?? null,
    pillars: x.its.filter(i => i.kind === "pillar").map(i => [i.p.title, i.p.description].filter(Boolean).join(": ")),
    subtopics: x.subs.slice(0, 40),
    audiences: x.its.filter(i => i.kind === "audience" && i.p.who).map(i => ({ who: String(i.p.who), outcome: i.p.outcome || undefined })),
    goals: x.its.filter(i => i.kind === "goal" && i.p.text).map(i => String(i.p.text)),
    languages: x.its.filter(i => i.kind === "language" && i.p.code).map(i => String(i.p.code)),
    topicSlugs: x.topics, embedding: null,
  });
}
const pv = await embed(profiles.map(p => relevanceProfileText(p)));
profiles.forEach((p, i) => (p.embedding = pv[i]!));
type G = { n: number; ge5: number; one4: number; zero: number };
const groups: Record<string, G> = {};
const gaps: string[] = [];
const now = new Date();
for (const p of profiles) {
  const r = rankForProfile(p, library, { limit: 10, now });
  const sig = profileSignals(p);
  const g = r.sparseProfile ? "short profile (niche label only)" : sig.placeStrict ? "place-specific" : "detailed profile";
  for (const k of ["ALL", g]) {
    const x = (groups[k] ??= { n: 0, ge5: 0, one4: 0, zero: 0 });
    x.n++; const m = r.picked.length;
    if (m >= 5) x.ge5++; else if (m >= 1) x.one4++; else x.zero++;
  }
  if (r.picked.length < 5) gaps.push(`GAP matches ${r.picked.length} | ${g} | ${p.category ?? ""} | ${clip(p.niche, 60)} | pillars: ${clip(p.pillars.map(x => x.split(":")[0]).join("; "), 120)}`);
}
for (const [k, x] of Object.entries(groups)) console.log(`COVERAGE ${k}: profiles ${x.n} | 5+ genuine matches ${x.ge5} (${((100 * x.ge5) / x.n).toFixed(0)}%) | 1-4 ${x.one4} | none ${x.zero}`);
gaps.forEach(g => console.log(g));
console.log(`COST embeddings ${tokens} tokens (~$${((tokens * 0.02) / 1e6).toFixed(4)})`);
await conn.end();
