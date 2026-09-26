import { isPrivateAppPath, normalizePublicPathname } from "./publicPageMeta";
import { isPublicWebPath } from "./publicRouteOwnership";

/**
 * Site (marketing) vs app (product) origins for the SpyReels host split.
 *
 * When SPYREELS_APP_HOST_SPLIT=true:
 *   - Marketing: https://spyreels.ai
 *   - Product + OAuth: https://app.spyreels.ai
 *
 * When the flag is off (default), both stay on apex for backward compatibility.
 */

export const SPYREELS_SITE_ORIGIN = "https://spyreels.ai";
export const SPYREELS_APP_HOST = "app.spyreels.ai";
export const SPYREELS_APP_ORIGIN_DEFAULT = `https://${SPYREELS_APP_HOST}`;

export function isAppHostSplitEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = env.SPYREELS_APP_HOST_SPLIT?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function hostnameOf(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeRequestHost(rawHost: string | null | undefined): string {
  if (!rawHost) return "";
  return (
    rawHost
      .toString()
      .split(",")[0]
      ?.trim()
      .toLowerCase()
      .replace(/:\d+$/, "")
      .replace(/^www\./, "") ?? ""
  );
}

export function isSpyReelsApexHost(host: string): boolean {
  return normalizeRequestHost(host) === "spyreels.ai";
}

export function isSpyReelsAppHost(host: string): boolean {
  return normalizeRequestHost(host) === SPYREELS_APP_HOST;
}

export function isSpyReelsProductionHost(host: string): boolean {
  const h = normalizeRequestHost(host);
  return h === "spyreels.ai" || h === SPYREELS_APP_HOST;
}

/** Marketing / SEO canonical origin (always apex in production). */
export function siteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SPYREELS_SITE_URL?.trim();
  if (configured) {
    const host = hostnameOf(configured);
    if (host === "spyreels.ai" || host === "www.spyreels.ai") {
      return SPYREELS_SITE_ORIGIN;
    }
    return stripTrailingSlash(
      configured.includes("://") ? configured : `https://${configured}`
    );
  }
  return SPYREELS_SITE_ORIGIN;
}

/**
 * Product / OAuth origin.
 * Split on → app.spyreels.ai (or SPYREELS_APP_ORIGIN).
 * Split off → apex (legacy single-host).
 */
export function appOrigin(env: NodeJS.ProcessEnv = process.env): string {
  if (!isAppHostSplitEnabled(env)) {
    const oauth = env.OAUTH_SERVER_URL?.trim();
    if (oauth) return stripTrailingSlash(oauth);
    return siteOrigin(env);
  }

  const configured = env.SPYREELS_APP_ORIGIN?.trim();
  if (configured) {
    const host = hostnameOf(configured);
    if (host === SPYREELS_APP_HOST || host === "spyreels.ai") {
      return SPYREELS_APP_ORIGIN_DEFAULT;
    }
    return stripTrailingSlash(
      configured.includes("://") ? configured : `https://${configured}`
    );
  }

  return SPYREELS_APP_ORIGIN_DEFAULT;
}

/** Absolute URL on the product host. */
export function appAbsoluteUrl(
  pathAndQuery: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const path =
    pathAndQuery.startsWith("/") || pathAndQuery === ""
      ? pathAndQuery || "/"
      : `/${pathAndQuery}`;
  return `${appOrigin(env)}${path}`;
}

/**
 * Paths that must run on the product host when the split is enabled.
 * Includes private app routes and /api (except auth endpoints used by the
 * marketing homepage modal on apex).
 *
 * Auth query on `/` stays on apex so the Next homepage modal opens over the
 * new marketing UI; after login the client sends users to the app host.
 */
export function shouldRedirectApexPathToApp(
  pathname: string,
  search: string = ""
): boolean {
  const normalized = normalizePublicPathname(pathname);

  if (normalized === "/") {
    return false;
  }

  // Marketing auth modal posts to these from apex; keep them same-origin.
  if (
    normalized === "/api/auth" ||
    normalized.startsWith("/api/auth/") ||
    normalized === "/api/oauth" ||
    normalized.startsWith("/api/oauth/")
  ) {
    return false;
  }

  if (normalized === "/viral-posts" || normalized.startsWith("/viral-posts/")) {
    return true;
  }

  return isPrivateAppPath(normalized);
}

/**
 * Marketing paths that must not render on the product host.
 * Redirect to apex so app.spyreels.ai never shows Vite marketing chrome.
 */
export function shouldRedirectAppPathToSite(pathname: string): boolean {
  const normalized = normalizePublicPathname(pathname);
  if (normalized === "/") return false; // handled separately (research vs marketing home)
  if (isPublicWebPath(normalized)) return true;
  // Legacy / alias marketing entry that still appears in product chrome.
  if (normalized === "/hooks" || normalized.startsWith("/hooks/")) return true;
  return false;
}
