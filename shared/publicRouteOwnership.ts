import {
  getStaticPublicPageSeo,
  isPrivateAppPath,
  normalizePublicPathname,
} from "./publicPageMeta";

export type SpyReelsRouteOwner = "public-web" | "app" | "system" | "not-found";

const SYSTEM_EXACT_PATHS = new Set(["/robots.txt", "/sitemap.xml", "/llms.txt"]);

/**
 * Single route-ownership contract for the SpyReels split architecture.
 *
 * public-web: SEO/acquisition pages that must be rendered as real HTML before JS.
 * app: authenticated/product SPA routes that stay in the existing Vite application.
 * system: APIs and machine-readable endpoints owned by Express/backend infrastructure.
 * not-found: anything that should resolve to a real 404 instead of the SPA shell.
 */
export function classifySpyReelsRoute(pathname: string): SpyReelsRouteOwner {
  const normalized = normalizePublicPathname(pathname);

  if (SYSTEM_EXACT_PATHS.has(normalized) || normalized === "/api" || normalized.startsWith("/api/")) {
    return "system";
  }

  // Blog authoring is part of the product/admin application, not the public website.
  if (isPrivateAppPath(normalized)) {
    return "app";
  }

  // Published blog slugs are dynamic, so they cannot be enumerated in static page metadata.
  if (normalized === "/blog" || /^\/blog\/[^/]+$/.test(normalized)) {
    return "public-web";
  }

  if (getStaticPublicPageSeo(normalized)) {
    return "public-web";
  }

  return "not-found";
}

export function isPublicWebPath(pathname: string): boolean {
  return classifySpyReelsRoute(pathname) === "public-web";
}

export function isProductAppPath(pathname: string): boolean {
  return classifySpyReelsRoute(pathname) === "app";
}
