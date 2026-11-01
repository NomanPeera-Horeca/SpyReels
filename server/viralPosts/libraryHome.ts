/**
 * Home reads the shared viral library (step C1): videos and creators matched
 * to the creator's topics, never blank.
 *
 * Tiers, in order, each labelled honestly on the card:
 *   1. viral/rising videos tagged with the profile's own topics
 *      ("Viral in your topics");
 *   2. videos in the same categories as those topics ("Viral in Tech");
 *   3. the strongest viral videos from any topic, as formats to adapt
 *      ("Viral format you can adapt"), so Home is never empty once the
 *      library has anything.
 * Hidden creators and dismissed videos are left out; one video per creator.
 * Read only: no provider calls, no AI calls. Safe before migration 0109
 * (returns null and Home keeps its current behaviour).
 */
import { and, desc, eq, gte, inArray, isNull, or } from "drizzle-orm";
import { viralPostCandidates, type ViralPostCandidate } from "../../drizzle/schema";
import {
  viralLibraryStatus,
  viralProfileTopics,
  viralTopics,
  viralVideoTopics,
} from "../../drizzle/viralLibrarySchema";
import type { FollowerViralBadge, FollowerViralTier } from "../../shared/viralTier";
import { VIRAL_TOPIC_CATEGORY_LABELS } from "../../shared/viralTopics";
import type { ViralPost } from "../../shared/viralPosts";
import { getDb } from "../db";
import { candidateToAdapted, toViralPost, type IndexedHomeCreator } from "./browseService";
import * as repo from "./repository";
import { isTopicsReady } from "./topics";

const LIBRARY_RECENT_DAYS = 365;
const TIER_FETCH_LIMIT = 300;

export type LibraryTier = 1 | 2 | 3;

export type LibraryRow = {
  candidate: ViralPostCandidate;
  status: string;
  basis: string | null;
  multiple: number | null;
  tier: LibraryTier;
  /** How many of the profile's topics this video carries (tier 1 only). */
  overlap: number;
  categoryLabel: string | null;
};

/** Higher is better: viral multiple (log), freshness, topic overlap. Pure; exported for tests. */
export function libraryScore(row: Pick<LibraryRow, "multiple" | "overlap" | "status">, publishedAt: Date | null, now = new Date()): number {
  const m = Math.max(1, row.multiple ?? 1);
  const ageDays = publishedAt ? Math.max(0, (now.getTime() - publishedAt.getTime()) / 86_400_000) : 180;
  const freshness = 1 / (1 + ageDays / 30);
  const rising = row.status === "rising" ? 0.5 : 0;
  return Math.log10(m) * 2 + freshness * 2 + row.overlap * 0.75 + rising;
}

function creatorKey(c: ViralPostCandidate): string {
  return `${c.platform}:${(c.creatorHandle || c.creatorId || c.creatorName || "").trim().replace(/^@+/, "").toLowerCase()}`;
}

/**
 * Tier 1 first, then 2, then 3; best score first inside a tier; one video per
 * creator. Pure; exported for tests.
 */
export function pickLibraryRows(rows: LibraryRow[], limit: number, now = new Date()): LibraryRow[] {
  const seenVideo = new Set<number>();
  const seenCreator = new Set<string>();
  const out: LibraryRow[] = [];
  const sorted = rows
    .slice()
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        libraryScore(b, b.candidate.publishedAt, now) - libraryScore(a, a.candidate.publishedAt, now)
    );
  for (const row of sorted) {
    if (out.length >= limit) break;
    if (seenVideo.has(row.candidate.id)) continue;
    const ck = creatorKey(row.candidate);
    if (seenCreator.has(ck)) continue;
    seenVideo.add(row.candidate.id);
    seenCreator.add(ck);
    out.push(row);
  }
  return out;
}

export function tierLabel(row: Pick<LibraryRow, "tier" | "categoryLabel">): string {
  if (row.tier === 1) return "Viral in your topics";
  if (row.tier === 2) return row.categoryLabel ? `Viral in ${row.categoryLabel}` : "Viral in your category";
  return "Viral format you can adapt";
}

/** Badge from the one viral rule: "12x usual views" or "8x followers". Pure; exported for tests. */
export function libraryBadge(multiple: number | null, basis: string | null): FollowerViralBadge | null {
  if (multiple == null || !Number.isFinite(multiple) || multiple < 5) return null;
  const tier: FollowerViralTier =
    multiple >= 500 ? "Explosive" : multiple >= 100 ? "Viral" : multiple >= 25 ? "Strong" : "Healthy";
  const whole = Math.floor(multiple);
  const unit = basis === "usual_views" ? "usual views" : "followers";
  return { tier, multiple: whole, label: `${tier} · ${whole}x ${unit}` };
}

async function loadRows(args: {
  topicSlugs: string[] | null;
  statuses: string[];
  tier: LibraryTier;
  profileTopics: Set<string>;
  categoryOf: Map<string, string>;
}): Promise<LibraryRow[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - LIBRARY_RECENT_DAYS * 86_400_000);
  const recent = or(isNull(viralPostCandidates.publishedAt), gte(viralPostCandidates.publishedAt, since));
  if (args.topicSlugs) {
    if (args.topicSlugs.length === 0) return [];
    const rows = await db
      .select({
        candidate: viralPostCandidates,
        status: viralLibraryStatus.status,
        basis: viralLibraryStatus.basis,
        multiple: viralLibraryStatus.multiple,
        topicSlug: viralVideoTopics.topicSlug,
      })
      .from(viralVideoTopics)
      .innerJoin(viralLibraryStatus, eq(viralLibraryStatus.candidateId, viralVideoTopics.candidateId))
      .innerJoin(viralPostCandidates, eq(viralPostCandidates.id, viralVideoTopics.candidateId))
      .where(and(inArray(viralVideoTopics.topicSlug, args.topicSlugs), inArray(viralLibraryStatus.status, args.statuses), recent))
      .orderBy(desc(viralLibraryStatus.multiple))
      .limit(TIER_FETCH_LIMIT);
    const byId = new Map<number, LibraryRow>();
    for (const r of rows) {
      const existing = byId.get(r.candidate.id);
      const hit = args.profileTopics.has(r.topicSlug) ? 1 : 0;
      if (existing) {
        existing.overlap += hit;
        continue;
      }
      const category = args.categoryOf.get(r.topicSlug) ?? null;
      byId.set(r.candidate.id, {
        candidate: r.candidate,
        status: r.status,
        basis: r.basis,
        multiple: r.multiple != null ? Number(r.multiple) : null,
        tier: args.tier,
        overlap: hit,
        categoryLabel: category ? VIRAL_TOPIC_CATEGORY_LABELS[category] ?? category : null,
      });
    }
    return [...byId.values()];
  }
  const rows = await db
    .select({
      candidate: viralPostCandidates,
      status: viralLibraryStatus.status,
      basis: viralLibraryStatus.basis,
      multiple: viralLibraryStatus.multiple,
    })
    .from(viralLibraryStatus)
    .innerJoin(viralPostCandidates, eq(viralPostCandidates.id, viralLibraryStatus.candidateId))
    .where(and(inArray(viralLibraryStatus.status, args.statuses), recent))
    .orderBy(desc(viralLibraryStatus.multiple))
    .limit(TIER_FETCH_LIMIT);
  return rows.map(r => ({
    candidate: r.candidate,
    status: r.status,
    basis: r.basis,
    multiple: r.multiple != null ? Number(r.multiple) : null,
    tier: args.tier,
    overlap: 0,
    categoryLabel: null,
  }));
}

export type LibraryHome = { items: ViralPost[]; creators: IndexedHomeCreator[] };

/**
 * Library videos and creators for one creator profile. Null when the
 * library tables are missing or the profile has not been matched to topics
 * yet (Home then keeps its current behaviour).
 */
export async function libraryHomeForProfile(args: {
  userId: number;
  socialProfileId: string | null;
  limit: number;
  creatorLimit: number;
}): Promise<LibraryHome | null> {
  if (!args.socialProfileId) return null;
  const db = await getDb();
  if (!db || !(await isTopicsReady(db))) return null;
  try {
    const mine = await db
      .select({ slug: viralProfileTopics.topicSlug })
      .from(viralProfileTopics)
      .where(eq(viralProfileTopics.socialProfileId, args.socialProfileId));
    const profileTopics = new Set(mine.map(m => m.slug));
    if (profileTopics.size === 0) return null;

    const allTopics = await db.select({ slug: viralTopics.slug, category: viralTopics.category }).from(viralTopics);
    const categoryOf = new Map(allTopics.map(t => [t.slug, t.category]));
    const myCategories = new Set([...profileTopics].map(s => categoryOf.get(s)).filter((c): c is string => !!c));
    const siblingTopics = allTopics
      .filter(t => myCategories.has(t.category) && !profileTopics.has(t.slug))
      .map(t => t.slug);

    const [hidden, dismissed, saved] = await Promise.all([
      repo.getHiddenCreatorKeys(args.userId),
      repo.getRecentlyDismissedCandidateIds(args.userId),
      repo.getSavedCandidateIds(args.userId),
    ]);
    const tier1 = await loadRows({ topicSlugs: [...profileTopics], statuses: ["viral", "rising"], tier: 1, profileTopics, categoryOf });
    const tier2 = await loadRows({ topicSlugs: siblingTopics, statuses: ["viral", "rising"], tier: 2, profileTopics, categoryOf });
    const tier3 = await loadRows({ topicSlugs: null, statuses: ["viral"], tier: 3, profileTopics, categoryOf });

    const visible = [...tier1, ...tier2, ...tier3].filter(r => {
      if (dismissed.has(r.candidate.id)) return false;
      const handle = (r.candidate.creatorId || r.candidate.creatorHandle || "").toLowerCase().replace(/^@/, "");
      return !handle || !hidden.has(handle);
    });

    const toPost = (r: LibraryRow): ViralPost => {
      const adapted = candidateToAdapted(r.candidate, "", "", null);
      return {
        ...toViralPost(r.candidate, { ...adapted, relevanceLabel: tierLabel(r) }, saved.has(r.candidate.id)),
        viralMultiple: r.multiple,
        viralBasis: r.basis === "usual_views" || r.basis === "followers" ? r.basis : null,
      };
    };
    const videos = pickLibraryRows(visible, args.limit);
    // Creators: the best video per creator, skipping the ones already shown as videos when possible.
    const shown = new Set(videos.map(v => creatorKey(v.candidate)));
    const creatorRows = pickLibraryRows(
      [...visible.filter(r => !shown.has(creatorKey(r.candidate))), ...visible],
      args.creatorLimit
    );
    const creators: IndexedHomeCreator[] = creatorRows.map(r => {
      const c = r.candidate;
      const platform = c.platform === "tiktok" || c.platform === "youtube" ? c.platform : "instagram";
      const badge =
        libraryBadge(r.multiple, r.basis) ?? { tier: "Healthy" as const, multiple: 0, label: tierLabel(r) };
      return {
        id: c.id,
        handle: (c.creatorHandle || c.creatorId || "").trim().replace(/^@/, ""),
        displayName: c.creatorName?.trim() || null,
        profilePicUrl: c.creatorAvatarUrl || null,
        followerCount: c.creatorFollowers ?? 0,
        platform,
        badge,
        bestPost: toPost(r),
      };
    });
    return { items: videos.map(toPost), creators };
  } catch (err) {
    console.warn("[viralLibrary] home_read_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Home list: what Home shows today first (unchanged for current users), then
 * library tiers to fill the rest. No duplicates. Pure; exported for tests.
 */
export function mergeHomeLists<T>(current: T[], library: T[], limit: number, key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...current, ...library]) {
    if (out.length >= limit) break;
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

