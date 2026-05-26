import { parseDiscoveryV1Enabled } from "@shared/discoveryFeatureFlag";

declare const __DISCOVERY_V1_ENABLED__: boolean;

/** Set at build time from DISCOVERY_V1_ENABLED / VITE_DISCOVERY_V1_ENABLED (see vite.config.ts). */
export const isDiscoveryV1Enabled: boolean =
  typeof __DISCOVERY_V1_ENABLED__ !== "undefined"
    ? __DISCOVERY_V1_ENABLED__
    : parseDiscoveryV1Enabled(
        import.meta.env.VITE_DISCOVERY_V1_ENABLED,
        import.meta.env.PROD ? "production" : "development"
      );
