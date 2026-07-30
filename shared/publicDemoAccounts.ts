/**
 * Curated handles the logged-out reel finder landing page may preview through
 * `featured.publicDemo`. Hardcoded rather than derived from `featured_accounts`
 * so adding a catalog account never silently widens what unauthenticated
 * visitors can read. First entry is the default when no (or an unrecognised)
 * handle is requested.
 */
export const PUBLIC_DEMO_HANDLES = [
  "garyvee",
  "humphreytalks",
  "russellbrunson",
  "codiesanchez",
] as const;

export const PUBLIC_DEMO_REEL_LIMIT = 8;

export function isPublicDemoHandle(handle: string): boolean {
  return (PUBLIC_DEMO_HANDLES as readonly string[]).includes(handle);
}
