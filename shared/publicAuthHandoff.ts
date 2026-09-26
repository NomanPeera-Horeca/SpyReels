/**
 * Canonical auth handoff for public marketing CTAs.
 *
 * Relative path is `/?auth=login|signup&returnTo=…`.
 * When SPYREELS_APP_HOST_SPLIT is on, callers should prefix with the product
 * origin (https://app.spyreels.ai) so OAuth and session stay on the app host.
 * Apex Express also 302s `/?auth=` to the app host as a safety net.
 */

export const PUBLIC_AUTH_HANDOFF_PATH = "/";
export const PUBLIC_AUTH_DEFAULT_RETURN_TO = "/research";

export type PublicAuthMode = "login" | "signup";

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return undefined;
}

/** Map legacy homepage query flags to auth mode. */
export function legacyHomepageAuthMode(query: Record<string, unknown>): PublicAuthMode | null {
  const signup = firstQueryValue(query.signup);
  if (signup === "1" || signup === "true") return "signup";
  const login = firstQueryValue(query.login);
  if (login === "1" || login === "true") return "login";
  return null;
}

export function publicAuthHandoffPath(
  mode: PublicAuthMode,
  returnTo: string = PUBLIC_AUTH_DEFAULT_RETURN_TO
): string {
  const params = new URLSearchParams({
    auth: mode,
    returnTo,
  });
  return `${PUBLIC_AUTH_HANDOFF_PATH}?${params.toString()}`;
}
