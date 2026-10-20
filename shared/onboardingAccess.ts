/**
 * Who may be guided into onboarding, and who must be left on the product.
 *
 * First signup can land on onboarding. A customer who already saved progress,
 * already left onboarding, or opens Home or another product route is not sent
 * back. Marketing paths are never taken over.
 */

/** This browser has already been on onboarding, so later visits are not forced. */
export const ONBOARDING_RELEASED_KEY = "spyreels.onboarding.released";

/** How long after account creation a first visit to Home may open onboarding. */
export const FIRST_SIGNUP_GUIDE_MS = 30 * 60 * 1000;

export function isMarketingPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  if (
    path === "/pricing" ||
    path === "/blog" ||
    path === "/about" ||
    path === "/contact" ||
    path === "/terms" ||
    path === "/privacy" ||
    path === "/affiliate" ||
    path === "/extension"
  ) {
    return true;
  }
  return (
    path.startsWith("/blog/") ||
    path.startsWith("/free-tools") ||
    path.startsWith("/features/")
  );
}

export type OnboardingAccessInput = {
  isPostLaunchUser: boolean;
  completed: boolean;
  skipped: boolean;
  hasSavedProgress: boolean;
  /** This browser already opened onboarding, or the customer left it. */
  released: boolean;
  /** The progress read failed or timed out. Do not trap the customer. */
  progressUnreadable: boolean;
  pathname: string;
  accountAgeMs: number | null;
};

export type OnboardingAccess = "guide" | "allow";

export function decideOnboardingAccess(input: OnboardingAccessInput): OnboardingAccess {
  if (!input.isPostLaunchUser || input.completed || input.skipped) return "allow";
  if (isMarketingPath(input.pathname)) return "allow";
  const path = input.pathname.split("?")[0] || "/";
  if (path === "/onboarding") return "allow";
  if (input.hasSavedProgress || input.released || input.progressUnreadable) return "allow";
  if (path !== "/") return "allow";
  if (
    input.accountAgeMs == null ||
    input.accountAgeMs < 0 ||
    input.accountAgeMs > FIRST_SIGNUP_GUIDE_MS
  ) {
    return "allow";
  }
  return "guide";
}

/** Server progress that means onboarding was already started. */
export function hasSavedOnboardingProgress(input: {
  profileConfirmed: boolean;
  hasAnswers: boolean;
  hasItems: boolean;
  resumeStep: string | null;
} | null): boolean {
  if (!input) return false;
  if (input.profileConfirmed || input.hasAnswers || input.hasItems) return true;
  return (
    input.resumeStep != null &&
    input.resumeStep !== "platform" &&
    input.resumeStep !== "profile_confirm"
  );
}

export function hasLegacyOnboardingProgress(input: {
  businessDescription: string | null;
  nicheCount: number;
  hasCreator: boolean;
} | null): boolean {
  if (!input) return false;
  if (input.businessDescription?.trim()) return true;
  return input.nicheCount > 0 || input.hasCreator;
}
