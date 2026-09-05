/** Workbox navigate-fallback contract for the existing Vite SPA service worker. */
export const SPA_NAVIGATE_FALLBACK = "/index.html";

export const SPA_NAVIGATE_FALLBACK_DENYLIST: RegExp[] = [
  /^\/api\//,
  /^\/_next\//,
  /^\/features\/viral-reel-finder(?:\/.*)?$/,
];

export function shouldUseSpaNavigateFallback(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] || "/";
  return !SPA_NAVIGATE_FALLBACK_DENYLIST.some((pattern) => pattern.test(path));
}
