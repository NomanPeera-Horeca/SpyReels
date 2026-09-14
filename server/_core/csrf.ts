import type { NextFunction, Request, Response } from "express";

/**
 * CSRF origin guard for cookie-authenticated /api routes.
 *
 * Defense in depth layered on top of SameSite=Lax session cookies: browsers
 * always attach an `Origin` header to cross-origin state-changing requests,
 * so if the origin does not match a known first-party host we reject the
 * request before it reaches the router.
 *
 * Requests without an `Origin` header (curl, server-to-server integrations,
 * some bots) are allowed through: those clients do not carry the victim's
 * cookies, so they cannot mount a CSRF attack. The same applies to routes
 * authenticated by signatures or bearer/OAuth credentials rather than a
 * browser session cookie.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Signature-verified webhooks, no cookie auth, CSRF does not apply. */
const SIGNED_WEBHOOK_PATHS = new Set([
  "/api/stripe/webhook",
  "/api/resend/webhook",
  "/api/telegram/webhook",
]);

/** Bearer-token-authenticated extension API, not cookie-authenticated. */
const BEARER_API_PREFIXES = ["/api/ext", "/api/extension"];

/**
 * OAuth token/revocation and MCP are external protocol endpoints. They use
 * client credentials, PKCE, refresh tokens, or bearer access tokens and must
 * remain callable by AI hosts that may send their own Origin header.
 * The authorization consent POST is intentionally NOT exempt because it is
 * browser-session authenticated and should retain first-party CSRF protection.
 */
const EXTERNAL_AI_AUTH_PATHS = new Set([
  "/api/ai/oauth/token",
  "/api/ai/oauth/revoke",
  "/api/ai/mcp",
]);

const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHost(host: string | undefined): string | null {
  if (!host) return null;
  const trimmed = host.trim().toLowerCase();
  if (!trimmed) return null;
  // Strip optional port (e.g. "localhost:3000" -> "localhost").
  return trimmed.replace(/:\d+$/, "");
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

export function csrfOriginGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.path.startsWith("/api")) return next();

  if (SIGNED_WEBHOOK_PATHS.has(req.path)) return next();
  if (BEARER_API_PREFIXES.some(prefix => req.path.startsWith(prefix))) return next();
  if (EXTERNAL_AI_AUTH_PATHS.has(req.path)) return next();

  const origin = req.headers.origin;
  // No Origin header = not a browser cross-origin request; allow through.
  if (!origin) return next();

  const originHost = hostFromUrl(origin);
  if (!originHost) {
    return res.status(403).json({ error: "Invalid cross-origin request" });
  }
  const normalizedOriginHost = normalizeHost(originHost) ?? originHost;

  const forwardedHost = req.headers["x-forwarded-host"];
  const rawHost = Array.isArray(forwardedHost)
    ? forwardedHost[0]
    : forwardedHost ?? req.headers.host;

  const requestHost = normalizeHost(rawHost);

  const allowedHosts = new Set<string>();
  if (requestHost) allowedHosts.add(requestHost);

  const canonical = process.env.OAUTH_SERVER_URL || process.env.SPYREELS_SITE_URL;
  const canonicalHost = canonical ? hostFromUrl(canonical) : null;
  if (canonicalHost) allowedHosts.add(canonicalHost);

  if (process.env.NODE_ENV !== "production") {
    for (const devHost of DEV_HOSTS) allowedHosts.add(devHost);
  }

  if (allowedHosts.has(normalizedOriginHost)) return next();

  res.status(403).json({ error: "Cross-origin request blocked" });
}
