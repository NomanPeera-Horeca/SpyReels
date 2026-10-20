/**
 * Who may be guided into onboarding, and who must be left on the product.
 *
 * A first signup is guided from the default app entry (`/`, `/research`,
 * Home aliases). Someone who already opened onboarding, saved progress,
 * finished, or skipped is left on the product and can resume from Finish setup.
 * Marketing paths and specific feature deep links are never taken over.
 *
 * The four states come from the server: nothing recorded yet (first signup),
 * entered or saved progress (interrupted), completed, or skipped. Account age
 * and browser storage are not evidence.
 */

/** Post-auth landings that are the app itself, not a feature deep link. */
const DEFAULT_APP_ENTRIES = new Set(["/", "/research", "/dashboard", "/plan"]);

export type OnboardingLifecycle =
  | "first_signup"
  | "interrupted"
  | "completed"
  | "skipped";

export function resolveOnboardingLifecycle(input: {
  completed: boolean;
  skipped: boolean;
  hasSavedProgress: boolean;
  /** `users.onboardingEnteredAt` is set. This is not browser storage. */
  entered: boolean;
}): OnboardingLifecycle {
  if (input.completed) return "completed";
  if (input.skipped) return "skipped";
  if (input.entered || input.hasSavedProgress) return "interrupted";
  return "first_signup";
}

export function isDefaultAppEntry(pathname: string): boolean {
  const path = normalizePath(pathname);
  return DEFAULT_APP_ENTRIES.has(path);
}

function normalizePath(pathname: string): string {
  const path = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  return path;
}

export function isMarketingPath(pathname: string): boolean {
  const path = normalizePath(pathname);
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
  /** Server stamp from opening onboarding. */
  entered: boolean;
  /** The progress read failed or timed out. Do not trap the customer. */
  progressUnreadable: boolean;
  pathname: string;
};

export type OnboardingAccess = "guide" | "allow";

export function decideOnboardingAccess(input: OnboardingAccessInput): OnboardingAccess {
  if (!input.isPostLaunchUser) return "allow";
  if (isMarketingPath(input.pathname)) return "allow";
  const path = normalizePath(input.pathname);
  if (path === "/onboarding") return "allow";
  if (input.progressUnreadable) return "allow";
  if (resolveOnboardingLifecycle(input) !== "first_signup") return "allow";
  if (!isDefaultAppEntry(path)) return "allow";
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
