import { parseResearchIntent } from "./researchIntent";

/**
 * Routing helpers for the new onboarding and Home v2.
 *
 * WHO gets the new experience is decided per user on the server
 * (shared/onboardingV2Access.ts, ONBOARDING_V2_MODE / HOME_V2_MODE), so it
 * can be switched or rolled back without a rebuild. These helpers only turn
 * that per-user answer into a route decision.
 */
/** Query params that only the research page (pages/Home.tsx) understands. */
const RESEARCH_QUERY_PARAMS = ["creator", "platform", "jobId"] as const;

export type DesktopRootView = "research" | "home-v2";

/**
 * Decides what "/" renders on desktop.
 *
 * - Flag off: always the existing research page (no change).
 * - Flag on: Home v2, EXCEPT when the visit carries research intent
 *   (a saved-search or landing hand-off link, a job deep link, or a handle
 *   stashed before sign-in). Those keep opening research, so no existing
 *   link breaks.
 *
 * "/research" is not decided here: it always renders the research page.
 */
export function resolveDesktopRootView(input: {
  homeV2Enabled: boolean;
  search: string;
  hasPendingResearchHandle: boolean;
}): DesktopRootView {
  if (!input.homeV2Enabled) return "research";
  if (input.hasPendingResearchHandle) return "research";
  if (parseResearchIntent(input.search)) return "research";
  const params = new URLSearchParams(
    input.search.startsWith("?") ? input.search.slice(1) : input.search
  );
  if (RESEARCH_QUERY_PARAMS.some(key => params.has(key))) return "research";
  return "home-v2";
}

export type OnboardingVariant = "legacy" | "v2";

export function resolveOnboardingVariant(input: {
  onboardingV2Enabled: boolean;
}): OnboardingVariant {
  return input.onboardingV2Enabled ? "v2" : "legacy";
}
