/**
 * Phrase relevance for keyword scoring v2: is a search phrase about its topic?
 *
 * Three labels, never a hard word-overlap gate:
 * - relevant: the phrase contains a topic term (the topic's own words, an
 *   alias, or a concept term), after normalization;
 * - plausible: no term matched and nothing says it is unrelated. Stays
 *   eligible (exploration lane) so the search results can decide;
 * - disputed: the AI said unrelated, but the phrase is a hashtag of this
 *   topic's own viral videos (niche jargon the AI may not know, e.g.
 *   "tungtungtungsahur" for brain rot). Eligible with a low prior;
 * - irrelevant: the AI said clearly unrelated and nothing from the topic's
 *   own videos backs it (for example a bare place name). Only this label
 *   blocks a phrase before it has been searched, and real on-topic results
 *   can still lift it over the gate.
 *
 * Normalization handles hashtag-style text: "#BrainRot", "brainrot" and
 * "brain rot" match; plurals fold ("ideas" ~ "idea"); camelCase splits.
 *
 * Topic terms (viral_topic_terms) and AI labels (viral_keyword_relevance) are
 * prepared by prepareKeywordRelevance, which only runs when scoring v2 or the
 * experiment is switched on (or KEYWORD_RELEVANCE_PREP=on). Without them the
 * classification falls back to the topic's own words: matched = relevant,
 * everything else plausible (never blocked).
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type RelevanceLabel = "relevant" | "plausible" | "disputed" | "irrelevant";

const STOP = new Set(
  "a an and are as at be by for from how i in is it my of on or that the this to what why with you your vs".split(" ")
);

/** Lowercase tokens: hashtags and camelCase split, punctuation dropped, plurals folded. Pure; exported for tests. */
export function normalizeTokens(text: string): string[] {
  return text
    .replace(/#/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w))
    .map(w => (w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** A term as tokens plus its joined form ("brain rot" -> "brainrot"). Pure; exported for tests. */
export function termForms(term: string): { tokens: string[]; joined: string } {
  const tokens = normalizeTokens(term);
  return { tokens, joined: tokens.join("") };
}

/**
 * True when the phrase contains the term: all of the term's tokens appear in
 * the phrase, or the term's joined form appears inside the phrase's joined
 * form or one of its tokens (hashtags like "brainrotmemes"). Pure; exported for tests.
 */
export function phraseHasTerm(phrase: string, term: string): boolean {
  const t = termForms(term);
  if (t.tokens.length === 0) return false;
  const p = normalizeTokens(phrase);
  const pset = new Set(p);
  if (t.tokens.every(w => pset.has(w))) return true;
  if (t.joined.length < 4) return false;
  return p.join("").includes(t.joined) || p.some(w => w.includes(t.joined));
}

/** Label one phrase from topic terms, an optional AI label and its provenance. Pure; exported for tests. */
export function classifyRelevance(args: {
  phrase: string;
  terms: string[];
  aiLabel?: RelevanceLabel | null;
  /** The phrase is a hashtag of this topic's own viral videos. */
  fromTopicVideos?: boolean;
}): RelevanceLabel {
  if (args.terms.some(term => phraseHasTerm(args.phrase, term))) return "relevant";
  if (args.aiLabel === "irrelevant") return args.fromTopicVideos ? "disputed" : "irrelevant";
  if (args.aiLabel === "relevant") return "relevant";
  return "plausible";
}

/**
 * Terms for a topic: its label, adjacent word pairs of the label ("home
 * buying tips" -> "home buying", "buying tip"), single words only for short
 * labels (1-2 content words, not generic), and stored aliases/concepts. Lone
 * words of long labels ("buying") are left to the aliases, so "buying a car"
 * does not match home buying. Pure; exported for tests.
 */
export function topicTerms(label: string, stored: string[]): string[] {
  const words = normalizeTokens(label);
  const pairs = words
    .slice(1)
    .map((w, i) => [words[i], w])
    .filter(pair => pair.every(w => !GENERIC.has(w)))
    .map(pair => pair.join(" "));
  const singles = words.length <= 2 ? words.filter(w => !GENERIC.has(w)) : [];
  return [...new Set([label, ...pairs, ...singles, ...stored].map(t => t.trim().toLowerCase()).filter(Boolean))];
}

/** Words too generic to count as a topic on their own. */
const GENERIC = new Set(["tip", "idea", "content", "trend", "video", "guide", "hack", "basic", "strategy", "strategie", "best", "how", "life"]);

/* ---------- preparation (AI; only when v2 / experiment is on) ---------- */

export function relevancePrepEnabled(): boolean {
  const mode = (process.env.KEYWORD_SCORING ?? "current").trim();
  return mode === "v2" || process.env.KEYWORD_RELEVANCE_PREP === "on" || process.env.KEYWORD_EXPERIMENT_RUNNER === "on";
}

let tablesReady: { ok: boolean; at: number } | null = null;
export async function isScoringV2Ready(db: Db): Promise<boolean> {
  if (tablesReady && (tablesReady.ok || Date.now() - tablesReady.at < 600_000)) return tablesReady.ok;
  try {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('viral_topic_terms','viral_keyword_relevance','viral_keyword_searches','viral_keyword_experiments','viral_keyword_experiment_stats')`
    )) as unknown as [Array<{ n: number | string }>];
    tablesReady = { ok: Number(rows?.[0]?.n ?? 0) === 5, at: Date.now() };
  } catch {
    tablesReady = { ok: false, at: Date.now() };
  }
  return tablesReady.ok;
}

type AiResult = { aliases: string[]; labels: Map<number, RelevanceLabel> };

/** Parse the AI answer {"aliases":[...], "labels":{"1":"R"|"P"|"I"}}. Pure; exported for tests. */
export function parseRelevanceAnswer(text: string): AiResult {
  try {
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as { aliases?: unknown; labels?: unknown };
    const aliases = Array.isArray(parsed.aliases)
      ? parsed.aliases.filter((a): a is string => typeof a === "string" && a.trim().length > 1 && a.length <= 60).slice(0, 25)
      : [];
    const labels = new Map<number, RelevanceLabel>();
    if (parsed.labels && typeof parsed.labels === "object") {
      for (const [k, v] of Object.entries(parsed.labels as Record<string, unknown>)) {
        const n = Number(k);
        const label = v === "R" ? "relevant" : v === "I" ? "irrelevant" : v === "P" ? "plausible" : null;
        if (Number.isInteger(n) && label) labels.set(n, label);
      }
    }
    return { aliases, labels };
  } catch {
    return { aliases: [], labels: new Map() };
  }
}

async function askAi(topic: string, phrases: string[]): Promise<AiResult> {
  const { createClaudeClient } = await import("../_core/claudeClient");
  const { SEMANTIC_POOL_MODEL } = await import("./semanticPoolRelevance");
  const { reportDirectAnthropicUsage } = await import("../_core/llmMeasured");
  const client = createClaudeClient({ apiKey: process.env.ANTHROPIC_API_KEY });
  const list = phrases.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const res = await client.messages.create({
    model: SEMANTIC_POOL_MODEL,
    max_tokens: 1500,
    temperature: 0,
    system: "You judge whether short-video search phrases belong to a content topic. Return JSON only.",
    messages: [
      {
        role: "user",
        content: `Topic: "${topic}".
1. "aliases": up to 20 short terms people use for this topic or its core concepts (synonyms, spellings, hashtags as words, key sub-concepts). Lowercase.
2. "labels": for each numbered phrase, "R" if it is clearly about this topic, "I" if it is clearly about something unrelated (a place name alone, a different subject, a brand unrelated to the topic), otherwise "P" (plausible or unsure). When unsure, use "P".
Phrases:
${list}
Return {"aliases":[...],"labels":{"1":"R",...}}.`,
      },
    ],
  });
  reportDirectAnthropicUsage(res, "keyword_relevance_labels");
  const text = res.content.find(b => b.type === "text");
  return parseRelevanceAnswer(text && text.type === "text" ? text.text : "{}");
}

/**
 * Prepare relevance for up to `maxTopics` topics that have unlabeled phrases:
 * one AI call per topic (up to 150 phrases), store aliases and labels.
 * Only when enabled (see relevancePrepEnabled). Never throws.
 */
export async function prepareKeywordRelevance(args: { maxTopics?: number; topicSlugs?: string[] } = {}): Promise<{ topics: number; labeled: number }> {
  const out = { topics: 0, labeled: 0 };
  if (!relevancePrepEnabled() || !process.env.ANTHROPIC_API_KEY?.trim()) return out;
  const db = await getDb();
  if (!db || !(await isScoringV2Ready(db))) return out;
  try {
    const only = args.topicSlugs?.length ? sql`AND k.topicSlug IN (${sql.join(args.topicSlugs.map(s => sql`${s}`), sql`, `)})` : sql``;
    const [due] = (await db.execute(sql`
      SELECT k.topicSlug AS slug, t.label AS label, COUNT(*) AS n
      FROM viral_keywords k
      JOIN viral_topics t ON t.slug = k.topicSlug
      LEFT JOIN viral_keyword_relevance r ON r.keywordId = k.id
      WHERE r.keywordId IS NULL ${only}
      GROUP BY k.topicSlug, t.label
      ORDER BY n DESC
      LIMIT ${Math.max(1, Math.min(10, args.maxTopics ?? 2))}
    `)) as unknown as [Array<{ slug: string; label: string }>];
    for (const topic of due ?? []) {
      const [rows] = (await db.execute(sql`
        SELECT MIN(k.id) AS id, k.phrase AS phrase, MAX(k.source = 'viral_hashtag') AS fromTopicVideos
        FROM viral_keywords k LEFT JOIN viral_keyword_relevance r ON r.keywordId = k.id
        WHERE k.topicSlug = ${topic.slug} AND r.keywordId IS NULL
        GROUP BY k.phrase
        LIMIT 150
      `)) as unknown as [Array<{ id: number; phrase: string; fromTopicVideos: number }>];
      if (!rows?.length) continue;
      const ai = await askAi(topic.label, rows.map(r => r.phrase));
      for (const alias of ai.aliases) {
        await db.execute(sql`
          INSERT IGNORE INTO viral_topic_terms (topicSlug, term, kind, source)
          VALUES (${topic.slug}, ${alias.toLowerCase().slice(0, 80)}, 'alias', 'ai')
        `);
      }
      const terms = topicTerms(topic.label, ai.aliases);
      for (const [i, row] of rows.entries()) {
        const label = classifyRelevance({ phrase: row.phrase, terms, aiLabel: ai.labels.get(i + 1) ?? null, fromTopicVideos: Number(row.fromTopicVideos) === 1 });
        // The label applies to the phrase on every platform.
        await db.execute(sql`
          INSERT INTO viral_keyword_relevance (keywordId, label, source)
          SELECT id, ${label}, ${ai.labels.has(i + 1) ? "ai" : "terms"} FROM viral_keywords WHERE topicSlug = ${topic.slug} AND phrase = ${row.phrase}
          ON DUPLICATE KEY UPDATE label = VALUES(label), source = VALUES(source), checkedAt = NOW()
        `);
        out.labeled += 1;
      }
      out.topics += 1;
    }
    if (out.topics > 0) console.info("[viralLibrary] keyword_relevance_prepared", out);
  } catch (err) {
    console.warn("[viralLibrary] keyword_relevance_failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return out;
}

/** Stored aliases/concepts for a topic. [] when none or before the migration. */
export async function storedTopicTerms(db: Db, topicSlug: string): Promise<string[]> {
  try {
    const [rows] = (await db.execute(sql`SELECT term FROM viral_topic_terms WHERE topicSlug = ${topicSlug}`)) as unknown as [Array<{ term: string }>];
    return (rows ?? []).map(r => r.term);
  } catch {
    return [];
  }
}
