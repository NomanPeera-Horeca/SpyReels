import { parseDiscoveryV1Enabled } from "@shared/discoveryFeatureFlag";

export { DISCOVERY_NOT_ENABLED_MESSAGE } from "@shared/discoveryFeatureFlag";

export const isDiscoveryV1Enabled = parseDiscoveryV1Enabled(
  process.env.DISCOVERY_V1_ENABLED,
  process.env.NODE_ENV
);
