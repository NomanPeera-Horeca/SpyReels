/**
 * Loader for relevance-first Home ranking (Phase 1). Off unless
 * RELEVANCE_RANKING=on. Reads the creator's confirmed strategy (niche,
 * pillars, sub-topics, audience, goals, language), one cached profile
 * embedding (viral_profile_relevance, migration 0116; one OpenAI embedding
 * call when the strategy text changes) and the library's existing video
 * embeddings, then ranks with relevanceRanking.ts.
 * No provider (ScrapeCreators) calls and no AI calls besides that one
 * embedding. Never throws into the caller: null means "use the current Home".
 */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { EMBEDDING_MODEL, embedTexts } from "./embeddings";
import { combineProfilesEnabled, mergeRelevanceProfiles, siblingProfileIds } from "./combinedProfile";
import { rankForProfile, relevanceProfileText, type RankResult, type RelevanceProfile, type RelevanceVideo } from "./relevanceRanking";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * RELEVANCE_TIERS=on (off by default): direct matches only in the main set,
 * related inspiration after them and always marked, and Home shows the
 * ranker's videos ahead of the pool videos (which have no relevance check).
 */
export function relevanceTiersEnabled(): boolean {
  return process.env.RELEVANCE_TIERS === "on";
}

export function relevanceRankingEnabled(): boolean {
  return process.env.RELEVANCE_RANKING === "on";
}

/** Fixed salt: assignment must not change when the ranking version changes mid-trial. */
export const RELEVANCE_TRIAL_SALT = "relevance-trial-1";

/**
 * Which Home ranking a user gets. Pure given the env; exported for tests.
 *   RELEVANCE_RANKING unset/off -> everyone "old" (default)
 *   RELEVANCE_RANKING=on        -> everyone "new"
 *   RELEVANCE_RANKING=trial     -> users in RELEVANCE_TRIAL_USERS (comma-separated user ids) get "new"
 *                                  (safety stage); others get "new" when a stable hash of their id falls
 *                                  under RELEVANCE_TRIAL_PERCENT (0-100, default 0), else "old".
 * Assignment is random but persistent per user, and recomputable for the trial report.
 */
export function relevanceArmFor(userId: number | string, env: NodeJS.ProcessEnv = process.env): "old" | "new" {
  const mode = (env.RELEVANCE_RANKING ?? "").trim().toLowerCase();
  if (mode === "on") return "new";
  if (mode !== "trial") return "old";
  const id = String(userId);
  const allow = (env.RELEVANCE_TRIAL_USERS ?? "").split(",").map(x => x.trim()).filter(Boolean);
  if (allow.includes(id)) return "new";
  const pct = Math.max(0, Math.min(100, Number(env.RELEVANCE_TRIAL_PERCENT ?? 0) || 0));
  if (pct <= 0) return "old";
  return trialBucket(id) < pct ? "new" : "old";
}

/** Stable 0-99 bucket for a user id. Pure; exported for tests and the report. */
export function trialBucket(userId: number | string): number {
  return parseInt(createHash("sha256").update(`${RELEVANCE_TRIAL_SALT}|${userId}`).digest("hex").slice(0, 8), 16) % 100;
}

function parseJson(value: unknown): any {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

/** The creator's confirmed strategy as a relevance profile (embedding not filled). */
export async function loadRelevanceProfile(db: Db, socialProfileId: string): Promise<RelevanceProfile | null> {
  const [items] = (await db.execute(sql`
    SELECT kind, payload FROM personalization_items
    WHERE socialProfileId = ${socialProfileId} AND status = 'confirmed'
      AND kind IN ('niche', 'pillar', 'audience', 'goal', 'language')
  `)) as unknown as [Array<{ kind: string; payload: unknown }>];
  const rows = (items ?? []).map(r => ({ kind: r.kind, p: parseJson(r.payload) ?? {} }));
  const niche = rows.find(r => r.kind === "niche")?.p;
  if (!niche) return null;
  const [subs] = (await db.execute(sql`
    SELECT label FROM pillar_subtopics WHERE socialProfileId = ${socialProfileId} AND status <> 'dismissed' LIMIT 40
  `)) as unknown as [Array<{ label: string }>];
  const [topics] = (await db.execute(sql`
    SELECT topicSlug FROM viral_profile_topics WHERE socialProfileId = ${socialProfileId}
  `)) as unknown as [Array<{ topicSlug: string }>];
  return {
    id: socialProfileId,
    niche: String(niche.label ?? ""),
    category: niche.categoryLabel ? String(niche.categoryLabel) : null,
    pillars: rows.filter(r => r.kind === "pillar").map(r => [r.p.title, r.p.description].filter(Boolean).join(": ")),
    subtopics: (subs ?? []).map(s => s.label),
    audiences: rows
      .filter(r => r.kind === "audience" && r.p.who)
      .map(r => ({ who: String(r.p.who), outcome: r.p.outcome ? String(r.p.outcome) : undefined, problem: r.p.problem ? String(r.p.problem) : undefined })),
    goals: rows.filter(r => r.kind === "goal" && r.p.text).map(r => String(r.p.text)),
    languages: rows.filter(r => r.kind === "language" && r.p.code).map(r => String(r.p.code)),
    topicSlugs: new Set((topics ?? []).map(t => t.topicSlug)),
    embedding: null,
  };
}

/** Cached profile embedding; recomputed only when the profile text changes. */
export async function profileRelevanceEmbedding(db: Db, profile: RelevanceProfile): Promise<number[] | null> {
  const text = relevanceProfileText(profile);
  if (!text) return null;
  const hash = createHash("sha256").update(`${EMBEDDING_MODEL}|${text}`).digest("hex");
  const [rows] = (await db.execute(sql`
    SELECT textHash, embedding FROM viral_profile_relevance WHERE socialProfileId = ${profile.id} LIMIT 1
  `)) as unknown as [Array<{ textHash: string; embedding: unknown }>];
  const cached = rows?.[0];
  if (cached && cached.textHash === hash) {
    const e = parseJson(cached.embedding);
    if (Array.isArray(e)) return e as number[];
  }
  const fresh = await embedTexts([text]);
  const vector = fresh?.[0];
  if (!vector) return null;
  await db.execute(sql`
    INSERT INTO viral_profile_relevance (socialProfileId, textHash, embedding, embeddingModel)
    VALUES (${profile.id}, ${hash}, ${JSON.stringify(vector)}, ${EMBEDDING_MODEL})
    ON DUPLICATE KEY UPDATE textHash = VALUES(textHash), embedding = VALUES(embedding), embeddingModel = VALUES(embeddingModel)
  `);
  return vector;
}

const LIBRARY_CACHE_MS = 15 * 60_000;
let libraryCache: { at: number; videos: RelevanceVideo[] } | null = null;

export function resetRelevanceLibraryCacheForTests(): void {
  libraryCache = null;
}

/** Viral and rising library videos (last 365 days) with topics and embeddings, cached for 15 minutes. */
export async function loadRelevanceLibrary(db: Db): Promise<RelevanceVideo[]> {
  if (libraryCache && Date.now() - libraryCache.at < LIBRARY_CACHE_MS) return libraryCache.videos;
  const [rows] = (await db.execute(sql`
    SELECT c.id, c.platform, c.sourceUrl, c.caption, c.creatorHandle, c.creatorId, c.publishedAt,
           s.status, s.multiple, i.summary, i.format, i.embedding
    FROM viral_library_status s
    JOIN viral_post_candidates c ON c.id = s.candidateId
    LEFT JOIN viral_video_insights i ON i.candidateId = c.id
    WHERE s.status IN ('viral', 'rising') AND (c.publishedAt IS NULL OR c.publishedAt >= NOW() - INTERVAL 365 DAY)
  `)) as unknown as [Array<Record<string, any>>];
  const [tags] = (await db.execute(sql`SELECT candidateId, topicSlug FROM viral_video_topics`)) as unknown as [Array<{ candidateId: number; topicSlug: string }>];
  const topicsBy = new Map<number, string[]>();
  for (const t of tags ?? []) topicsBy.set(Number(t.candidateId), [...(topicsBy.get(Number(t.candidateId)) ?? []), t.topicSlug]);
  const videos: RelevanceVideo[] = (rows ?? []).map(r => {
    const e = parseJson(r.embedding);
    return {
      id: Number(r.id),
      platform: String(r.platform),
      url: String(r.sourceUrl ?? ""),
      caption: String(r.caption ?? ""),
      summary: r.summary ? String(r.summary) : null,
      format: r.format ? String(r.format) : null,
      topicSlugs: topicsBy.get(Number(r.id)) ?? [],
      status: String(r.status),
      multiple: r.multiple == null ? null : Number(r.multiple),
      publishedAt: r.publishedAt ? new Date(r.publishedAt) : null,
      creatorKey: `${r.platform}:${String(r.creatorHandle || r.creatorId || "").trim().replace(/^@+/, "").toLowerCase()}`,
      embedding: Array.isArray(e) ? Float32Array.from(e as number[]) : null,
    };
  });
  libraryCache = { at: Date.now(), videos };
  return videos;
}

/** Ranked library videos for one creator profile, or null (keep the current Home). */
export async function relevanceRankForProfile(args: { socialProfileId: string; limit: number; exclude?: ReadonlySet<number> }): Promise<(RankResult & { niche: string; pillars: string[] }) | null> {
  const db = await getDb();
  if (!db) return null;
  try {
    let profile = await loadRelevanceProfile(db, args.socialProfileId);
    if (!profile) return null;
    const siblings = combineProfilesEnabled() ? await siblingProfileIds(db, args.socialProfileId) : [];
    if (siblings.length) {
      // One picture of the creator: add what they confirmed on their other profiles.
      const others = (await Promise.all(siblings.map(id => loadRelevanceProfile(db, id)))).filter(
        (p): p is RelevanceProfile => p !== null
      );
      profile = mergeRelevanceProfiles(profile, others);
    }
    profile.embedding = await profileRelevanceEmbedding(db, profile);
    const library = await loadRelevanceLibrary(db);
    return {
      ...rankForProfile(profile, library, { limit: args.limit, exclude: args.exclude, tiers: relevanceTiersEnabled() }),
      niche: profile.niche,
      pillars: profile.pillars,
    };
  } catch (err) {
    console.warn("[viralLibrary] relevance_rank_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
