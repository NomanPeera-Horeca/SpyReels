/**
 * Home "what to post" ideas from the keyword bank (Phase 2): phrases people
 * really search (Google and YouTube autocomplete, viral hashtags) in the
 * profile's own topics, best first.
 *
 * Ranking: demand (how high the phrase ranks in autocomplete) plus proof
 * from our own searches (the phrase found viral videos). The same phrase is
 * stored once per platform, so rows are merged per phrase. At most two ideas
 * per topic so one topic does not fill Home.
 *
 * Read only: no provider calls, no AI calls. Returns [] before migration
 * 0111 or when the profile has no matched topics yet.
 */
import { and, eq, inArray } from "drizzle-orm";
import { viralKeywords, viralProfileTopics, viralTopics } from "../../drizzle/viralLibrarySchema";
import { getDb } from "../db";
import { isKeywordsReady } from "./keywords";

export type SearchIdea = {
  phrase: string;
  /** Display title: the phrase with a capital first letter. */
  title: string;
  topicLabel: string;
  demand: number;
  /** Viral videos our searches found with this phrase (all platforms). */
  viralFound: number;
};

type Row = {
  phrase: string;
  topicSlug: string;
  demand: number;
  viral: number;
  runs: number;
  retired: number;
};

/** Higher is better: demand first, then proof it found viral videos. Pure; exported for tests. */
export function searchIdeaScore(i: { demand: number; viralFound: number }): number {
  return i.demand + Math.min(30, Math.log2(1 + i.viralFound) * 10);
}

/** A phrase worth showing as a video idea: 2 to 7 words, not just the topic name. Pure; exported for tests. */
export function isIdeaPhrase(phrase: string, topicLabel: string): boolean {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 7) return false;
  return phrase.trim().toLowerCase() !== topicLabel.trim().toLowerCase();
}

/** Merge per-platform rows, rank, keep at most `perTopic` per topic. Pure; exported for tests. */
export function rankSearchIdeas(
  rows: Row[],
  labelOf: Map<string, string>,
  limit: number,
  perTopic = 2
): SearchIdea[] {
  const byPhrase = new Map<string, SearchIdea & { topicSlug: string }>();
  for (const r of rows) {
    if (r.retired) continue;
    const topicLabel = labelOf.get(r.topicSlug) ?? "";
    if (!isIdeaPhrase(r.phrase, topicLabel)) continue;
    const prev = byPhrase.get(r.phrase);
    if (prev) {
      prev.demand = Math.max(prev.demand, r.demand);
      prev.viralFound += r.viral;
      continue;
    }
    byPhrase.set(r.phrase, {
      phrase: r.phrase,
      title: r.phrase.charAt(0).toUpperCase() + r.phrase.slice(1),
      topicLabel,
      topicSlug: r.topicSlug,
      demand: r.demand,
      viralFound: r.viral,
    });
  }
  const perTopicCount = new Map<string, number>();
  const out: SearchIdea[] = [];
  for (const idea of [...byPhrase.values()].sort((a, b) => searchIdeaScore(b) - searchIdeaScore(a))) {
    if (out.length >= limit) break;
    const n = perTopicCount.get(idea.topicSlug) ?? 0;
    if (n >= perTopic) continue;
    perTopicCount.set(idea.topicSlug, n + 1);
    const { topicSlug: _drop, ...rest } = idea;
    out.push(rest);
  }
  return out;
}

export async function searchIdeasForProfile(args: { socialProfileId: string | null; limit: number }): Promise<SearchIdea[]> {
  if (!args.socialProfileId) return [];
  try {
    const db = await getDb();
    if (!db || !(await isKeywordsReady(db))) return [];
    const topics = await db
      .select({ slug: viralProfileTopics.topicSlug, label: viralTopics.label })
      .from(viralProfileTopics)
      .innerJoin(viralTopics, eq(viralTopics.slug, viralProfileTopics.topicSlug))
      .where(eq(viralProfileTopics.socialProfileId, args.socialProfileId));
    if (topics.length === 0) return [];
    const rows = await db
      .select({
        phrase: viralKeywords.phrase,
        topicSlug: viralKeywords.topicSlug,
        demand: viralKeywords.demand,
        viral: viralKeywords.viral,
        runs: viralKeywords.runs,
        retired: viralKeywords.retired,
      })
      .from(viralKeywords)
      .where(and(inArray(viralKeywords.topicSlug, topics.map(t => t.slug)), eq(viralKeywords.retired, 0)))
      .limit(2000);
    return rankSearchIdeas(rows as Row[], new Map(topics.map(t => [t.slug, t.label])), args.limit);
  } catch (err) {
    console.warn("[home] search_ideas_failed", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}
