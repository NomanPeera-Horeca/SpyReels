/**
 * Old vs proposed Home recommendations on ONE library snapshot (read-only DB).
 * Profiles: 2 real example users (restaurant-profit, Dubai rental law), 2
 * HYPOTHETICAL profiles (busy-mom fitness coach, laundromat owner: made up,
 * not users; topics assumed as the matcher would pick), and 20 sampled users.
 * For each: top 10 old (current tiers + viral sort) and new (relevanceRanking),
 * an AI judge's relevant / mismatch call per video, and the new ranking's
 * strongest rejections with reasons.
 * Paid calls: one OpenAI embedding per profile text (~$0.0001 total) and one
 * Haiku judge call per profile (~$0.003 each).
 */
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import { rankForProfile, relevanceProfileText, type RelevanceProfile, type RelevanceVideo } from "../server/viralPosts/relevanceRanking";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const OPENAI = process.env.OPENAI_API_KEY?.trim();
const ANTHROPIC = process.env.ANTHROPIC_API_KEY?.trim();
const conn = await mysql.createConnection({ uri: url });
const q = async (s: string, p: unknown[] = []) => ((await conn.query(s, p)) as unknown as [Array<Record<string, any>>])[0];
const parse = (v: unknown) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").slice(0, n);
const now = new Date();
let aiUsd = 0;

/* ---------- one snapshot of the library ---------- */
const rows = await q(`
  SELECT c.id, c.platform, c.sourceUrl, c.caption, c.creatorHandle, c.creatorId, c.publishedAt, s.status, s.multiple, i.summary, i.format, i.embedding
  FROM viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId
  LEFT JOIN viral_video_insights i ON i.candidateId = c.id
  WHERE s.status IN ('viral','rising') AND (c.publishedAt IS NULL OR c.publishedAt >= NOW() - INTERVAL 365 DAY)`);
const tags = await q(`SELECT vt.candidateId, vt.topicSlug, t.category FROM viral_video_topics vt JOIN viral_topics t ON t.slug = vt.topicSlug`);
const topicsBy = new Map<number, string[]>();
for (const t of tags) topicsBy.set(Number(t.candidateId), [...(topicsBy.get(Number(t.candidateId)) ?? []), t.topicSlug]);
const allTopics = await q(`SELECT slug, category FROM viral_topics`);
const categoryOf = new Map(allTopics.map(t => [t.slug as string, t.category as string]));
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
console.log(`SNAPSHOT ${now.toISOString()} videos ${library.length} with embeddings ${library.filter(v => v.embedding).length}`);

/* ---------- old ranking (libraryHome.ts tiers + libraryScore) ---------- */
function oldRank(topicSlugs: Set<string>, limit = 10): Array<{ v: RelevanceVideo; tier: number }> {
  const cats = new Set([...topicSlugs].map(s => categoryOf.get(s)).filter(Boolean));
  const tierOf = (v: RelevanceVideo) => {
    if (v.topicSlugs.some(t => topicSlugs.has(t))) return 1;
    if (v.topicSlugs.some(t => cats.has(categoryOf.get(t)))) return 2;
    return v.status === "viral" ? 3 : 9;
  };
  const score = (v: RelevanceVideo) => {
    const m = Math.max(1, v.multiple ?? 1);
    const age = v.publishedAt ? Math.max(0, (now.getTime() - v.publishedAt.getTime()) / 86_400_000) : 180;
    const overlap = v.topicSlugs.filter(t => topicSlugs.has(t)).length;
    return Math.log10(m) * 2 + (1 / (1 + age / 30)) * 2 + overlap * 0.75 + (v.status === "rising" ? 0.5 : 0);
  };
  const out: Array<{ v: RelevanceVideo; tier: number }> = [];
  const seen = new Set<string>();
  for (const v of library.map(v => ({ v, tier: tierOf(v) })).filter(x => x.tier < 9).sort((a, b) => a.tier - b.tier || score(b.v) - score(a.v))) {
    if (out.length >= limit) break;
    if (seen.has(v.v.creatorKey)) continue;
    seen.add(v.v.creatorKey);
    out.push(v);
  }
  return out;
}

/* ---------- profiles ---------- */
async function realProfile(id: string): Promise<RelevanceProfile | null> {
  const items = await q(`SELECT kind, CAST(payload AS CHAR) AS p FROM personalization_items WHERE socialProfileId = ? AND status = 'confirmed' AND kind IN ('niche','pillar','audience','goal','language')`, [id]);
  const its = items.map(r => ({ kind: r.kind as string, p: parse(r.p) ?? {} }));
  const niche = its.find(i => i.kind === "niche")?.p;
  if (!niche) return null;
  const subs = await q(`SELECT label FROM pillar_subtopics WHERE socialProfileId = ? AND status <> 'dismissed' LIMIT 40`, [id]).catch(() => []);
  const tps = await q(`SELECT topicSlug FROM viral_profile_topics WHERE socialProfileId = ?`, [id]);
  return {
    id, niche: String(niche.label ?? ""), category: niche.categoryLabel ?? null,
    pillars: its.filter(i => i.kind === "pillar").map(i => [i.p.title, i.p.description].filter(Boolean).join(": ")),
    subtopics: subs.map(s => s.label),
    audiences: its.filter(i => i.kind === "audience" && i.p.who).map(i => ({ who: String(i.p.who), outcome: i.p.outcome || undefined, problem: i.p.problem || undefined })),
    goals: its.filter(i => i.kind === "goal" && i.p.text).map(i => String(i.p.text)),
    languages: its.filter(i => i.kind === "language" && i.p.code).map(i => String(i.p.code)),
    topicSlugs: new Set(tps.map(t => t.topicSlug as string)), embedding: null,
  };
}
const findOne = async (where: string) => (await q(`SELECT socialProfileId AS id FROM (SELECT socialProfileId, LOWER(CAST(payload AS CHAR)) AS t FROM personalization_items WHERE status = 'confirmed' AND kind IN ('niche','pillar')) x WHERE ${where} GROUP BY socialProfileId LIMIT 1`))[0]?.id as string | undefined;

type Entry = { label: string; kind: "real example" | "HYPOTHETICAL (not a real user)" | "sampled user"; profile: RelevanceProfile };
const entries: Entry[] = [];
const restaurantId = await findOne(`t LIKE '%restaurant%' AND (t LIKE '%profit%' OR t LIKE '%margin%' OR t LIKE '%finance%')`);
const dubaiId = await findOne(`t LIKE '%dubai%' AND (t LIKE '%rent%' OR t LIKE '%tenant%')`);
for (const [label, id] of [["restaurant-profit consultant", restaurantId], ["Dubai rental-law creator", dubaiId]] as const) {
  const p = id ? await realProfile(id) : null;
  if (p) entries.push({ label, kind: "real example", profile: p });
}
entries.push({
  label: "busy-mom fitness coach", kind: "HYPOTHETICAL (not a real user)",
  profile: {
    id: "hypo-mom", niche: "Fitness coaching for busy moms", category: "Fitness",
    pillars: ["Quick home workouts: 10-20 minute routines moms can do with kids around", "Postpartum fitness: safe ways to rebuild strength after pregnancy", "Mom-friendly nutrition: simple meals for energy and fat loss", "Mindset for busy moms: consistency without guilt"],
    subtopics: ["no-equipment workouts", "workouts with kids", "postpartum core", "meal prep for families"],
    audiences: [{ who: "Busy moms with young kids", outcome: "get fit and energized with short workouts at home", problem: "no time and no childcare to go to the gym" }],
    goals: ["Grow online coaching clients"], languages: ["en"],
    topicSlugs: new Set(["home-workouts", "womens-fitness", "weight-loss", "fitness-motivation", "mom-life"]), embedding: null,
  },
});
entries.push({
  label: "laundromat owner", kind: "HYPOTHETICAL (not a real user)",
  profile: {
    id: "hypo-laundromat", niche: "Laundromat business ownership", category: "Business",
    pillars: ["Running a laundromat: machines, utilities, staffing and daily operations", "Buying a laundromat: deal analysis, leases and valuations", "Growing revenue: wash-and-fold, pickup and delivery, commercial accounts", "Behind the scenes of owning a cash-flowing local business"],
    subtopics: ["laundromat cash flow", "wash and fold service", "buying a laundromat", "coin vs card machines"],
    audiences: [{ who: "Aspiring and new laundromat owners", outcome: "buy and run a profitable laundromat" }, { who: "Small business owners looking for semi-passive local businesses", outcome: "find a cash-flowing business to buy" }],
    goals: ["Build authority and get consulting clients"], languages: ["en"],
    topicSlugs: new Set(["small-business-tips", "side-hustles", "business-growth-stories", "starting-a-business"]), embedding: null,
  },
});
const seeded = (id: string) => createHash("sha256").update(`${id}|seed-1105`).digest("hex");
const sample = (await q(`
  SELECT DISTINCT pi.socialProfileId AS id FROM personalization_items pi
  JOIN viral_profile_topics pt ON pt.socialProfileId = pi.socialProfileId
  WHERE pi.kind = 'niche' AND pi.status = 'confirmed'`)).sort((a, b) => seeded(String(a.id)).localeCompare(seeded(String(b.id)))).slice(0, 40);
for (const s of sample) {
  if (entries.filter(e => e.kind === "sampled user").length >= 20) break;
  if (s.id === restaurantId || s.id === dubaiId) continue;
  const p = await realProfile(String(s.id));
  if (p && p.topicSlugs.size > 0) entries.push({ label: `user ${String(s.id).slice(0, 8)}`, kind: "sampled user", profile: p });
}

/* ---------- embeddings (one call for all profiles) ---------- */
if (OPENAI) {
  const texts = entries.map(e => relevanceProfileText(e.profile));
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: texts, dimensions: 512 }),
  });
  const body = (await res.json()) as { data?: Array<{ embedding: number[] }>; usage?: { total_tokens: number } };
  body.data?.forEach((d, i) => (entries[i]!.profile.embedding = d.embedding));
  console.log(`EMBEDDINGS ${body.data?.length ?? 0} profiles, ${body.usage?.total_tokens ?? "?"} tokens (~$${(((body.usage?.total_tokens ?? 0) * 0.02) / 1e6).toFixed(5)})`);
} else {
  // Interim fallback: the stored profile embedding (niche, pillars, sub-topics; WITHOUT audience and goals).
  let used = 0;
  for (const e of entries) {
    if (e.kind === "HYPOTHETICAL (not a real user)") continue;
    const r = await q(`SELECT embedding FROM viral_profile_topic_runs WHERE socialProfileId = ? AND embedding IS NOT NULL LIMIT 1`, [e.profile.id]);
    const v = parse(r[0]?.embedding);
    if (Array.isArray(v)) { e.profile.embedding = v; used++; }
  }
  console.log(`EMBEDDINGS fallback: OPENAI_API_KEY secret missing; ${used} real profiles use their stored embedding (no audience/goals in it); hypothetical profiles have none`);
}

/* ---------- AI judge ---------- */
async function judge(e: Entry, videos: RelevanceVideo[]): Promise<Map<number, { ok: boolean; why: string }>> {
  const out = new Map<number, { ok: boolean; why: string }>();
  if (!ANTHROPIC || videos.length === 0) return out;
  const p = e.profile;
  const prompt = `Creator: ${relevanceProfileText(p)}\n\nFor each video, would it be a relevant video for THIS creator to study and remake for THEIR audience (right subject, audience, place and language; not an unrelated ad or a TV clip)? Be strict.\nReturn JSON only: {"items":[{"id":123,"relevant":true,"why":"under 12 words"}]}\n\n` +
    videos.map(v => `- id: ${v.id}\n  caption: ${clip(v.caption, 260)}\n  summary: ${clip(v.summary, 200)}`).join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 2500, temperature: 0, messages: [{ role: "user", content: prompt }] }),
  });
  const body = (await res.json()) as any;
  if (!res.ok) console.log(`JUDGE_HTTP ${res.status} ${clip(JSON.stringify(body), 200)}`);
  aiUsd += ((body.usage?.input_tokens ?? 0) * 1 + (body.usage?.output_tokens ?? 0) * 5) / 1e6;
  const text = String(body.content?.find((b: any) => b.type === "text")?.text ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    for (const x of JSON.parse(text).items ?? []) out.set(Number(x.id), { ok: x.relevant === true, why: String(x.why ?? "") });
  } catch {
    console.log(`JUDGE_PARSE_FAILED ${e.label}`);
  }
  return out;
}

/* ---------- run ---------- */
const totals = { old: { ok: 0, n: 0 }, neu: { ok: 0, n: 0 } };
const byKind: Record<string, { old: [number, number]; neu: [number, number] }> = {};
for (const e of entries) {
  const old = oldRank(e.profile.topicSlugs);
  const neu = rankForProfile(e.profile, library, { limit: 10, now });
  const verdicts = await judge(e, [...new Map([...old.map(o => o.v), ...neu.picked.map(p => p.video)].map(v => [v.id, v])).values()]);
  const okOld = old.filter(o => verdicts.get(o.v.id)?.ok).length;
  const okNew = neu.picked.filter(p => verdicts.get(p.video.id)?.ok).length;
  totals.old.ok += okOld; totals.old.n += old.length; totals.neu.ok += okNew; totals.neu.n += neu.picked.length;
  const k = (byKind[e.kind] ??= { old: [0, 0], neu: [0, 0] });
  k.old[0] += okOld; k.old[1] += old.length; k.neu[0] += okNew; k.neu[1] += neu.picked.length;
  console.log(`\n### ${e.label} | ${e.kind}`);
  console.log(`PROFILE ${clip(relevanceProfileText(e.profile), 400)}`);
  console.log(`TOPICS ${[...e.profile.topicSlugs].join(", ")}`);
  console.log(`OLD relevant ${okOld}/${old.length} | NEW relevant ${okNew}/${neu.picked.length} | new coverage ${neu.coverage} (eligible ${neu.eligible})`);
  old.forEach((o, i) => { const j = verdicts.get(o.v.id); console.log(`OLD ${i + 1}. [tier ${o.tier}] ${j ? (j.ok ? "RELEVANT" : "MISMATCH") : "?"} x${o.v.multiple ?? "?"} | ${o.v.url} | ${clip(o.v.caption || o.v.summary, 90)}${j && !j.ok ? ` | judge: ${j.why}` : ""}`); });
  neu.picked.forEach((p, i) => { const j = verdicts.get(p.video.id); console.log(`NEW ${i + 1}. R ${p.R.toFixed(2)} P ${p.P.toFixed(2)} ${p.flags.join(",") || "-"} ${j ? (j.ok ? "RELEVANT" : "MISMATCH") : "?"} x${p.video.multiple ?? "?"} | ${p.video.url} | ${clip(p.video.caption || p.video.summary, 90)}${j && !j.ok ? ` | judge: ${j.why}` : ""}`); });
  const oldIds = new Set(old.map(o => o.v.id));
  const rejectedFromOld = neu.rejected.filter(r => oldIds.has(r.video.id)).slice(0, 5);
  rejectedFromOld.forEach(r => console.log(`REJECTED (was in old top 10) ${r.rejected} R ${r.R.toFixed(2)} | ${r.video.url} | ${clip(r.video.caption || r.video.summary, 80)}`));
  neu.rejected.filter(r => !oldIds.has(r.video.id)).slice(0, 3).forEach(r => console.log(`REJECTED (closest) ${r.rejected} R ${r.R.toFixed(2)} | ${r.video.url} | ${clip(r.video.caption || r.video.summary, 80)}`));
}
console.log(`\nSUMMARY judged relevant in top 10: OLD ${totals.old.ok}/${totals.old.n} (${((100 * totals.old.ok) / Math.max(1, totals.old.n)).toFixed(0)}%) | NEW ${totals.neu.ok}/${totals.neu.n} (${((100 * totals.neu.ok) / Math.max(1, totals.neu.n)).toFixed(0)}%)`);
for (const [kind, v] of Object.entries(byKind)) console.log(`SUMMARY ${kind}: OLD ${v.old[0]}/${v.old[1]} | NEW ${v.neu[0]}/${v.neu[1]}`);
console.log(`COST AI judge ~$${aiUsd.toFixed(4)} (+ embeddings above)`);
await conn.end();
