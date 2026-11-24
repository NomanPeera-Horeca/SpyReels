/**
 * Library video search: scoring rules (pure, no I/O).
 *
 * Works like YouTube / TikTok / Instagram search (researched 2026-11-24):
 *   1. RELEVANCE decides what is on the list. Each video is searched by what
 *      it really is: the words spoken in it (transcript), the AI summary and
 *      topics from watching it, its caption/title and hashtags, the creator.
 *      Two kinds of match, combined:
 *        - word match: the user's words appear (the whole phrase scores most);
 *        - meaning match: close ideas ("kitchen tips" ~ "cooking hacks"),
 *          from the stored meaning fingerprint (embedding).
 *   2. PERFORMANCE decides the order among good matches: how viral (views vs
 *      the creator's usual) and how many views. An off-topic viral video
 *      never jumps above an on-topic one.
 *   3. Variety: at most MAX_PER_CREATOR videos per creator in a row of results.
 */

export type SearchField = "caption" | "hashtags" | "spoken" | "summary" | "topics" | "creator";

export const FIELD_WEIGHTS: Record<SearchField, number> = {
  caption: 3,
  spoken: 2.5,
  summary: 2.5,
  hashtags: 2,
  topics: 1.5,
  creator: 1,
};

export const FIELD_LABELS: Record<SearchField, string> = {
  caption: "caption",
  spoken: "said in the video",
  summary: "what the video shows",
  hashtags: "hashtags",
  topics: "topic",
  creator: "creator",
};

export type SearchDoc = {
  id: number;
  platform: string;
  url?: string;
  creatorHandle: string;
  fields: Partial<Record<SearchField, string>>;
  embedding: ArrayLike<number> | null;
  views: number;
  /** Views vs the creator's usual (2 = twice their usual); null when unknown. */
  multiple: number | null;
  /** viral | rising | normal | unknown */
  status: string;
  publishedAt: number | null;
};

export type SearchSort = "best" | "viral" | "views" | "newest";

export type ScoredDoc = {
  doc: SearchDoc;
  /** 0..1: how well it matches what was typed. */
  relevance: number;
  /** strong = clearly about the query; partial = some of it; meaning = close idea only. */
  tier: "strong" | "partial" | "meaning";
  wordScore: number;
  meaningScore: number;
  /** Fields where the query words were found, best first. */
  matchedIn: SearchField[];
  phrase: boolean;
  performance: number;
};

const STOPWORDS = new Set(
  "a an the and or of to in on for with my your our is are be how what why at by from it this that do i".split(" ")
);

/** Light English stemming so "tips"~"tip", "cooking"~"cook", "recipes"~"recipe". Pure. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith("es") && /(ch|sh|x|ss)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  return w;
}

/** Lower-case words without punctuation, hashtags split ("#kitchenTips" -> kitchen tips). Pure. */
export function words(text: string): string[] {
  return text
    .replace(/#([A-Za-z0-9_]+)/g, (_, tag: string) => ` ${tag.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")} `)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** The query's meaningful words, stemmed and de-duplicated. Pure. */
export function queryTerms(query: string): string[] {
  const all = words(query);
  const kept = all.filter(w => !STOPWORDS.has(w));
  return Array.from(new Set((kept.length > 0 ? kept : all).map(stem)));
}

/** Prepared text of one field: stemmed words + a joined string for phrase checks. */
export type PreparedField = { terms: Set<string>; joined: string };

export function prepareField(text: string): PreparedField {
  const w = words(text).map(stem);
  return { terms: new Set(w), joined: ` ${w.join(" ")} ` };
}

/**
 * Word-match score 0..1 over prepared fields: the share of query words found
 * (weighted by field), with a bonus when the whole phrase appears in order.
 * `idf` lets rare words count more than common ones. Pure.
 */
export function wordMatch(
  terms: string[],
  prepared: Partial<Record<SearchField, PreparedField>>,
  idf: (term: string) => number = () => 1
): { score: number; matchedIn: SearchField[]; phrase: boolean; allTerms: boolean } {
  if (terms.length === 0) return { score: 0, matchedIn: [], phrase: false, allTerms: false };
  const phrase = terms.length > 1 ? ` ${terms.join(" ")} ` : null;
  const totalIdf = terms.reduce((s, t) => s + idf(t), 0) || 1;
  const maxWeight = Math.max(...Object.values(FIELD_WEIGHTS));
  const found = new Set<string>();
  const fieldScores: Array<{ field: SearchField; score: number }> = [];
  let phraseHit = false;
  for (const field of Object.keys(prepared) as SearchField[]) {
    const p = prepared[field];
    if (!p) continue;
    let covered = 0;
    for (const t of terms) {
      if (p.terms.has(t)) {
        covered += idf(t);
        found.add(t);
      }
    }
    if (covered === 0) continue;
    const isPhrase = phrase !== null && p.joined.includes(phrase);
    if (isPhrase) phraseHit = true;
    const coverage = covered / totalIdf;
    fieldScores.push({ field, score: (FIELD_WEIGHTS[field] / maxWeight) * (coverage + (isPhrase ? 0.5 : 0)) });
  }
  if (fieldScores.length === 0) return { score: 0, matchedIn: [], phrase: false, allTerms: false };
  fieldScores.sort((a, b) => b.score - a.score);
  // Best field counts fully; other fields add a little (a match in several places is stronger).
  const raw = fieldScores[0].score + fieldScores.slice(1).reduce((s, f) => s + f.score * 0.15, 0);
  const allTerms = terms.every(t => found.has(t));
  const overallCoverage = terms.reduce((s, t) => s + (found.has(t) ? idf(t) : 0), 0) / totalIdf;
  return {
    score: Math.min(1, raw * 0.8 * (0.5 + 0.5 * overallCoverage)),
    matchedIn: fieldScores.map(f => f.field),
    phrase: phraseHit,
    allTerms,
  };
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Meaning-match 0..1 from cosine similarity (small embeddings: ~0.2 unrelated, ~0.6 same idea). Pure. */
export function meaningMatch(similarity: number): number {
  return Math.max(0, Math.min(1, (similarity - 0.25) / 0.4));
}

/** 0..1 performance: virality first, then views. Pure. */
export function performanceScore(doc: Pick<SearchDoc, "views" | "multiple" | "status">): number {
  const multiple = doc.multiple && doc.multiple > 0 ? Math.min(1, Math.log2(1 + doc.multiple) / Math.log2(1 + 20)) : 0;
  const views = doc.views > 0 ? Math.min(1, Math.log10(doc.views) / 7) : 0;
  const status = doc.status === "viral" ? 0.15 : doc.status === "rising" ? 0.08 : 0;
  return Math.min(1, multiple * 0.55 + views * 0.3 + status);
}

/** Thresholds: below these a video is not shown for the query. */
export const MIN_WORD_SCORE = 0.18;
export const MIN_MEANING_SCORE = 0.35;

/** Score one document for a query. Null when it does not match well enough. Pure. */
export function scoreDoc(args: {
  doc: SearchDoc;
  prepared: Partial<Record<SearchField, PreparedField>>;
  terms: string[];
  queryEmbedding: ArrayLike<number> | null;
  idf?: (term: string) => number;
}): ScoredDoc | null {
  const w = wordMatch(args.terms, args.prepared, args.idf);
  const meaning = args.queryEmbedding && args.doc.embedding ? meaningMatch(cosine(args.queryEmbedding, args.doc.embedding)) : 0;
  const wordOk = w.score >= MIN_WORD_SCORE;
  const meaningOk = meaning >= MIN_MEANING_SCORE;
  if (!wordOk && !meaningOk) return null;
  // Single-word queries matching only the creator name are too weak on their own.
  if (!meaningOk && w.matchedIn.length === 1 && w.matchedIn[0] === "creator") return null;
  const tier: ScoredDoc["tier"] = wordOk && (w.phrase || w.allTerms) ? "strong" : wordOk ? "partial" : "meaning";
  const relevance = Math.min(1, Math.max(w.score, meaning * 0.9) + Math.min(w.score, meaning) * 0.25);
  return {
    doc: args.doc,
    relevance,
    tier,
    wordScore: w.score,
    meaningScore: meaning,
    matchedIn: w.matchedIn,
    phrase: w.phrase,
    performance: performanceScore(args.doc),
  };
}

const TIER_RANK: Record<ScoredDoc["tier"], number> = { strong: 0, partial: 1, meaning: 2 };

/**
 * Order matches. "best": relevance tier first (strong, partial, meaning),
 * then within a tier mostly relevance with performance breaking near-ties.
 * Other sorts reorder the matches only (never add weak ones). Pure.
 */
export function orderMatches(matches: ScoredDoc[], sort: SearchSort): ScoredDoc[] {
  const list = [...matches];
  const best = (m: ScoredDoc) => m.relevance * 0.7 + m.performance * 0.3;
  if (sort === "best") {
    list.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || best(b) - best(a) || b.doc.views - a.doc.views);
  } else if (sort === "viral") {
    list.sort((a, b) => (b.doc.multiple ?? 0) - (a.doc.multiple ?? 0) || best(b) - best(a));
  } else if (sort === "views") {
    list.sort((a, b) => b.doc.views - a.doc.views || best(b) - best(a));
  } else {
    list.sort((a, b) => (b.doc.publishedAt ?? 0) - (a.doc.publishedAt ?? 0) || best(b) - best(a));
  }
  return list;
}

export const MAX_PER_CREATOR = 2;

/**
 * Variety: keep the order, but a creator's 3rd+ video moves behind every
 * other creator's videos (still shown, just later). Pure.
 */
export function diversify<T extends { doc: { platform: string; creatorHandle: string } }>(list: T[], maxPerCreator = MAX_PER_CREATOR): T[] {
  const seen = new Map<string, number>();
  const first: T[] = [];
  const later: T[] = [];
  for (const m of list) {
    const key = `${m.doc.platform}:${m.doc.creatorHandle.toLowerCase()}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (!m.doc.creatorHandle || n < maxPerCreator) first.push(m);
    else later.push(m);
  }
  return [...first, ...later];
}

/** Inverse document frequency from term counts: rare words count more. Pure. */
export function makeIdf(docFreq: Map<string, number>, totalDocs: number): (term: string) => number {
  return term => {
    const df = docFreq.get(term) ?? 0;
    return Math.log(1 + (totalDocs + 1) / (df + 1));
  };
}
