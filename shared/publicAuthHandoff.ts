/**
 * Canonical auth handoff for public marketing CTAs.
 *
 * AuthDialog lives on SPA public pages that mount PublicHeader (e.g. /pricing),
 * opened via ?auth=login|signup. Do not use /?login=1 or /?signup=1; those used
 * to dump users onto the retired Vite homepage shell.
 */

export const PUBLIC_AUTH_HANDOFF_PATH = "/pricing";
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
