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
import { profileDescription, rankForProfile, relevanceProfileText, type RelevanceProfile, type RelevanceVideo } from "../server/viralPosts/relevanceRanking";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const OPENAI = process.env.OPENAI_API_KEY?.trim();
const ANTHROPIC = process.env.ANTHROPIC_API_KEY?.trim();
const conn = await mysql.createConnection({ uri: url });
const q = async (s: string, p: unknown[] = []) => ((await conn.query(s, p)) as unknown as [Array<Record<string, any>>])[0];
const parse = (v: unknown) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);
const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").slice(0, n).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
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

type Entry = { label: string; kind: "real example" | "HYPOTHETICAL (not a real user)" | "sampled user" | "HELD-OUT hypothetical" | "HELD-OUT sampled user" | "FRESH hypothetical" | "FRESH sampled user"; profile: RelevanceProfile };
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
const sample0 = await q(`
  SELECT DISTINCT pi.socialProfileId AS id FROM personalization_items pi
  JOIN viral_profile_topics pt ON pt.socialProfileId = pi.socialProfileId
  WHERE pi.kind = 'niche' AND pi.status = 'confirmed'`);
const sample = [...sample0].sort((a, b) => seeded(String(a.id)).localeCompare(seeded(String(b.id)))).slice(0, 40);
for (const s of sample) {
  if (entries.filter(e => e.kind === "sampled user").length >= 20) break;
  if (s.id === restaurantId || s.id === dubaiId) continue;
  const p = await realProfile(String(s.id));
  if (p && p.topicSlugs.size > 0) entries.push({ label: `user ${String(s.id).slice(0, 8)}`, kind: "sampled user", profile: p });
}

/* ---------- held-out set: never used to tune the ranking ---------- */
const tunedIds = new Set(entries.map(e => e.profile.id));
entries.push({
  label: "wedding photographer", kind: "HELD-OUT hypothetical",
  profile: {
    id: "hypo-wedding", niche: "Wedding photography business", category: "Photography",
    pillars: ["Posing and lighting tips for wedding photos", "Booking more couples: pricing, packages and inquiries", "Behind the scenes of a wedding day shoot"],
    subtopics: ["golden hour portraits", "wedding photography pricing", "first look shots"],
    audiences: [{ who: "Newer wedding photographers", outcome: "book more weddings at higher prices" }],
    goals: ["Sell a photography mentorship"], languages: ["en"],
    topicSlugs: new Set<string>(), embedding: null,
  },
});
entries.push({
  label: "vegan home baker", kind: "HELD-OUT hypothetical",
  profile: {
    id: "hypo-vegan-bake", niche: "Vegan baking at home", category: "Food",
    pillars: ["Egg-free and dairy-free swaps that work", "Easy vegan cakes, cookies and breads", "Fixing common vegan baking failures"],
    subtopics: ["aquafaba meringue", "vegan chocolate cake", "flax egg"],
    audiences: [{ who: "Home bakers who recently went vegan", outcome: "bake treats that taste like the originals" }],
    goals: ["Grow a recipe blog"], languages: ["en"],
    topicSlugs: new Set<string>(), embedding: null,
  },
});
{
  const seeded2 = (id: string) => createHash("sha256").update(`${id}|holdout-1106`).digest("hex");
  let n = 0;
  for (const s of [...sample0].sort((a, b) => seeded2(String(a.id)).localeCompare(seeded2(String(b.id))))) {
    if (n >= 20) break;
    if (tunedIds.has(String(s.id))) continue;
    const p = await realProfile(String(s.id));
    if (p && p.topicSlugs.size > 0) { entries.push({ label: `user ${String(s.id).slice(0, 8)}`, kind: "HELD-OUT sampled user", profile: p }); n++; }
  }
}

/* ---------- fresh set: never seen in any earlier run ---------- */
{
  const seenIds = new Set(entries.map(e => e.profile.id));
  entries.push({
    label: "Toronto realtor", kind: "FRESH hypothetical",
    profile: {
      id: "hypo-toronto", niche: "Toronto real estate for first-time buyers", category: "Real Estate",
      pillars: ["Toronto condo vs house: what first-time buyers can afford", "Ontario first-time buyer programs and land transfer tax rebates", "Toronto neighbourhood guides"],
      subtopics: ["Toronto condo prices", "land transfer tax rebate", "pre-construction condos Toronto"],
      audiences: [{ who: "First-time home buyers in Toronto", outcome: "buy their first home without overpaying" }],
      goals: ["Get buyer clients"], languages: ["en"], topicSlugs: new Set<string>(), embedding: null,
    },
  });
  entries.push({
    label: "dad-life budgeting", kind: "FRESH hypothetical",
    profile: {
      id: "hypo-dad-budget", niche: "Personal finance for young dads", category: "Finance",
      pillars: ["Budgeting on one income with a new baby", "Saving for kids' education", "Paying off debt as a young family"],
      subtopics: ["family budget", "529 plan", "debt snowball"],
      audiences: [{ who: "Young dads with a new baby", outcome: "get their money under control" }],
      goals: ["Grow a newsletter"], languages: ["en"], topicSlugs: new Set<string>(), embedding: null,
    },
  });
  const seeded3 = (id: string) => createHash("sha256").update(`${id}|fresh-1106b`).digest("hex");
  let n = 0;
  for (const s of [...sample0].sort((a, b) => seeded3(String(a.id)).localeCompare(seeded3(String(b.id))))) {
    if (n >= 20) break;
    if (seenIds.has(String(s.id))) continue;
    const p = await realProfile(String(s.id));
    if (p && p.topicSlugs.size > 0) { entries.push({ label: `user ${String(s.id).slice(0, 8)}`, kind: "FRESH sampled user", profile: p }); n++; }
  }
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

/* ---------- AI judge (blinded: one shuffled list, no method, scores or old/new) ---------- */
type Verdict = { subject: string; audience: string; remake: string; why: string };
const relevantOf = (j?: Verdict) => (j ? (j.subject === "yes" && j.remake === "yes" ? "RELEVANT" : j.subject === "unsure" || j.remake === "unsure" ? "UNSURE" : "MISMATCH") : "?");
const shuffleKey = (id: number, salt: string) => createHash("sha256").update(`${salt}|${id}`).digest("hex");
async function judge(e: Entry, videos: RelevanceVideo[]): Promise<Map<number, Verdict>> {
  const out = new Map<number, Verdict>();
  if (!ANTHROPIC || videos.length === 0) return out;
  const list = [...videos].sort((a, b) => shuffleKey(a.id, e.label).localeCompare(shuffleKey(b.id, e.label)));
  const prompt = `Creator profile: ${profileDescription(e.profile)}\n\nFor each video answer three questions separately, using only the caption and summary given:\n` +
    `- subject: is the video about this creator's subject or problem (not just the same kind of person)?\n- audience: would this creator's audience care about it?\n- remake: could this creator usefully study and remake it for their audience (not an unrelated ad or a TV clip)?\n` +
    `Answer each with "yes", "no" or "unsure" (unsure = not enough evidence in the text). Be strict.\n` +
    `Return JSON only: {"items":[{"id":123,"subject":"yes","audience":"no","remake":"yes","why":"under 12 words"}]}\n\n` +
    list.map(v => `- id: ${v.id}\n  caption: ${clip(v.caption, 300)}\n  summary: ${clip(v.summary, 300)}`).join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": ANTHROPIC, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 4000, temperature: 0, messages: [{ role: "user", content: prompt }] }),
  });
  const body = (await res.json()) as any;
  if (!res.ok) console.log(`JUDGE_HTTP ${res.status} ${clip(JSON.stringify(body), 200)}`);
  aiUsd += ((body.usage?.input_tokens ?? 0) * 1 + (body.usage?.output_tokens ?? 0) * 5) / 1e6;
  const text = String(body.content?.find((b: any) => b.type === "text")?.text ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  const norm = (x: unknown) => (["yes", "no", "unsure"].includes(String(x)) ? String(x) : "unsure");
  try {
    for (const x of JSON.parse(text).items ?? []) out.set(Number(x.id), { subject: norm(x.subject), audience: norm(x.audience), remake: norm(x.remake), why: String(x.why ?? "") });
  } catch {
    console.log(`JUDGE_PARSE_FAILED ${e.label}`);
  }
  return out;
}

/* ---------- run ---------- */
const BAL = { relevance: 0.5, performance: 0.5 };
type Tally = { n: number; rel: number; unsure: number; top3: number; top3n: number; offSubject: number; audienceYes: number };
const blank = (): Tally => ({ n: 0, rel: 0, unsure: 0, top3: 0, top3n: 0, offSubject: 0, audienceYes: 0 });
const byKind: Record<string, { old: Tally; neu: Tally; bal: Tally }> = {};
const add = (t: Tally, vids: RelevanceVideo[], v: Map<number, Verdict>) => {
  vids.forEach((x, i) => {
    const j = v.get(x.id); const r = relevantOf(j);
    t.n++; if (r === "RELEVANT") t.rel++; if (r === "UNSURE") t.unsure++; if (j?.subject === "no") t.offSubject++; if (j?.audience === "yes") t.audienceYes++;
    if (i < 3) { t.top3n++; if (r === "RELEVANT") t.top3++; }
  });
};
const fmt = (t: Tally) => `relevant ${t.rel}/${t.n} (${((100 * t.rel) / Math.max(1, t.n)).toFixed(0)}%), top-3 ${t.top3}/${t.top3n}, off-subject ${t.offSubject}, unsure ${t.unsure}, audience-fit ${t.audienceYes}`;
const sheetPicks = new Set(["real example", "HYPOTHETICAL (not a real user)", "FRESH hypothetical"]);
let sheetUsers = 0;
for (const e of entries) {
  const old = oldRank(e.profile.topicSlugs);
  const neu = rankForProfile(e.profile, library, { limit: 10, now });
  const bal = rankForProfile(e.profile, library, { limit: 10, now, final: BAL });
  const verdicts = await judge(e, [...new Map([...old.map(o => o.v), ...neu.picked.map(p => p.video), ...bal.picked.map(p => p.video), ...neu.adjacent.slice(0, 3).map(p => p.video)].map(v => [v.id, v])).values()]);
  const k = (byKind[e.kind] ??= { old: blank(), neu: blank(), bal: blank() });
  const to = blank(), tn = blank(), tb = blank();
  add(to, old.map(o => o.v), verdicts); add(tn, neu.picked.map(p => p.video), verdicts); add(tb, bal.picked.map(p => p.video), verdicts);
  add(k.old, old.map(o => o.v), verdicts); add(k.neu, neu.picked.map(p => p.video), verdicts); add(k.bal, bal.picked.map(p => p.video), verdicts);
  const line = (j?: Verdict) => (j ? `${relevantOf(j)} [subj ${j.subject}, aud ${j.audience}, remake ${j.remake}]` : "?");
  console.log(`\n### ${e.label} | ${e.kind}`);
  console.log(`PROFILE ${clip(profileDescription(e.profile), 400)}`);
  console.log(`TOPICS ${[...e.profile.topicSlugs].join(", ") || "(none)"}`);
  console.log(`OLD ${fmt(to)}`);
  console.log(`NEW ${fmt(tn)} | coverage ${neu.coverage} (eligible ${neu.eligible}, adjacent ${neu.adjacent.length})`);
  console.log(`BAL ${fmt(tb)}`);
  old.forEach((o, i) => { const j = verdicts.get(o.v.id); console.log(`OLD ${i + 1}. ${line(j)} x${o.v.multiple ?? "?"} | ${o.v.url} | ${clip(o.v.caption || o.v.summary, 90)}${j ? ` | judge: ${j.why}` : ""}`); });
  neu.picked.forEach((p, i) => { const j = verdicts.get(p.video.id); console.log(`NEW ${i + 1}. ${line(j)} R ${p.R.toFixed(2)} subj ${p.parts.semantic.toFixed(2)} cos ${p.parts.cosine?.toFixed(3) ?? "-"} P ${p.P.toFixed(2)} ${p.flags.join(",") || "-"} x${p.video.multiple ?? "?"} | ${p.video.url} | ${clip(p.video.caption || p.video.summary, 90)}${j ? ` | judge: ${j.why}` : ""}`); });
  bal.picked.forEach((p, i) => { const j = verdicts.get(p.video.id); console.log(`BAL ${i + 1}. ${line(j)} R ${p.R.toFixed(2)} P ${p.P.toFixed(2)} x${p.video.multiple ?? "?"} | ${p.video.url} | ${clip(p.video.caption || p.video.summary, 90)}`); });
  neu.adjacent.slice(0, 3).forEach((p, i) => { const j = verdicts.get(p.video.id); console.log(`ADJACENT ${i + 1}. ${line(j)} subj ${p.parts.semantic.toFixed(2)} cos ${p.parts.cosine?.toFixed(3) ?? "-"} | ${p.video.url} | ${clip(p.video.caption || p.video.summary, 90)}`); });
  const oldIds = new Set(old.map(o => o.v.id));
  neu.rejected.filter(r => oldIds.has(r.video.id)).slice(0, 5).forEach(r => console.log(`REJECTED (was in old top 10) ${r.rejected} R ${r.R.toFixed(2)} subj ${r.parts.semantic.toFixed(2)} | ${r.video.url} | ${clip(r.video.caption || r.video.summary, 80)}`));
  neu.rejected.filter(r => !oldIds.has(r.video.id)).slice(0, 3).forEach(r => console.log(`REJECTED (closest) ${r.rejected} R ${r.R.toFixed(2)} subj ${r.parts.semantic.toFixed(2)} | ${r.video.url} | ${clip(r.video.caption || r.video.summary, 80)}`));
  // Blind human sheet: top 3 old + top 3 new, merged and shuffled, no method shown.
  const forSheet = sheetPicks.has(e.kind) || (e.kind === "FRESH sampled user" && sheetUsers++ < 6);
  if (forSheet) {
    const items = [...new Map([...old.slice(0, 3).map(o => [o.v.id, { v: o.v, src: "old" }] as const), ...neu.picked.slice(0, 3).map(p => [p.video.id, { v: p.video, src: "new" }] as const)]).values()];
    const both = new Set(old.slice(0, 3).map(o => o.v.id).filter(id => neu.picked.slice(0, 3).some(p => p.video.id === id)));
    items.sort((a, b) => shuffleKey(a.v.id, `sheet|${e.label}`).localeCompare(shuffleKey(b.v.id, `sheet|${e.label}`)));
    console.log(`SHEET_PROFILE ${e.label} | ${e.kind} | ${clip(profileDescription(e.profile), 300)}`);
    items.forEach((it, i) => {
      console.log(`SHEET ${e.label} | ${i + 1} | ${it.v.url} | ${clip(it.v.caption || it.v.summary, 140)}`);
      console.log(`KEY ${e.label} | ${i + 1} | ${both.has(it.v.id) ? "both" : it.src}`);
    });
  }
}
console.log("");
for (const [kind, v] of Object.entries(byKind)) console.log(`SUMMARY ${kind}: OLD ${fmt(v.old)} || NEW70 ${fmt(v.neu)} || NEW50 ${fmt(v.bal)}`);
console.log(`COST AI judge ~$${aiUsd.toFixed(4)} (+ embeddings above)`);
await conn.end();
