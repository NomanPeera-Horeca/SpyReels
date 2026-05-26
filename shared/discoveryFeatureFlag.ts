/** Parsed from DISCOVERY_V1_ENABLED (or VITE_DISCOVERY_V1_ENABLED at build time). */
export const DISCOVERY_NOT_ENABLED_MESSAGE = "Discovery is not enabled";

export function parseDiscoveryV1Enabled(
  raw: string | undefined,
  nodeEnv: string | undefined
): boolean {
  if (raw === undefined || raw.trim() === "") {
    return nodeEnv !== "production";
  }
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return nodeEnv !== "production";
}
