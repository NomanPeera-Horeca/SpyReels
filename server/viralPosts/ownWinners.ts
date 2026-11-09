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
import { PRISM_FORMATS, prismFormat, type FormatPick } from "../../shared/remakeFormats";
import { invokeLLM } from "../_core/llm";
import { parseLlmJson } from "../utils/parseLlmJson";
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

/** A proven idea: at least 2x the creator's own usual views (owner decision). */
export const WINNER_MIN_MULTIPLE = 2;
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

/* ------------------------------------------------------------------ */
/* "Your proven ideas" (Home) and the own-winner Remake popup          */
/* ------------------------------------------------------------------ */

const DUPLICATE_POST_DAYS = 7;

function captionKey(caption: string | null | undefined): string {
  return (caption ?? "")
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_]+/gu, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * The same video posted on several platforms is one idea: near-identical
 * caption and posted within a week. Keeps the first (best) one. Input must be
 * best first. Pure; exported for tests.
 */
export function dedupeSameIdea<T extends { caption?: string | null; publishedAt?: string | null }>(posts: T[]): T[] {
  const kept: T[] = [];
  for (const p of posts) {
    const key = captionKey(p.caption);
    const at = p.publishedAt ? Date.parse(p.publishedAt) : NaN;
    const dup =
      key.length >= 12 &&
      kept.some(k => {
        if (captionKey(k.caption) !== key) return false;
        const kAt = k.publishedAt ? Date.parse(k.publishedAt) : NaN;
        return !Number.isFinite(at) || !Number.isFinite(kAt) || Math.abs(at - kAt) <= DUPLICATE_POST_DAYS * DAY_MS;
      });
    if (!dup) kept.push(p);
  }
  return kept;
}

/** Formats used on this idea are skipped; the first unused one is recommended. Pure. */
export function recommendFormat(formats: FormatPick[], used: string[]): FormatPick | null {
  return formats.find(f => !used.includes(f.id)) ?? null;
}

/** Fallback when the AI pick is unavailable: the fixed Prism order. Pure. */
export function defaultFormatPicks(): FormatPick[] {
  return PRISM_FORMATS.slice(0, 4).map(f => ({ id: f.id, pitch: `Same topic, new hook: ${f.how}.` }));
}

/** Keep only known formats, no repeats, at most 4. Pure; exported for tests. */
export function cleanFormatPicks(raw: unknown): FormatPick[] {
  const list = Array.isArray((raw as { formats?: unknown })?.formats)
    ? ((raw as { formats: unknown[] }).formats)
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];
  const out: FormatPick[] = [];
  for (const item of list) {
    const id = String((item as { id?: unknown })?.id ?? "").trim();
    const pitch = String((item as { pitch?: unknown })?.pitch ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
    if (!prismFormat(id) || out.some(o => o.id === id) || !pitch) continue;
    out.push({ id, pitch });
    if (out.length >= 4) break;
  }
  return out;
}

const FORMAT_MODEL = "claude-haiku-4-5-20251001";

async function pickFormatsWithAi(caption: string, transcript: string | null): Promise<FormatPick[]> {
  const menu = PRISM_FORMATS.map(f => `- ${f.id}: ${f.label} (${f.how})`).join("\n");
  const response = await invokeLLM({
    model: FORMAT_MODEL,
    maxTokens: 500,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "A creator's own video did much better than usual. Pick the 3 or 4 formats from the menu that genuinely suit remaking the SAME topic as a new video (skip formats that don't fit, e.g. before/after with no real comparison). Best first. For each, write one short pitch (max 25 words) that names the same topic and the new hook, like: \"Same topic, selling your company, with a new hook: the mistake most owners make before they sell, and what to do instead.\" Never invent facts, numbers or results. Return ONLY JSON: {\"formats\":[{\"id\":\"...\",\"pitch\":\"...\"}]}.\n\nMenu:\n" +
          menu,
      },
      {
        role: "user",
        content: `Caption: ${caption.slice(0, 600) || "(none)"}\n\nSpoken words (start): ${(transcript ?? "").slice(0, 1200) || "(not available)"}`,
      },
    ],
  });
  return cleanFormatPicks(parseLlmJson(String(response.choices[0]?.message?.content ?? ""), {}));
}

let formatsTableReady: boolean | null = null;
async function ownWinnerFormatsReady(db: Db): Promise<boolean> {
  if (formatsTableReady) return true;
  try {
    const [rows] = (await db.execute(sql`
      SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('own_winner_formats', 'remake_publications')
    `)) as unknown as [Array<{ n: number }>];
    formatsTableReady = Number(rows?.[0]?.n ?? 0) === 2;
  } catch {
    formatsTableReady = false;
  }
  return formatsTableReady;
}

/**
 * The ranked formats for one own-winner video: saved once per video (about
 * 0.1 cent with the small model) and reused. Falls back to the fixed order.
 */
export async function formatsForWinner(db: Db, candidateId: number, caption: string): Promise<FormatPick[]> {
  const ready = await ownWinnerFormatsReady(db);
  if (ready) {
    const [rows] = (await db.execute(
      sql`SELECT formats FROM own_winner_formats WHERE libraryCandidateId = ${candidateId} LIMIT 1`
    )) as unknown as [Array<{ formats: unknown }>];
    const saved = rows?.[0]?.formats;
    let parsed: FormatPick[] = [];
    try {
      parsed = cleanFormatPicks(typeof saved === "string" ? JSON.parse(saved) : saved);
    } catch {
      parsed = [];
    }
    if (parsed.length) return parsed;
  }
  let transcript: string | null = null;
  try {
    const [t] = (await db.execute(
      sql`SELECT transcript FROM library_transcripts WHERE candidateId = ${candidateId} AND status = 'completed' LIMIT 1`
    )) as unknown as [Array<{ transcript: string | null }>];
    transcript = t?.[0]?.transcript ?? null;
  } catch {
    // Library transcripts table not there yet: caption only.
  }
  let picks: FormatPick[] = [];
  try {
    picks = await pickFormatsWithAi(caption, transcript);
  } catch (err) {
    console.warn("[ownWinners] format_pick_failed", { candidateId, error: err instanceof Error ? err.message : String(err) });
  }
  if (picks.length === 0) return defaultFormatPicks();
  if (ready) {
    await db
      .execute(
        sql`INSERT IGNORE INTO own_winner_formats (libraryCandidateId, formats) VALUES (${candidateId}, ${JSON.stringify(picks)})`
      )
      .catch(() => {});
  }
  return picks;
}

/** Prism formats this creator already used on this video (not failed). */
export async function usedFormatsForWinner(
  db: Db,
  args: { userId: number; workspaceId: string; candidateId: number }
): Promise<string[]> {
  try {
    const [rows] = (await db.execute(sql`
      SELECT DISTINCT prismFormat FROM recreated_scripts
      WHERE userId = ${args.userId} AND workspaceId = ${args.workspaceId}
        AND libraryCandidateId = ${args.candidateId} AND choice = 'prism_format'
        AND prismFormat IS NOT NULL AND status <> 'failed'
    `)) as unknown as [Array<{ prismFormat: string }>];
    return (rows ?? []).map(r => String(r.prismFormat));
  } catch {
    return []; // Before migration 0118.
  }
}

/** Own-winner videos this creator already made a script from (card is replaced). */
async function remadeCandidateIds(db: Db, userId: number, workspaceId: string, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  try {
    const [rows] = (await db.execute(sql`
      SELECT DISTINCT libraryCandidateId AS id FROM recreated_scripts
      WHERE userId = ${userId} AND workspaceId = ${workspaceId} AND status <> 'failed'
        AND libraryCandidateId IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})
    `)) as unknown as [Array<{ id: number }>];
    return new Set((rows ?? []).map(r => Number(r.id)));
  } catch {
    return new Set(); // Before migration 0118.
  }
}

export type ProvenIdea = {
  post: ViralPost;
  /** Formats that suit this video, best first. */
  formats: FormatPick[];
  /** Formats already used on this idea (shown as "Used"). */
  usedFormats: string[];
  /** First unused format (null when all were used). */
  recommended: FormatPick | null;
};

/**
 * Home "Your proven ideas": 3 of the creator's own winners (>= 2x usual
 * views), best first, one card per idea across platforms. A card is replaced
 * by the next winner once the creator made a script from it.
 */
export async function loadProvenIdeas(
  db: Db,
  args: { userId: number; workspaceId: string; accounts: Array<{ platform: string; handle: string }>; limit?: number }
): Promise<ProvenIdea[]> {
  const posts = dedupeSameIdea(await loadOwnWinnerPosts(db, args.accounts, 12));
  const remade = await remadeCandidateIds(db, args.userId, args.workspaceId, posts.map(p => Number(p.id)));
  const picked = posts.filter(p => !remade.has(Number(p.id))).slice(0, args.limit ?? 3);
  return Promise.all(
    picked.map(async post => {
      const candidateId = Number(post.id);
      const [formats, usedFormats] = await Promise.all([
        formatsForWinner(db, candidateId, post.caption ?? ""),
        usedFormatsForWinner(db, { userId: args.userId, workspaceId: args.workspaceId, candidateId }),
      ]);
      return { post, formats, usedFormats, recommended: recommendFormat(formats, usedFormats) };
    })
  );
}

/** True when this library video is from one of the workspace's own profiles. */
export async function isOwnWinnerVideo(db: Db, workspaceId: string, candidateId: number): Promise<boolean> {
  const [rows] = (await db.execute(sql`
    SELECT 1 AS ok FROM viral_post_candidates c
    JOIN social_profiles sp ON sp.workspaceId = ${workspaceId} AND sp.deletedAt IS NULL
      AND sp.platform = c.platform
      AND LOWER(TRIM(LEADING '@' FROM sp.normalizedHandle)) = LOWER(TRIM(LEADING '@' FROM c.creatorHandle))
    WHERE c.id = ${candidateId}
    LIMIT 1
  `)) as unknown as [Array<{ ok: number }>];
  return (rows ?? []).length > 0;
}
