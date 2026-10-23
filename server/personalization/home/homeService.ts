/**
 * Home v2 read model (Phase 5). Read only: nothing here writes rows, starts
 * a scrape, schedules a pool refresh or calls an AI model, so rendering Home
 * never costs provider or model money.
 *
 * - context: the user's confirmed personalization (active profile) mapped to
 *   the existing featured-creator niche taxonomy with inferNicheFromText.
 * - creators: featured catalog (already stored). A creator is included only
 *   when the best recent video earns a real viral badge (shared/viralTier).
 * - videos: indexed Viral Posts pools that already exist (no new pools, no
 *   refresh), see browseIndexedViralPosts.
 */
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { inferNicheFromText } from "@shared/creatorContextInference";
import type {
  AudiencePayload,
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
  /** Confirmed niche, goal, and pillar text joined for display context. Not a pool key. */
  description: string | null;
  /** Confirmed pillar titles. Pool lookup only, never a niche override. */
  pillarTitles: string[];
  /** Confirmed goal text. Ranking boost only. */
  goalText: string | null;
  /** Confirmed audience who + outcome. Ranking boost only. */
  audienceText: string | null;
  /** All three strategy steps confirmed (frame A); otherwise frame B. */
  personalizationComplete: boolean;
  /** First step still to confirm, for "Finish setup". */
  nextStep: PersonalizationStep | null;
};

const ORDER: PersonalizationStep[] = ["goal", "audience", "pillars"];

/**
 * Pool niche text is the confirmed niche label only.
 * Goal, audience, and pillar text must not retarget that niche.
 * When the label is missing, browse falls back to the legacy profile text.
 */
export function videoMatchText(context: HomeContext): string | null {
  return context.nicheLabel;
}

/** Pure: personalization state -> Home context. Uses confirmed items only. */
export function homeContextFromState(state: OnboardingStateView | null): HomeContext {
  if (!state) {
    return {
      hasProfile: false,
      nicheLabel: null,
      featuredNicheSlug: null,
      description: null,
      pillarTitles: [],
      goalText: null,
      audienceText: null,
      personalizationComplete: false,
      nextStep: "goal",
    };
  }
  const confirmed = state.items.filter(i => i.status === "confirmed");
  const niche = confirmed.find(i => i.kind === "niche")?.payload as NichePayload | undefined;
  const goal = confirmed.find(i => i.kind === "goal")?.payload as GoalPayload | undefined;
  const pillarTitles = confirmed
    .filter(i => i.kind === "pillar")
    .map(i => (i.payload as PillarPayload).title)
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
  const audience = confirmed.find(i => i.kind === "audience")?.payload as AudiencePayload | undefined;
  const audienceParts = [audience?.who, audience?.outcome].filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );
  const parts = [niche?.label, goal?.text, ...pillarTitles].filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0
  );
  const description = parts.length ? parts.join(". ") : null;
  // Goal and audience never choose the featured niche. An unmatched label stays general.
  const inferred = niche?.label ? inferNicheFromText(niche.label) : null;
  const statusOf = (s: PersonalizationStep): StepStatus => state.steps[s];
  const nextStep = ORDER.find(s => statusOf(s) !== "confirmed") ?? null;
  return {
    hasProfile: Boolean(state.profile),
    nicheLabel: niche?.label ?? null,
    featuredNicheSlug: inferred?.slug ?? null,
    description,
    pillarTitles,
    goalText: goal?.text?.trim() || null,
    audienceText: audienceParts.length ? audienceParts.join(". ") : null,
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
 * Pure: pick the creators to show. Badge = best video in the recent window.
 * No recent video, missing followers, or below Healthy -> no badge.
 * A null badge excludes the creator. Empty slots stay empty.
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
    .filter(creator => creator.badge !== null)
    .sort((x, y) => (y.badge?.multiple ?? 0) - (x.badge?.multiple ?? 0))
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
