import { parseDiscoveryV1Enabled } from "@shared/discoveryFeatureFlag";
import { resolveHomeV2Flags } from "@shared/homeV2FeatureFlags";

declare const __DISCOVERY_V1_ENABLED__: boolean;
declare const __HOME_V2_ENABLED__: boolean;
declare const __ONBOARDING_V2_ENABLED__: boolean;

/** Set at build time from DISCOVERY_V1_ENABLED / VITE_DISCOVERY_V1_ENABLED (see vite.config.ts). */
export const isDiscoveryV1Enabled: boolean =
  typeof __DISCOVERY_V1_ENABLED__ !== "undefined"
    ? __DISCOVERY_V1_ENABLED__
    : parseDiscoveryV1Enabled(
        import.meta.env.VITE_DISCOVERY_V1_ENABLED,
        import.meta.env.PROD ? "production" : "development"
      );

const homeV2FallbackFlags = resolveHomeV2Flags({
  homeV2Raw: import.meta.env.VITE_HOME_V2_ENABLED,
  onboardingV2Raw: import.meta.env.VITE_ONBOARDING_V2_ENABLED,
});

/**
 * New onboarding. Set at build time from ONBOARDING_V2_ENABLED (see vite.config.ts).
 * Default: false in every environment.
 */
export const isOnboardingV2Enabled: boolean =
  typeof __ONBOARDING_V2_ENABLED__ !== "undefined"
    ? __ONBOARDING_V2_ENABLED__
    : homeV2FallbackFlags.onboardingV2Enabled;

/**
 * Home v2 at "/". Set at build time from HOME_V2_ENABLED, and only true when
 * the new onboarding flag is also on. Default: false in every environment.
 */
export const isHomeV2Enabled: boolean =
  typeof __HOME_V2_ENABLED__ !== "undefined"
    ? __HOME_V2_ENABLED__
    : homeV2FallbackFlags.homeV2Enabled;
