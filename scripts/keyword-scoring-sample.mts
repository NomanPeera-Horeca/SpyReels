/**
 * Revised sample: current scoring vs v2 (the PR's actual scoring code) on
 * three topics. Read-only DB login; 3 small AI calls for topic aliases and
 * relevance labels (same prompt as the PR). Prints rankings only.
 */
import Anthropic from "@anthropic-ai/sdk";
import mysql from "mysql2/promise";
import { classifyRelevance, parseRelevanceAnswer, topicTerms, type RelevanceLabel } from "./v2/relevance";
import { pickV2, platformMedian, scoreV2, type V2Input } from "./v2/keywordScoringV2";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });
const ai = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

function oldScore(k: { passed: number; found: number; viral: number; goodCreators: number; creatorsFound: number; runs: number; demand: number }): number {
  const passRate = (k.passed + 1) / (k.found + 3);
  const viralRate = (k.viral + 0.5) / (k.passed + 3);
  const creatorRate = (k.goodCreators + 0.5) / (k.creatorsFound + 3);
  const evidence = Math.min(1, k.runs / 3);
  const measured = passRate * 0.4 + viralRate * 0.4 + creatorRate * 0.2;
  return (1 - evidence) * (k.demand / 100) * 0.6 + evidence * measured + (k.demand / 100) * 0.15;
}
function oldPick<T extends { runs: number; demand: number }>(rows: T[], count: number, score: (r: T) => number): T[] {
  const tried = rows.filter(r => r.runs > 0).sort((a, b) => score(b) - score(a));
  const untried = rows.filter(r => r.runs === 0).sort((a, b) => b.demand - a.demand);
  const exploreSlots = untried.length > 0 ? Math.max(1, Math.round(count * 0.3)) : 0;
  const out = [...tried.slice(0, count - Math.min(exploreSlots, count)), ...untried.slice(0, exploreSlots)];
  for (const r of [...tried, ...untried]) { if (out.length >= count) break; if (!out.includes(r)) out.push(r); }
  return out.slice(0, count);
}

const topics = ["brain-rot-content-and-trends", "home-buying-tips", "shayari-and-poetry-content"];
const [medRows] = (await conn.query(`SELECT runs AS searches, passed FROM viral_keywords WHERE platform = 'tiktok' AND runs > 0`)) as unknown as [Array<{ searches: number; passed: number }>];
const median = platformMedian(medRows.map(r => ({ searches: Number(r.searches), passed: Number(r.passed) })));
console.log(`TIKTOK_MEDIAN_PASSED_PER_SEARCH ${median}`);

for (const slug of topics) {
  const [[t]] = (await conn.query(`SELECT label FROM viral_topics WHERE slug = ?`, [slug])) as unknown as [[{ label: string }]];
  const [rows] = (await conn.query(
    `SELECT k.id, k.phrase, k.demand, k.runs, k.found, k.passed, k.viral, k.creatorsFound, k.goodCreators, k.retired,
            v.volume AS googleVolume, (v.phrase IS NOT NULL) AS checked,
            EXISTS (SELECT 1 FROM viral_keywords x WHERE x.topicSlug = k.topicSlug AND x.phrase = k.phrase AND x.source = 'tiktok_autocomplete') AS tt
     FROM viral_keywords k LEFT JOIN viral_keyword_volumes v ON v.phrase = k.phrase AND v.source = 'google' AND v.location = 'US'
     WHERE k.topicSlug = ? AND k.platform = 'tiktok'`,
    [slug]
  )) as unknown as [Array<Record<string, unknown>>];
  const R = rows.map(r => ({
    id: Number(r.id), phrase: String(r.phrase), demand: Number(r.demand), runs: Number(r.runs), found: Number(r.found), passed: Number(r.passed),
    viral: Number(r.viral), creatorsFound: Number(r.creatorsFound), goodCreators: Number(r.goodCreators), retired: Number(r.retired),
    googleVolume: Number(r.checked) ? (r.googleVolume == null ? null : Number(r.googleVolume)) : null, tt: Boolean(Number(r.tt)),
  }));
  // Aliases + labels (same prompt as the PR's prepareKeywordRelevance).
  let aliases: string[] = [];
  let labels = new Map<number, RelevanceLabel>();
  if (ai) {
    const list = R.map((r, i) => `${i + 1}. ${r.phrase}`).join("\n");
    const res = await ai.messages.create({
      model: "claude-haiku-4-5-20251001", max_tokens: 1500, temperature: 0,
      system: "You judge whether short-video search phrases belong to a content topic. Return JSON only.",
      messages: [{ role: "user", content: `Topic: "${t.label}".
1. "aliases": up to 20 short terms people use for this topic or its core concepts (synonyms, spellings, hashtags as words, key sub-concepts). Lowercase.
2. "labels": for each numbered phrase, "R" if it is clearly about this topic, "I" if it is clearly about something unrelated (a place name alone, a different subject, a brand unrelated to the topic), otherwise "P" (plausible or unsure). When unsure, use "P".
Phrases:
${list}
Return {"aliases":[...],"labels":{"1":"R",...}}.` }],
    });
    const text = res.content.find(b => b.type === "text");
    const parsed = parseRelevanceAnswer(text && text.type === "text" ? text.text : "{}");
    aliases = parsed.aliases;
    labels = parsed.labels;
  }
  const terms = topicTerms(t.label, aliases);
  const inputs: V2Input[] = R.map((r, i) => ({
    id: r.id, phrase: r.phrase, demand: r.demand, searches: r.runs, found: r.found, passed: r.passed, googleVolume: r.googleVolume,
    tiktokSuggested: r.tt, label: classifyRelevance({ phrase: r.phrase, terms, aiLabel: labels.get(i + 1) ?? null }),
    recentPassed: r.runs > 0 ? [r.passed] : [], lastSearchedAt: r.runs > 0 ? new Date(Date.now() - 2 * 86_400_000) : null, firstSearchedAt: r.runs > 0 ? new Date(Date.now() - 2 * 86_400_000) : null,
  }));
  const scored = scoreV2(inputs, median);
  const oldOrder = [...R].filter(r => !r.retired).sort((a, b) => (b.runs > 0 ? oldScore(b) : b.demand / 100) - (a.runs > 0 ? oldScore(a) : a.demand / 100));
  const oldRank = new Map(oldOrder.map((r, i) => [r.id, i + 1]));
  const lanes = scored.reduce<Record<string, number>>((m, s) => ({ ...m, [s.lane]: (m[s.lane] ?? 0) + 1 }), {});
  const labelsCount = inputs.reduce<Record<string, number>>((m, s) => ({ ...m, [s.label]: (m[s.label] ?? 0) + 1 }), {});
  console.log(`\n=== ${t.label} | phrases ${R.length} | labels ${JSON.stringify(labelsCount)} | lanes ${JSON.stringify(lanes)}`);
  console.log(`aliases: ${aliases.slice(0, 20).join(", ")}`);
  const line = (s: (typeof scored)[number]) => `${s.phrase.slice(0, 40).padEnd(40)} | vol ${s.googleVolume == null ? "unknown" : s.googleVolume} | tt ${s.tiktokSuggested ? "y" : "n"} | ${s.label.padEnd(10)} | srch ${s.searches} pass ${s.passed}/${s.found} | R ${s.R.toFixed(2)} D ${s.D.toFixed(2)} P ${s.P.toFixed(2)} | score ${s.score.toFixed(3)} | old rank ${oldRank.get(s.id) ?? "retired"}`;
  for (const lane of ["exploit", "explore"] as const) {
    console.log(`--- ${lane} lane (top 8)`);
    scored.filter(s => s.lane === lane).sort((a, b) => b.score - a.score).slice(0, 8).forEach((s, i) => console.log(`${String(i + 1).padStart(2)} ${line(s)}`));
  }
  console.log("--- blocked (all)");
  scored.filter(s => s.lane === "blocked").forEach(s => console.log(`   ${line(s)}`));
  const oldFive = oldPick(R.filter(r => !r.retired), 5, oldScore).map(r => r.phrase);
  const newFive = pickV2(scored, 5).map(p => `${p.phrase} [${p.pickedLane}]`);
  console.log(`--- a 5-phrase TikTok search picks\n  current: ${oldFive.join(" | ")}\n  v2:      ${newFive.join(" | ")}`);
}
await conn.end();
