/**
 * "Your viral videos": the creator's own videos that already worked, shown as
 * an extra Home section to remake through the Content Prism (OWN_WINNERS=on;
 * off by default). It ADDS options; it never changes how the rest of Home is
 * ranked.
 *
 * 1. Research: a creator's own accounts go through the normal background
 *    research (prefetch, status "own"). A new account is read right away; after
 *    that an account that posted in the last 30 days is refreshed weekly, a
 *    quiet one monthly. Finished research is copied into the shared library,
 *    where each video gets a verdict against the creator's OWN usual views.
 * 2. Winners: own videos at >= WINNER_MIN_MULTIPLE x their usual views, best first.
 */
import { inArray, sql } from "drizzle-orm";
import { viralPostCandidates } from "../../drizzle/schema";
import type { ViralPost } from "../../shared/viralPosts";
import { getDb } from "../db";
import { prefetchHandle, requestOwnResearch } from "../research/prefetch";
import { candidateToAdapted, toViralPost } from "./browseService";
import { libraryHandle } from "./library";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function ownWinnersEnabled(): boolean {
  return process.env.OWN_WINNERS === "on";
}

/** "Clearly better than their usual": the same bar as "rising" in shared/viralRule. */
export const WINNER_MIN_MULTIPLE = 1.5;
/** Creators who used SpyReels in this many days get their own accounts refreshed. */
const ACTIVE_DAYS = 14;
const DAY_MS = 86_400_000;
/** Posted within this many days = an active account (weekly refresh). */
export const OWN_ACTIVE_POSTING_DAYS = 30;
export const OWN_REFRESH_ACTIVE_DAYS = 7;
export const OWN_REFRESH_QUIET_DAYS = 30;

/**
 * When to read a creator's own account again. Never read: now. Posted in the
 * last 30 days: weekly (a post from today shows whether it went viral within
 * a week). Quiet: monthly. Pure; exported for tests.
 */
export function ownRefreshDue(args: { lastResearchAt: Date | null; newestPostAt: Date | null; now: Date }): boolean {
  if (!args.lastResearchAt) return true;
  const age = args.now.getTime() - args.lastResearchAt.getTime();
  const postedRecently =
    args.newestPostAt != null && args.now.getTime() - args.newestPostAt.getTime() <= OWN_ACTIVE_POSTING_DAYS * DAY_MS;
  return age >= (postedRecently ? OWN_REFRESH_ACTIVE_DAYS : OWN_REFRESH_QUIET_DAYS) * DAY_MS;
}

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

function accountMatch(accounts: Array<{ platform: string; handle: string }>) {
  const keys = accounts
    .map(a => ({ platform: a.platform, handle: libraryHandle(a.handle) }))
    .filter((a): a is { platform: string; handle: string } => !!a.handle);
  if (keys.length === 0) return null;
  return sql.join(
    keys.map(k => sql`(c.platform = ${k.platform} AND LOWER(TRIM(LEADING '@' FROM c.creatorHandle)) = ${k.handle})`),
    sql` OR `
  );
}

/** The creator's own best videos across these accounts, best first, as Home video cards. */
export async function loadOwnWinnerPosts(
  db: Db,
  accounts: Array<{ platform: string; handle: string }>,
  limit = 4
): Promise<ViralPost[]> {
  const match = accountMatch(accounts);
  if (!match) return [];
  const [rows] = (await db.execute(sql`
    SELECT c.id AS id, s.multiple AS multiple, s.basis AS basis
    FROM viral_post_candidates c
    JOIN viral_library_status s ON s.candidateId = c.id
    WHERE (${match}) AND s.multiple >= ${WINNER_MIN_MULTIPLE}
    ORDER BY s.multiple DESC
    LIMIT ${Math.max(1, Math.min(12, limit))}
  `)) as unknown as [Array<{ id: number; multiple: unknown; basis: string | null }>];
  const picked = rows ?? [];
  if (picked.length === 0) return [];
  const candidates = await db
    .select()
    .from(viralPostCandidates)
    .where(inArray(viralPostCandidates.id, picked.map(r => Number(r.id))));
  const byId = new Map(candidates.map(c => [c.id, c]));
  return picked.flatMap(r => {
    const c = byId.get(Number(r.id));
    if (!c) return [];
    const multiple = Number(r.multiple);
    return [
      {
        ...toViralPost(c, { ...candidateToAdapted(c, "", "", null), relevanceLabel: "Your video" }, false),
        viralMultiple: Number.isFinite(multiple) ? multiple : null,
        viralBasis: r.basis === "usual_views" || r.basis === "followers" ? r.basis : null,
      },
    ];
  });
}

async function lastResearchAt(db: Db, platform: string, handle: string): Promise<Date | null> {
  const table = platform === "instagram" ? "scrape_jobs" : platform === "tiktok" ? "tiktok_scrape_jobs" : "youtube_scrape_jobs";
  const [rows] = (await db.execute(
    sql`SELECT MAX(updatedAt) AS at FROM ${sql.raw(table)} WHERE handle = ${prefetchHandle(platform, handle)} AND status = 'completed'`
  )) as unknown as [Array<{ at: Date | string | null }>];
  const at = rows?.[0]?.at;
  return at ? new Date(at) : null;
}

async function newestPostAt(db: Db, platform: string, handle: string): Promise<Date | null> {
  const key = libraryHandle(handle);
  if (!key) return null;
  const [rows] = (await db.execute(sql`
    SELECT MAX(c.publishedAt) AS at FROM viral_post_candidates c
    WHERE c.platform = ${platform} AND LOWER(TRIM(LEADING '@' FROM c.creatorHandle)) = ${key}
  `)) as unknown as [Array<{ at: Date | string | null }>];
  const at = rows?.[0]?.at;
  return at ? new Date(at) : null;
}

/**
 * Worker step (a few times a day; only a database check): queue the own
 * accounts of recently active creators that are due (see ownRefreshDue).
 * Returns how many were queued.
 */
export async function queueOwnAccountResearch(now = new Date()): Promise<number> {
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
    const due: Array<{ platform: string; handle: string }> = [];
    for (const r of rows ?? []) {
      const platform = String(r.platform);
      const handle = String(r.handle);
      const [last, newest] = await Promise.all([lastResearchAt(db, platform, handle), newestPostAt(db, platform, handle)]);
      if (ownRefreshDue({ lastResearchAt: last, newestPostAt: newest, now })) due.push({ platform, handle });
    }
    if (due.length) await requestOwnResearch(due);
    return due.length;
  } catch (err) {
    console.warn("[viralLibrary] own_research_queue_failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}
