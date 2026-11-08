/**
 * Topic matching dry run (read-only DB, no writes, no searches).
 * Compares each creator's CURRENT matched topics with what a revised matching
 * prompt would pick: close-fit "core" topics, loose "broad" topics, and
 * specific NEW topics when a pillar only fits loosely. Includes audience and goals.
 * Profiles: the newest "AI video content for business owners" user + 20 seeded samples.
 * Paid: one Claude Haiku call per profile (~$0.002 each).
 */
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
const KEY = process.env.ANTHROPIC_API_KEY?.trim();
if (!url || !KEY) throw new Error("EVAL_DB_READONLY_URL and ANTHROPIC_API_KEY are required.");
const conn = await mysql.createConnection({ uri: url });
const q = async (s: string, p: unknown[] = []) => ((await conn.query(s, p)) as unknown as [Array<Record<string, any>>])[0];
const parse = (v: unknown) => (typeof v === "string" ? (() => { try { return JSON.parse(v); } catch { return null; } })() : v);
const line = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
let usd = 0;

const topics = await q(`SELECT slug, label, category FROM viral_topics ORDER BY category, slug`);
const categories = [...new Set(topics.map(t => String(t.category)))];
const known = new Set(topics.map(t => String(t.slug)));
const labelOf = new Map(topics.map(t => [String(t.slug), String(t.label)]));
const topicList = categories.map(c => `${c}: ${topics.filter(t => t.category === c).map(t => t.slug).join(", ")}`).join("\n");

type P = { id: string; category: string; niche: string; pillars: string[]; subtopics: string[]; audiences: string[]; goals: string[]; current: string[] };
async function load(id: string): Promise<P | null> {
  const its = (await q(`SELECT kind, CAST(payload AS CHAR) AS p FROM personalization_items WHERE socialProfileId = ? AND status = 'confirmed'`, [id])).map(r => ({ kind: String(r.kind), p: parse(r.p) ?? {} }));
  const niche = its.find(i => i.kind === "niche")?.p;
  if (!niche) return null;
  const subs = await q(`SELECT label FROM pillar_subtopics WHERE socialProfileId = ? AND status <> 'dismissed' LIMIT 30`, [id]).catch(() => []);
  const cur = await q(`SELECT topicSlug FROM viral_profile_topics WHERE socialProfileId = ?`, [id]);
  return {
    id,
    category: String(niche.categoryLabel ?? ""),
    niche: String(niche.label ?? ""),
    pillars: its.filter(i => i.kind === "pillar").map(i => [i.p.title, i.p.description].filter(Boolean).join(": ")),
    subtopics: subs.map(s => String(s.label)),
    audiences: its.filter(i => i.kind === "audience" && i.p.who).map(i => [i.p.who, i.p.outcome && `wants to ${i.p.outcome}`].filter(Boolean).join(", ")),
    goals: its.filter(i => i.kind === "goal" && i.p.text).map(i => String(i.p.text)),
    current: cur.map(c => String(c.topicSlug)),
  };
}

const SYSTEM = [
  "You match a content creator to topics, so we can find viral short videos THEY could remake for THEIR audience.",
  "Step 1: for each content pillar, decide whether a listed topic is a CLOSE fit: a video tagged with it would usually be useful to this creator as-is.",
  "A loose neighbour is NOT close (e.g. 'faceless side hustles' is not close to 'AI clones for business owners'; 'small business tips' is not close to 'laundromat ownership').",
  "Step 2: put close-fit topics in core (max 5). Put loosely related topics that might still give occasional ideas in broad (max 3).",
  "Step 3: for every pillar with NO close-fit topic, create a new SPECIFIC topic (max 3): a 2-6 word label naming the real subject and, if it matters, who it is for or where (e.g. 'AI avatars for business personal brands', 'Dubai tenant rights'). Specific beats general.",
  `Each new topic needs one category from: ${categories.join(", ")}.`,
  "Use the audience and goals to judge fit, but topics describe SUBJECTS, not audiences.",
  'Return JSON only: {"core":["slug"],"broad":["slug"],"newTopics":[{"label":"...","category":"...","forPillar":"..."}]}',
  "",
  "Topics by category:",
  topicList,
].join("\n");

async function match(p: P) {
  const user = [
    `Category: ${line(p.category, 60) || "(none)"}`,
    `Niche: ${line(p.niche, 120) || "(none)"}`,
    `Audience: ${p.audiences.map(a => line(a, 120)).join("; ") || "(none)"}`,
    `Goals: ${p.goals.map(g => line(g, 120)).join("; ") || "(none)"}`,
    `Pillars: ${p.pillars.map(x => line(x, 140)).join("; ") || "(none)"}`,
    `Sub-topics: ${p.subtopics.map(x => line(x, 60)).join("; ") || "(none)"}`,
  ].join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 700, temperature: 0, system: SYSTEM, messages: [{ role: "user", content: user }] }),
  });
  const body = (await res.json()) as any;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  usd += ((body.usage?.input_tokens ?? 0) * 1 + (body.usage?.output_tokens ?? 0) * 5) / 1e6;
  const text = String(body.content?.find((b: any) => b.type === "text")?.text ?? "");
  const m = text.match(/\{[\s\S]*\}/);
  const j = m ? JSON.parse(m[0]) : {};
  const clean = (a: unknown) => (Array.isArray(a) ? a.map(x => String(x).trim().toLowerCase()).filter(s => known.has(s)) : []);
  return { core: clean(j.core).slice(0, 5), broad: clean(j.broad).slice(0, 3), newTopics: (Array.isArray(j.newTopics) ? j.newTopics : []).slice(0, 3) };
}

/* ---------- profiles ---------- */
const ids: string[] = [];
const ai = await q(`SELECT socialProfileId AS id, MAX(createdAt) at FROM personalization_items WHERE kind = 'niche' AND status = 'confirmed' AND LOWER(CAST(payload AS CHAR)) LIKE '%ai video%' GROUP BY socialProfileId ORDER BY at DESC LIMIT 1`);
if (ai[0]) ids.push(String(ai[0].id));
const all = await q(`SELECT DISTINCT pi.socialProfileId AS id FROM personalization_items pi JOIN viral_profile_topics pt ON pt.socialProfileId = pi.socialProfileId WHERE pi.kind = 'pillar' AND pi.status = 'confirmed'`);
const seeded = (id: string) => createHash("sha256").update(`${id}|topic-dryrun-1108`).digest("hex");
for (const r of all.sort((a, b) => seeded(String(a.id)).localeCompare(seeded(String(b.id))))) {
  if (ids.length >= 21) break;
  if (!ids.includes(String(r.id))) ids.push(String(r.id));
}

let newTotal = 0, coreTotal = 0, dropped = 0;
for (const id of ids) {
  const p = await load(id);
  if (!p) continue;
  let r;
  try { r = await match(p); } catch (err) { console.log(`\n### ${id.slice(0, 8)} FAILED ${String(err).slice(0, 160)}`); continue; }
  newTotal += r.newTopics.length; coreTotal += r.core.length;
  const keep = new Set([...r.core, ...r.broad]);
  const removed = p.current.filter(s => !keep.has(s));
  dropped += removed.length;
  console.log(`\n### ${id.slice(0, 8)} | ${line(p.category, 30)} | ${line(p.niche, 80)}`);
  console.log(`PILLARS ${p.pillars.map(x => line(x.split(":")[0], 40)).join("; ") || "(none)"}`);
  console.log(`AUDIENCE ${p.audiences.map(a => line(a, 80)).join("; ") || "(none)"}`);
  console.log(`NOW ${p.current.map(s => labelOf.get(s) ?? s).join(" | ") || "(none)"}`);
  console.log(`CORE ${r.core.map(s => labelOf.get(s) ?? s).join(" | ") || "(none)"}`);
  console.log(`BROAD ${r.broad.map(s => labelOf.get(s) ?? s).join(" | ") || "(none)"}`);
  console.log(`NEW ${r.newTopics.map((t: any) => `"${line(t.label, 60)}" [${t.category}] for ${line(t.forPillar, 40)}`).join(" | ") || "(none)"}`);
  console.log(`DROPPED ${removed.map(s => labelOf.get(s) ?? s).join(" | ") || "(none)"}`);
}
console.log(`\nSUMMARY profiles ${ids.length} | new specific topics ${newTotal} | core picks ${coreTotal} | current topics dropped ${dropped}`);
console.log(`COST Haiku ~$${usd.toFixed(4)}`);
await conn.end();
