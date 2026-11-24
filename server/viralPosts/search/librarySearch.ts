/**
 * Library video search (engine). Rules live in ./scoring.ts.
 *
 * The index is every video in the shared library (viral_post_candidates),
 * each with what we know about it: transcript (shared_transcripts), AI
 * summary + meaning embedding (viral_video_insights), topics
 * (viral_video_topics), caption, hashtags, creator, views and how viral it
 * is (viral_library_status). Built in memory and refreshed every
 * INDEX_TTL_MS; a query costs one small embedding call (~$0.00002), or
 * nothing when OpenAI is unavailable (word matching still works).
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../db";
import { embedTexts } from "../embeddings";
import {
  diversify,
  makeIdf,
  orderMatches,
  prepareField,
  queryTerms,
  scoreDoc,
  type PreparedField,
  type ScoredDoc,
  type SearchDoc,
  type SearchField,
  type SearchSort,
} from "./scoring";

const INDEX_TTL_MS = 30 * 60_000;
/** Enough of what is said to cover the hook and main point, while keeping the index small. */
const TRANSCRIPT_CHARS = 1500;
const QUERY_CACHE_MS = 24 * 60 * 60_000;
export const SEARCH_PAGE_SIZE = 24;

type IndexedDoc = { doc: SearchDoc; prepared: Partial<Record<SearchField, PreparedField>> };
type SearchIndex = { docs: IndexedDoc[]; idf: (t: string) => number; builtAt: number };

let index: SearchIndex | null = null;
let building: Promise<SearchIndex | null> | null = null;
const queryEmbeddings = new Map<string, { at: number; vector: number[] | null }>();

export function resetLibrarySearchForTests(): void {
  index = null;
  building = null;
  queryEmbeddings.clear();
}

/** Stored as Float32Array (half the memory of plain numbers). */
function parseEmbedding(raw: unknown): Float32Array | null {
  if (!raw) return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) && v.length > 0 ? Float32Array.from(v as number[]) : null;
  } catch {
    return null;
  }
}

function hashtagsText(raw: unknown): string {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.map(t => `#${String(t).replace(/^#/, "")}`).join(" ") : "";
  } catch {
    return "";
  }
}

/** Build one searchable document from a library row. Pure; exported for tests. */
export function toIndexedDoc(r: Record<string, unknown>): IndexedDoc {
  const fields: Partial<Record<SearchField, string>> = {
    caption: String(r.caption ?? ""),
    hashtags: hashtagsText(r.hashtags),
    spoken: String(r.transcript ?? ""),
    summary: String(r.summary ?? ""),
    topics: String(r.topicLabels ?? ""),
    creator: `${String(r.creatorHandle ?? "")} ${String(r.creatorName ?? "")}`,
  };
  const prepared: Partial<Record<SearchField, PreparedField>> = {};
  for (const [k, v] of Object.entries(fields) as Array<[SearchField, string]>) {
    if (v.trim()) prepared[k] = prepareField(v);
  }
  const published = r.publishedAt ? new Date(String(r.publishedAt)).getTime() : NaN;
  return {
    doc: {
      id: Number(r.id),
      platform: String(r.platform ?? ""),
      url: String(r.sourceUrl ?? ""),
      creatorHandle: String(r.creatorHandle ?? r.creatorId ?? "").replace(/^@/, ""),
      fields,
      embedding: parseEmbedding(r.embedding),
      views: Number(r.views ?? 0) || 0,
      multiple: r.multiple != null ? Number(r.multiple) : null,
      status: String(r.status ?? "unknown"),
      publishedAt: Number.isNaN(published) ? null : published,
    },
    prepared,
  };
}

async function buildIndex(): Promise<SearchIndex | null> {
  const db = await getDb();
  if (!db) return null;
  const [rows] = (await db.execute(sql`
    SELECT c.id, c.platform, c.sourceUrl, c.caption, c.hashtags, c.creatorHandle, c.creatorId, c.creatorName,
           COALESCE(s.views, c.views) AS views, c.publishedAt,
           s.status, s.multiple,
           i.summary, i.embedding,
           SUBSTRING(t.transcript, 1, ${TRANSCRIPT_CHARS}) AS transcript,
           (SELECT GROUP_CONCAT(vt2.label SEPARATOR ' ')
              FROM viral_video_topics vt JOIN viral_topics vt2 ON vt2.slug = vt.topicSlug
             WHERE vt.candidateId = c.id) AS topicLabels
    FROM viral_post_candidates c
    LEFT JOIN viral_library_status s ON s.candidateId = c.id
    LEFT JOIN viral_video_insights i ON i.candidateId = c.id
    LEFT JOIN shared_transcripts t ON t.platform = c.platform AND t.sourceId = c.sourceId AND t.status = 'ok'
  `)) as unknown as [Array<Record<string, unknown>>];
  const docs = (rows ?? []).map(toIndexedDoc);
  const docFreq = new Map<string, number>();
  for (const d of docs) {
    const seen = new Set<string>();
    for (const p of Object.values(d.prepared)) for (const t of p!.terms) seen.add(t);
    for (const t of seen) docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
  return { docs, idf: makeIdf(docFreq, docs.length), builtAt: Date.now() };
}

async function getIndex(): Promise<SearchIndex | null> {
  if (index && Date.now() - index.builtAt < INDEX_TTL_MS) return index;
  if (!building) {
    building = buildIndex()
      .then(built => {
        if (built) index = built;
        return index;
      })
      .catch(err => {
        console.error("[librarySearch] index build failed", err instanceof Error ? err.message : err);
        return index;
      })
      .finally(() => {
        building = null;
      });
  }
  // Serve the previous index while a rebuild runs.
  return index ?? (await building);
}

async function embedQuery(query: string): Promise<number[] | null> {
  const key = query.trim().toLowerCase();
  const hit = queryEmbeddings.get(key);
  if (hit && Date.now() - hit.at < QUERY_CACHE_MS) return hit.vector;
  const vectors = await embedTexts([key]).catch(() => null);
  const vector = vectors?.[0] ?? null;
  queryEmbeddings.set(key, { at: Date.now(), vector });
  if (queryEmbeddings.size > 2000) queryEmbeddings.delete(queryEmbeddings.keys().next().value as string);
  return vector;
}

export type LibrarySearchResult = {
  matches: ScoredDoc[];
  total: number;
  nextCursor: number | null;
  /** True when the library has nothing more for this query (the page may then search the web). */
  exhausted: boolean;
  indexSize: number;
  usedMeaning: boolean;
};

export async function searchLibrary(args: {
  query: string;
  platform?: "instagram" | "tiktok" | "youtube" | null;
  sort?: SearchSort;
  cursor?: number;
  limit?: number;
}): Promise<LibrarySearchResult> {
  const terms = queryTerms(args.query);
  const limit = Math.min(Math.max(args.limit ?? SEARCH_PAGE_SIZE, 1), 100);
  const empty = { matches: [], total: 0, nextCursor: null, exhausted: true, indexSize: 0, usedMeaning: false };
  if (terms.length === 0) return empty;
  const [idx, queryEmbedding] = await Promise.all([getIndex(), embedQuery(args.query)]);
  if (!idx) return empty;
  const matches: ScoredDoc[] = [];
  for (const d of idx.docs) {
    if (args.platform && d.doc.platform !== args.platform) continue;
    const scored = scoreDoc({ doc: d.doc, prepared: d.prepared, terms, queryEmbedding, idf: idx.idf });
    if (scored) matches.push(scored);
  }
  const ordered = diversify(orderMatches(matches, args.sort ?? "best"));
  const start = Math.max(0, args.cursor ?? 0);
  const page = ordered.slice(start, start + limit);
  const next = start + limit < ordered.length ? start + limit : null;
  return {
    matches: page,
    total: ordered.length,
    nextCursor: next,
    exhausted: next === null,
    indexSize: idx.docs.length,
    usedMeaning: queryEmbedding !== null,
  };
}
