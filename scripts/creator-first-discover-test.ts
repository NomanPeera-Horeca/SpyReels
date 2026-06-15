import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { routeNiche } from "../server/ai/prompts/niche-routing";
import { searchReelsByKeyword, type SearchReelData } from "../server/instagram";

const SONNET_MODEL = "claude-sonnet-4-6";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MIN_VIEWS = 5_000;
const MIN_REACH_MULTIPLIER = 3;
const MIN_VIRAL_SCORE = 1;
const TIER2_MIN_VIEWS = 1_000;
const TIER2_MIN_REACH_MULTIPLIER = 1.5;
const CREATOR_MIN_FOLLOWERS = 10_000;
const TOPICS_TARGET = 24;
const MAX_RESULTS_PER_TOPIC = 40;
const PEER_SCORE_BATCH = 15;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Topic { pillar: string; phrase: string; }
interface ScoredReel {
  shortcode: string; caption: string; reelUrl: string; views: number; likes: number;
  comments: number; username: string; fullName: string; followers: number; isPrivate: boolean;
  viralScore: number; tier: 1 | 2; foundVia: Topic; peerKeep?: boolean; peerReason?: string;
}
function computeViralScore(v: number, f: number, l: number, c: number): number {
  return (v / f) * ((l + c) / v) * 100;
}
function classifyTier(v: number, f: number, l: number, c: number, p: boolean): 1 | 2 | null {
  if (p || f <= 0) return null;
  const reach = v / f; const score = computeViralScore(v, f, l, c);
  if (reach >= MIN_REACH_MULTIPLIER && v >= MIN_VIEWS && score >= MIN_VIRAL_SCORE) return 1;
  if (reach >= TIER2_MIN_REACH_MULTIPLIER && v >= TIER2_MIN_VIEWS) return 2;
  return null;
}
function stripCodeFences(t: string): string {
  return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}
function firstTextBlock(content: Anthropic.Messages.ContentBlock[]): string {
  const b = content.find((x) => x.type === "text");
  return b && b.type === "text" ? b.text : "";
}
const PILLAR_TOPIC_SYSTEM = `You are SpyReels' content-pillar engine. A social media coach manually does this: they look at a niche, work out the content PILLARS that actually perform IN THAT SPECIFIC NICHE, then search those topics on Instagram to find the creators already winning with them.

Your job: given a business and how its buyers were mapped, infer the content pillars that genuinely fit THIS niche (not a generic checklist, not always "how-to" teaching), then produce searchable Instagram topic phrases under each pillar.

CRITICAL:
- Pillars are NICHE-SPECIFIC. Detect what fits.
- Topics are NOT always teaching. They can be story, behind-the-scenes, transformation, opinion, trend, showcase, whatever performs.
- Each topic phrase must be something a real Instagram search would return creators for. Short, 2 to 5 words. Plain phrases, NOT hashtags.
- Map to where the BUYER pays attention. For B2B, topics are what the buyer-audience watches.

Return ONLY valid JSON, no preamble, no fences, no em dashes:
{ "pillars": [ { "name": "short pillar name", "why": "one short phrase", "topics": ["phrase","phrase","phrase"] } ] }

RULES:
1. Produce 5 to 7 pillars.
2. Across all pillars, produce ${TOPICS_TARGET} topics total.
3. Topics must be distinct.
4. No hashtags, no "#", no @handles.
5. No em dashes.`;

async function generatePillarsAndTopics(bd: string, niche: string, who: string, keys: string[], angles: string[]): Promise<Topic[]> {
  const userMessage = `Business description:\n"""\n${bd}\n"""\n\nNiche: ${niche}\nWho they sell to: ${who}\nBuyer persona keywords: ${keys.join(", ")}\nReel angle hints: ${angles.join("; ") || "(none)"}\n\nDetect this niche's real content pillars and return ${TOPICS_TARGET} searchable topics labeled by pillar. JSON now.`;
  const r = await client.messages.create({ model: SONNET_MODEL, max_tokens: 1200, temperature: 0.3, system: PILLAR_TOPIC_SYSTEM, messages: [{ role: "user", content: userMessage }] });
  const raw = stripCodeFences(firstTextBlock(r.content));
  const parsed = JSON.parse(raw) as { pillars?: Array<{ name?: string; topics?: string[] }> };
  const topics: Topic[] = [];
  for (const p of parsed.pillars ?? []) {
    const name = (p.name ?? "Unlabeled").trim();
    for (const ph of p.topics ?? []) { const c = String(ph).replace(/[#@]/g, "").trim(); if (c) topics.push({ pillar: name, phrase: c }); }
  }
  return topics;
}
const PEER_SCORE_SYSTEM = `You are SpyReels' peer-creator filter. We searched Instagram topics for a user's niche and found creators. Some are genuine PEERS in the niche (a creator the user could learn from and remake). Others are KEYWORD COLLISIONS: their reel matched a search word but they are NOT in the niche (e.g. a travel blogger who said "laundry", a website-builder ad showing a laundrette, a generic home-goods reviewer).

For each creator decide: genuine peer in the user's niche/audience space, or keyword collision? Judge from username, display name, the SEARCH TOPIC that surfaced them, and caption. A creator surfaced by a niche-specific search (e.g. "laundromat passive income") whose VIDEO matched that query is very likely a genuine peer even if the caption is just hashtags or empty; when the caption is thin, weight the search topic heavily and lean KEEP. Be strict: if clearly about a DIFFERENT topic and only coincidentally used the word, keep=false.

Return ONLY valid JSON, no preamble, no fences, no em dashes:
{ "verdicts": [ { "username": "exact username", "keep": true, "reason": "short phrase" } ] }
Return a verdict for EVERY username given.`;

interface PeerVerdict { username: string; keep: boolean; reason: string; }
async function peerScoreBatch(bd: string, niche: string, who: string, batch: ScoredReel[]): Promise<PeerVerdict[]> {
  const lines = batch.map((c) => `- username: @${c.username}\n  name: ${c.fullName || "(unknown)"}\n  found via Instagram search: "${c.foundVia.phrase}" (pillar: ${c.foundVia.pillar})\n  caption: ${c.caption.replace(/\s+/g, " ").trim().slice(0, 200) || "(no caption, judge mainly from the search topic above)"}`).join("\n\n");
  const userMessage = `User's business:\n"""\n${bd}\n"""\nNiche: ${niche}\nBuyer: ${who}\n\nCreators to judge:\n${lines}\n\nReturn a keep/reason verdict for every username.`;
  try {
    const r = await client.messages.create({ model: HAIKU_MODEL, max_tokens: 1024, temperature: 0.1, system: PEER_SCORE_SYSTEM, messages: [{ role: "user", content: userMessage }] });
    const parsed = JSON.parse(stripCodeFences(firstTextBlock(r.content))) as { verdicts?: PeerVerdict[] };
    return parsed.verdicts ?? [];
  } catch (e) {
    console.log(`  ! peer-score batch failed (${(e as Error).message}); keeping all`);
    return batch.map((c) => ({ username: c.username, keep: true, reason: "fail-open" }));
  }
}
function scoreSearchReel(r: SearchReelData, foundVia: Topic): ScoredReel | null {
  const tier = classifyTier(r.viewCount, r.ownerFollowerCount, r.likeCount, r.commentCount, false);
  if (tier == null) return null;
  return { shortcode: r.shortcode, caption: r.caption || "", reelUrl: r.reelUrl, views: r.viewCount, likes: r.likeCount, comments: r.commentCount, username: r.ownerUsername, fullName: r.ownerFullName, followers: r.ownerFollowerCount, isPrivate: false, viralScore: computeViralScore(r.viewCount, r.ownerFollowerCount, r.likeCount, r.commentCount), tier, foundVia };
}
function collapseToCreators(reels: ScoredReel[]): ScoredReel[] {
  const best = new Map<string, ScoredReel>();
  for (const reel of reels) { const k = reel.username.toLowerCase(); const e = best.get(k); if (!e || reel.viralScore > e.viralScore) best.set(k, reel); }
  return Array.from(best.values());
}
async function main() {
  const bd = process.argv[2] || "I run a laundromat business and I want to grow my Instagram by posting reels about owning and operating laundromats.";
  console.log("=".repeat(78)); console.log("CREATOR-FIRST DISCOVER EXPERIMENT (v2: with peer-score)"); console.log("=".repeat(78)); console.log(`Business: ${bd}\n`);
  console.log("Step 1: routeNiche (Sonnet)...");
  const routed = await routeNiche({ businessDescription: bd });
  console.log(`  primary_niche: ${routed.primary_niche}`); console.log(`  who: ${routed.audience.who_they_sell_to}`); console.log(`  business_type: ${routed.business_type} confidence: ${routed.confidence}\n`);
  console.log("Step 2: niche-derived pillars + topics (Sonnet)...");
  const topics = await generatePillarsAndTopics(bd, routed.primary_niche, routed.audience.who_they_sell_to, routed.audience.audience_persona_keywords, routed.content_angles);
  const bp = new Map<string, string[]>();
  for (const t of topics) { if (!bp.has(t.pillar)) bp.set(t.pillar, []); bp.get(t.pillar)!.push(t.phrase); }
  for (const [p, phs] of bp) { console.log(`  [${p}]`); for (const ph of phs) console.log(`      - ${ph}`); }
  console.log(`  total topics: ${topics.length}\n`);
  console.log("Step 3: searchReelsByKeyword per topic...");
  const allScored: ScoredReel[] = []; let rawCount = 0, dt = 0, df = 0;
  for (const topic of topics) {
    let results: SearchReelData[] = [];
    try { results = await searchReelsByKeyword(topic.phrase, MAX_RESULTS_PER_TOPIC); } catch (e) { console.log(`  ! "${topic.phrase}" failed: ${(e as Error).message}`); continue; }
    rawCount += results.length; let kept = 0;
    for (const r of results) { const s = scoreSearchReel(r, topic); if (!s) { dt++; continue; } if (s.followers < CREATOR_MIN_FOLLOWERS) { df++; continue; } allScored.push(s); kept++; }
    console.log(`  [${topic.pillar}] "${topic.phrase}": ${results.length} raw -> ${kept} kept`);
  }
  console.log(`\n  raw: ${rawCount} | dropped tier: ${dt} | dropped <${CREATOR_MIN_FOLLOWERS}f: ${df} | kept: ${allScored.length}\n`);
  const creators = collapseToCreators(allScored);
  console.log(`Step 4: collapsed ${allScored.length} reels -> ${creators.length} unique creators\n`);
  console.log("Step 5: peer-score (Haiku)...");
  const vbu = new Map<string, PeerVerdict>();
  for (let i = 0; i < creators.length; i += PEER_SCORE_BATCH) {
    const batch = creators.slice(i, i + PEER_SCORE_BATCH);
    const vs = await peerScoreBatch(bd, routed.primary_niche, routed.audience.who_they_sell_to, batch);
    for (const v of vs) vbu.set(v.username.replace(/^@/, "").toLowerCase(), v);
  }
  for (const c of creators) { const v = vbu.get(c.username.toLowerCase()); c.peerKeep = v ? v.keep : true; c.peerReason = v ? v.reason : "no verdict (kept)"; }
  const kept = creators.filter((c) => c.peerKeep); const dropped = creators.filter((c) => !c.peerKeep);
  console.log(`  peer-score: ${creators.length} -> ${kept.length} kept, ${dropped.length} flagged\n`);
  kept.sort((a, b) => (a.tier !== b.tier ? a.tier - b.tier : b.viralScore - a.viralScore));
  const pc = (c: ScoredReel, i: number) => {
    console.log(`${String(i + 1).padStart(3)}. @${c.username.padEnd(24)} followers=${String(c.followers).padStart(9)} views=${String(c.views).padStart(10)} reach=${(c.views / c.followers).toFixed(1).padStart(6)}x score=${c.viralScore.toFixed(1).padStart(8)} T${c.tier}`);
    console.log(`     pillar:  [${c.foundVia.pillar}] via "${c.foundVia.phrase}"`);
    console.log(`     name:    ${c.fullName || "(none)"}`);
    console.log(`     peer:    ${c.peerKeep ? "KEEP" : "DROP"} - ${c.peerReason}`);
    console.log(`     caption: ${c.caption.replace(/\s+/g, " ").trim().slice(0, 110) || "(empty)"}`);
    console.log(`     url:     ${c.reelUrl}\n`);
  };
  console.log("=".repeat(78)); console.log(`RANKED PEERS (kept): ${kept.length}`); console.log("=".repeat(78));
  kept.forEach(pc);
  console.log("=".repeat(78)); console.log(`FLAGGED AS COLLISIONS (dropped): ${dropped.length}`); console.log("=".repeat(78));
  dropped.forEach(pc);
  console.log("=".repeat(78)); console.log("PILLAR DIAGNOSTICS (kept peers only)"); console.log("=".repeat(78));
  const ps = new Map<string, { count: number; avg: number; top: number }>();
  for (const c of kept) { const s = ps.get(c.foundVia.pillar) || { count: 0, avg: 0, top: 0 }; s.count++; s.avg += c.viralScore; s.top = Math.max(s.top, c.viralScore); ps.set(c.foundVia.pillar, s); }
  for (const [p, s] of ps) console.log(`  [${p}] peers=${s.count} avgScore=${(s.avg / s.count).toFixed(1)} topScore=${s.top.toFixed(1)}`);
  console.log("\nDone.");
}
main().catch((e) => { console.error("Experiment failed:", e); process.exit(1); });
