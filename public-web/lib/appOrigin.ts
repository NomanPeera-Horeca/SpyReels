import {
  appOrigin as sharedAppOrigin,
  isAppHostSplitEnabled,
  SPYREELS_APP_ORIGIN_DEFAULT,
  SPYREELS_SITE_ORIGIN,
  siteOrigin as sharedSiteOrigin,
} from "../../shared/spyreelsOrigins";

/**
 * Public-web app origin for auth / research handoffs and upstream API calls.
 *
 * When SPYREELS_APP_HOST_SPLIT (or NEXT_PUBLIC_*) is on, product lives on
 * https://app.spyreels.ai. Otherwise stay on apex.
 */
function splitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SPYREELS_APP_HOST_SPLIT:
      process.env.SPYREELS_APP_HOST_SPLIT ||
      process.env.NEXT_PUBLIC_SPYREELS_APP_HOST_SPLIT,
    SPYREELS_APP_ORIGIN:
      process.env.SPYREELS_APP_ORIGIN ||
      process.env.NEXT_PUBLIC_SPYREELS_APP_ORIGIN,
    SPYREELS_SITE_URL:
      process.env.SPYREELS_SITE_URL || process.env.NEXT_PUBLIC_SPYREELS_SITE_URL,
  };
}

export function isPublicWebAppHostSplit(): boolean {
  return isAppHostSplitEnabled(splitEnv());
}

/** Browser-safe origin for auth / research handoffs. */
export function resolvePublicAppOrigin(opts?: {
  configured?: string | null;
  hostname?: string | null;
}): string {
  const env = splitEnv();
  if (opts?.configured?.trim()) {
    env.SPYREELS_APP_ORIGIN = opts.configured.trim();
  }
  if (!isAppHostSplitEnabled(env)) {
    // Legacy: stay on apex even if misconfigured app. subdomain is present.
    const host = (opts?.hostname ?? "").replace(/^www\./, "").toLowerCase();
    if (host === "spyreels.ai" || host === "localhost") {
      return SPYREELS_SITE_ORIGIN;
    }
    return sharedSiteOrigin(env);
  }
  return sharedAppOrigin(env);
}

/** Server-side origin for proxying to the main SpyReels API. */
export function resolveServerAppOrigin(): string {
  return resolvePublicAppOrigin();
}

export function resolvePublicSiteOrigin(): string {
  return sharedSiteOrigin(splitEnv());
}

export { SPYREELS_APP_ORIGIN_DEFAULT, SPYREELS_SITE_ORIGIN };
