/**
 * Home v2 read model (Phase 5). Read only: nothing here writes rows, starts
 * a scrape, schedules a pool refresh or calls an AI model, so rendering Home
 * never costs provider or model money.
 *
 * - context: the user's confirmed personalization (active profile) mapped to
 *   the existing featured-creator niche taxonomy with inferNicheFromText.
 * - creators: featured catalog (already stored), badge = best recent video
 *   against the creator's real follower count (shared/viralTier).
 * - videos: indexed Viral Posts pools that already exist (no new pools, no
 *   refresh), see browseIndexedViralPosts.
 */
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { inferNicheFromText } from "@shared/creatorContextInference";
import type {
  GoalPayload,
  NichePayload,
  PersonalizationStep,
  PillarPayload,
  StepStatus,
} from "@shared/personalization/model";
import { followerViralBadge, type FollowerViralBadge } from "@shared/viralTier";
import {
  featuredAccountNiches,
  featuredAccounts,
  featuredReels,
  niches,
} from "../../../drizzle/schema";
import type { OnboardingStateView } from "../onboarding/onboardingService";

/** "Recent" for the creator signal (engineering default, open for CEO/CTO confirmation). */
export const CREATOR_SIGNAL_RECENT_DAYS = 90;
export const HOME_CREATOR_LIMIT = 3;
const CANDIDATE_ACCOUNTS = 40;

export type HomeContext = {
  hasProfile: boolean;
  /** Confirmed niche label, or null (sidebar and subtitles say "not personalized yet"). */
  nicheLabel: string | null;
  /** Featured-catalog slug for creators; null means general picks. */
  featuredNicheSlug: string | null;
  /** Text used to pick the matching Viral Posts pools (same rules as Explore). */
  description: string | null;
  /** All three strategy steps confirmed (frame A); otherwise frame B. */
  personalizationComplete: boolean;
  /** First step still to confirm, for "Finish setup". */
  nextStep: PersonalizationStep | null;
};

const ORDER: PersonalizationStep[] = ["goal", "audience", "pillars"];

/**
 * Pool matching follows the confirmed niche label when the user has one.
 * Goal and pillar text must not pull videos from a different niche than the
 * label Home shows.
 */
export function videoMatchText(context: HomeContext): string | null {
  return context.nicheLabel ?? context.description;
}

/** Pure: personalization state -> Home context. Uses confirmed items only. */
export function homeContextFromState(state: OnboardingStateView | null): HomeContext {
  if (!state) {
    return {
      hasProfile: false,
      nicheLabel: null,
      featuredNicheSlug: null,
      description: null,
      personalizationComplete: false,
      nextStep: "goal",
    };
  }
  const confirmed = state.items.filter(i => i.status === "confirmed");
  const niche = confirmed.find(i => i.kind === "niche")?.payload as NichePayload | undefined;
  const goal = confirmed.find(i => i.kind === "goal")?.payload as GoalPayload | undefined;
  const pillars = confirmed
    .filter(i => i.kind === "pillar")
    .map(i => (i.payload as PillarPayload).title);
  const parts = [niche?.label, goal?.text, ...pillars].filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );
  const description = parts.length ? parts.join(". ") : null;
  // The user's own niche wins; goal and pillars only fill in when it is missing or unmatched.
  const inferred =
    (niche?.label ? inferNicheFromText(niche.label) : null) ??
    (description ? inferNicheFromText(description) : null);
  const statusOf = (s: PersonalizationStep): StepStatus => state.steps[s];
  const nextStep = ORDER.find(s => statusOf(s) !== "confirmed") ?? null;
  return {
    hasProfile: Boolean(state.profile),
    nicheLabel: niche?.label ?? null,
    featuredNicheSlug: inferred?.slug ?? null,
    description,
    personalizationComplete: nextStep === null,
    nextStep,
  };
}

export type HomeCreator = {
  id: number;
  handle: string;
  displayName: string | null;
  profilePicUrl: string | null;
  followerCount: number;
  platform: "instagram";
  badge: FollowerViralBadge | null;
};

type AccountRow = {
  id: number;
  handle: string;
  displayName: string | null;
  profilePicUrl: string | null;
  followerCount: number;
};
type ReelRow = { featuredAccountId: number; viewCount: number; postedAt: Date };

/**
 * Pure: pick the creators to show. Badge = best video in the recent window;
 * no recent video, missing followers or below Healthy -> no badge (hidden,
 * never an old or estimated number). Badged creators first, by multiple.
 */
export function pickViralCreators(
  accounts: AccountRow[],
  reels: ReelRow[],
  now: Date,
  limit = HOME_CREATOR_LIMIT
): HomeCreator[] {
  const since = now.getTime() - CREATOR_SIGNAL_RECENT_DAYS * 86_400_000;
  const best = new Map<number, number>();
  for (const r of reels) {
    if (r.postedAt.getTime() < since) continue;
    if ((best.get(r.featuredAccountId) ?? -1) < r.viewCount) best.set(r.featuredAccountId, r.viewCount);
  }
  return accounts
    .map(a => ({
      id: a.id,
      handle: a.handle,
      displayName: a.displayName,
      profilePicUrl: a.profilePicUrl,
      followerCount: a.followerCount,
      platform: "instagram" as const,
      badge: followerViralBadge(best.get(a.id) ?? null, a.followerCount),
    }))
    .sort((x, y) => (y.badge?.multiple ?? -1) - (x.badge?.multiple ?? -1))
    .slice(0, limit);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

export async function loadViralCreators(
  db: AnyDb,
  featuredNicheSlug: string | null,
  now = new Date()
): Promise<HomeCreator[]> {
  const select = {
    id: featuredAccounts.id,
    handle: featuredAccounts.handle,
    displayName: featuredAccounts.displayName,
    profilePicUrl: featuredAccounts.profilePicUrl,
    followerCount: featuredAccounts.followerCount,
  };
  const accounts: AccountRow[] = featuredNicheSlug
    ? await db
        .select(select)
        .from(featuredAccounts)
        .innerJoin(featuredAccountNiches, eq(featuredAccountNiches.accountId, featuredAccounts.id))
        .innerJoin(niches, eq(niches.id, featuredAccountNiches.nicheId))
        .where(and(eq(niches.slug, featuredNicheSlug), eq(featuredAccounts.isActive, true)))
        .orderBy(desc(featuredAccounts.followerCount))
        .limit(CANDIDATE_ACCOUNTS)
    : await db
        .select(select)
        .from(featuredAccounts)
        .where(eq(featuredAccounts.isActive, true))
        .orderBy(desc(featuredAccounts.followerCount))
        .limit(CANDIDATE_ACCOUNTS);
  if (accounts.length === 0) return [];
  const since = new Date(now.getTime() - CREATOR_SIGNAL_RECENT_DAYS * 86_400_000);
  const reels: ReelRow[] = await db
    .select({
      featuredAccountId: featuredReels.featuredAccountId,
      viewCount: featuredReels.viewCount,
      postedAt: featuredReels.postedAt,
    })
    .from(featuredReels)
    .where(
      and(
        inArray(
          featuredReels.featuredAccountId,
          accounts.map(a => a.id)
        ),
        gte(featuredReels.postedAt, since),
        ne(featuredReels.transcriptionStatus, "failed")
      )
    );
  return pickViralCreators(accounts, reels, now);
}
