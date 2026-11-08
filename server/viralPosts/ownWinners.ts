/**
 * "Your winners": what already worked for the creator, on each of their own
 * accounts (OWN_WINNERS=on; off by default).
 *
 * 1. Research: the creator's own handles (every profile they added) are queued
 *    for the normal background research (prefetch). Finished research is copied
 *    into the shared library, where each video gets a verdict against the
 *    creator's OWN usual views, and viral/rising ones get topics and a summary
 *    from video understanding (about 1 cent each). No new provider calls here.
 * 2. Winners: the creator's own videos that did clearly better than their
 *    usual (multiple >= WINNER_MIN_MULTIPLE), best first.
 * 3. Use: their topics join the profile's topics and their summaries join the
 *    profile text, so Home leans to what already works for this creator; the
 *    top ones become "make a follow-up" ideas.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { requestPrefetch } from "../research/prefetch";
import { libraryHandle } from "./library";
import type { RelevanceProfile } from "./relevanceRanking";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function ownWinnersEnabled(): boolean {
  return process.env.OWN_WINNERS === "on";
}

/** "Clearly better than their usual": the same bar as "rising" in shared/viralRule. */
export const WINNER_MIN_MULTIPLE = 1.5;
/** Creators who used SpyReels in this many days get their own accounts researched. */
const ACTIVE_DAYS = 14;

export type OwnWinner = {
  candidateId: number;
  platform: string;
  text: string;
  summary: string | null;
  multiple: number;
  views: number | null;
  topicSlugs: string[];
};

/** Platform + handle of these profiles. */
export async function profileHandles(
  db: Db,
  socialProfileIds: string[]
): Promise<Array<{ platform: string; handle: string }>> {
  if (socialProfileIds.length === 0) return [];
  const [rows] = (await db.execute(sql`
    SELECT platform, normalizedHandle AS handle FROM social_profiles
    WHERE id IN (${sql.join(socialProfileIds.map(id => sql`${id}`), sql`, `)})
      AND deletedAt IS NULL AND platform IS NOT NULL AND normalizedHandle IS NOT NULL
  `)) as unknown as [Array<{ platform: string; handle: string }>];
  return (rows ?? []).map(r => ({ platform: String(r.platform), handle: String(r.handle) }));
}

/** First line of a caption or hook, for display and ideas. Pure; exported for tests. */
export function winnerText(hook: string | null, caption: string | null): string {
  const raw = (hook?.trim() || caption?.trim() || "").replace(/\s+/g, " ");
  const firstSentence = raw.split(/(?<=[.!?])\s/)[0] ?? raw;
  return firstSentence.slice(0, 120).trim();
}

/** The creator's own best videos across these accounts, best first. */
export async function loadOwnWinners(
  db: Db,
  accounts: Array<{ platform: string; handle: string }>,
  limit = 8
): Promise<OwnWinner[]> {
  const keys = accounts
    .map(a => ({ platform: a.platform, handle: libraryHandle(a.handle) }))
    .filter((a): a is { platform: string; handle: string } => !!a.handle);
  if (keys.length === 0) return [];
  const match = sql.join(
    keys.map(k => sql`(c.platform = ${k.platform} AND LOWER(TRIM(LEADING '@' FROM c.creatorHandle)) = ${k.handle})`),
    sql` OR `
  );
  const [rows] = (await db.execute(sql`
    SELECT c.id AS id, c.platform AS platform, c.caption AS caption, s.multiple AS multiple,
           s.views AS views, i.summary AS summary,
           (SELECT GROUP_CONCAT(t.topicSlug) FROM viral_video_topics t WHERE t.candidateId = c.id) AS topics
    FROM viral_post_candidates c
    JOIN viral_library_status s ON s.candidateId = c.id
    LEFT JOIN viral_video_insights i ON i.candidateId = c.id AND i.status = 'done'
    WHERE (${match}) AND s.multiple >= ${WINNER_MIN_MULTIPLE}
    ORDER BY s.multiple DESC
    LIMIT ${Math.max(1, Math.min(20, limit))}
  `)) as unknown as [
    Array<{ id: number; platform: string; caption: string | null; multiple: unknown; views: unknown; summary: string | null; topics: string | null }>,
  ];
  return (rows ?? []).map(r => ({
    candidateId: Number(r.id),
    platform: String(r.platform),
    text: winnerText(null, r.caption),
    summary: r.summary ? String(r.summary) : null,
    multiple: Number(r.multiple),
    views: r.views == null ? null : Number(r.views),
    topicSlugs: r.topics ? String(r.topics).split(",").filter(Boolean) : [],
  }));
}

/**
 * Worker step: queue the own accounts of recently active creators for
 * background research. Accounts researched in the last 14 days are skipped by
 * the prefetch queue itself, so this is cheap to call often.
 */
export async function queueOwnAccountResearch(): Promise<number> {
  if (!ownWinnersEnabled()) return 0;
  const db = await getDb();
  if (!db) return 0;
  try {
    const [rows] = (await db.execute(sql`
      SELECT DISTINCT sp.platform AS platform, sp.normalizedHandle AS handle
      FROM social_profiles sp
      JOIN workspace_member_active_profiles a ON a.workspaceId = sp.workspaceId
      JOIN users u ON u.id = a.userId
      WHERE u.lastActiveAt >= (NOW() - INTERVAL ${ACTIVE_DAYS} DAY)
        AND sp.deletedAt IS NULL AND sp.platform IS NOT NULL AND sp.normalizedHandle IS NOT NULL
      LIMIT 500
    `)) as unknown as [Array<{ platform: string; handle: string }>];
    const targets = (rows ?? []).map(r => ({ platform: String(r.platform), handle: String(r.handle) }));
    await requestPrefetch(targets);
    return targets.length;
  } catch (err) {
    console.warn("[viralLibrary] own_research_queue_failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

/** Winner summaries added to the profile text (keeps the active strategy first). */
const MAX_WINNER_LINES = 5;

/**
 * The profile plus the creator's winners: their topics count as the creator's
 * topics, and what they were about joins the profile text that the ranking
 * embeds. Niche, pillars and audience stay as confirmed. Pure; exported for tests.
 */
export function withOwnWinners(profile: RelevanceProfile, winners: OwnWinner[]): RelevanceProfile {
  if (winners.length === 0) return profile;
  const lines = winners
    .map(w => w.summary || w.text)
    .filter(Boolean)
    .slice(0, MAX_WINNER_LINES)
    .map(t => `Worked for me: ${t}`);
  return {
    ...profile,
    subtopics: [...profile.subtopics, ...lines],
    topicSlugs: new Set([...profile.topicSlugs, ...winners.flatMap(w => w.topicSlugs)]),
    embedding: null,
  };
}
