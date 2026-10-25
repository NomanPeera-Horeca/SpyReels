/**
 * Home v2 read model (Phase 5). Read only: nothing here writes rows, starts
 * a scrape, schedules a pool refresh or calls an AI model, so rendering Home
 * never costs provider or model money.
 *
 * - context: the user's confirmed personalization (active profile) mapped to
 *   the existing featured-creator niche taxonomy with inferNicheFromText.
 * - creators: the same indexed Viral Posts inventory as videos. Home groups
 *   qualified posts by creator. The featured catalog is not that source.
 * - videos: indexed Viral Posts pools that already exist (no new pools, no
 *   refresh), see browseIndexedViralPosts.
 */
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
import type { OnboardingStateView } from "../onboarding/onboardingService";

/** "Recent" for the creator signal (engineering default, open for CEO/CTO confirmation). */
export const CREATOR_SIGNAL_RECENT_DAYS = 90;
export const HOME_CREATOR_LIMIT = 3;

export type HomeContext = {
  hasProfile: boolean;
  /** Confirmed specific niche label, or null (sidebar and subtitles say "not personalized yet"). */
  nicheLabel: string | null;
  /** Broad discovery category when the niche row has one. Pool matching uses this. */
  categoryLabel: string | null;
  /** Slug inferred from the discovery category, or from the label when no category is stored. */
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
 * Live Home matching stays on the confirmed niche label.
 * The stored category is not a pool key until its indexed supply is verified.
 */
export function videoMatchText(context: HomeContext): string | null {
  const label = context.nicheLabel?.trim() ?? "";
  return label || null;
}

/** Pure: personalization state -> Home context. Uses confirmed items only. */
export function homeContextFromState(state: OnboardingStateView | null): HomeContext {
  if (!state) {
    return {
      hasProfile: false,
      nicheLabel: null,
      categoryLabel: null,
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
  const categoryLabel = niche?.categoryLabel?.trim() || null;
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
  const statusOf = (s: PersonalizationStep): StepStatus => state.steps[s];
  const nextStep = ORDER.find(s => statusOf(s) !== "confirmed") ?? null;
  const inferred = niche?.label ? inferNicheFromText(niche.label) : null;
  return {
    hasProfile: Boolean(state.profile),
    nicheLabel: niche?.label ?? null,
    categoryLabel,
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
 * Badge filter for a featured-shaped list. Home does not use this list.
 * Badge = best video in the recent window. A null badge excludes the row.
 * Empty slots stay empty.
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
