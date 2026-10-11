/** Workbox navigate-fallback contract for the existing Vite SPA service worker. */
export const SPA_NAVIGATE_FALLBACK = "/index.html";

export const SPA_NAVIGATE_FALLBACK_DENYLIST: RegExp[] = [
  /^\/api\//,
  // OAuth login continuation is a real server route. Never let the SPA/PWA
  // service worker swallow it, otherwise ChatGPT reconnects land on the app 404.
  /^\/ai\/oauth\//,
  /^\/_next\//,
  /^\/features\/viral-reel-finder(?:\/.*)?$/,
  /^\/free-tools\/?$/,
];

export function shouldUseSpaNavigateFallback(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] || "/";
  return !SPA_NAVIGATE_FALLBACK_DENYLIST.some((pattern) => pattern.test(path));
}
