import { parseResearchIntent } from "./researchIntent";

/**
 * Feature flags for the new onboarding and Home v2.
 *
 * Both flags are OFF unless explicitly set to "true", "1" or "yes".
 * Unlike DISCOVERY_V1_ENABLED, they stay off in development and test too,
 * so nobody sees the new experience by accident.
 *
 * Client values are fixed at build time (see vite.config.ts). Turning a flag
 * off and redeploying is the rollback. No database change is needed.
 */
export const HOME_V2_ENV_KEY = "HOME_V2_ENABLED";
export const ONBOARDING_V2_ENV_KEY = "ONBOARDING_V2_ENABLED";

export function parseDefaultOffFlag(raw: string | undefined | null): boolean {
  if (raw === undefined || raw === null) return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export type HomeV2FlagInput = {
  homeV2Raw: string | undefined | null;
  onboardingV2Raw: string | undefined | null;
};

export type HomeV2Flags = {
  onboardingV2Enabled: boolean;
  /**
   * Home v2 needs the new onboarding and personalization states. It only turns
   * on when BOTH flags are on, so Home can never ship ahead of onboarding.
   */
  homeV2Enabled: boolean;
};

export function resolveHomeV2Flags(input: HomeV2FlagInput): HomeV2Flags {
  const onboardingV2Enabled = parseDefaultOffFlag(input.onboardingV2Raw);
  const homeV2Requested = parseDefaultOffFlag(input.homeV2Raw);
  return {
    onboardingV2Enabled,
    homeV2Enabled: homeV2Requested && onboardingV2Enabled,
  };
}

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
  if (RESEARCH_QUERY_PARAMS.some((key) => params.has(key))) return "research";
  return "home-v2";
}

export type OnboardingVariant = "legacy" | "v2";

export function resolveOnboardingVariant(input: {
  onboardingV2Enabled: boolean;
}): OnboardingVariant {
  return input.onboardingV2Enabled ? "v2" : "legacy";
}
