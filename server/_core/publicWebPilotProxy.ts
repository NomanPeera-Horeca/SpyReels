import type { Express, NextFunction, Request, Response } from "express";
import http from "node:http";
import https from "node:https";
import { COOKIE_NAME } from "../../shared/const";
import { parse as parseCookieHeader } from "cookie";
import { sdk } from "./sdk";

export const VIRAL_REEL_FINDER_PILOT_PATH = "/features/viral-reel-finder";
export const VIRAL_REEL_FINDER_DEMO_PATH = "/features/viral-reel-finder/demo";
export const VIRAL_REEL_FINDER_PROFILE_PATH = "/features/viral-reel-finder/profile";
const NEXT_ASSET_PREFIX = "/_next/";
const HOMEPAGE_ASSET_PREFIX = "/marketing/";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export type PublicWebPilotConfig = {
  enabled: boolean;
  homepageEnabled?: boolean;
  origin: string | null;
  timeoutMs: number;
};

export function getPublicWebPilotConfig(
  env: NodeJS.ProcessEnv = process.env
): PublicWebPilotConfig {
  const rawOrigin = env.SPYREELS_PUBLIC_WEB_ORIGIN?.trim();
  const rawTimeout = Number(env.SPYREELS_PUBLIC_WEB_TIMEOUT_MS ?? "5000");

  return {
    enabled: env.SPYREELS_PUBLIC_WEB_PILOT === "true",
    homepageEnabled: env.SPYREELS_PUBLIC_WEB_HOME === "true",
    origin: rawOrigin ? rawOrigin.replace(/\/$/, "") : null,
    timeoutMs: Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 5000,
  };
}

function normalizedPath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/$/, "");
}

export function isPublicWebPilotRequest(
  pathname: string,
  method: string,
  config: PublicWebPilotConfig
): boolean {
  if (!config.enabled || !config.origin) return false;
  if (method !== "GET" && method !== "HEAD") return false;

  const path = normalizedPath(pathname);
  return (
    (config.homepageEnabled === true && path === "/") ||
    path === VIRAL_REEL_FINDER_PILOT_PATH ||
    path === VIRAL_REEL_FINDER_DEMO_PATH ||
    path === VIRAL_REEL_FINDER_PROFILE_PATH ||
    pathname.startsWith(NEXT_ASSET_PREFIX) ||
    (config.homepageEnabled === true && pathname.startsWith(HOMEPAGE_ASSET_PREFIX))
  );
}

function copyUpstreamHeaders(upstream: http.IncomingMessage, res: Response): void {
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (value == null || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue;
    res.setHeader(name, value);
  }
  res.setHeader("X-SpyReels-Renderer", "public-web-next");
}

function proxyRequest(
  req: Request,
  res: Response,
  next: NextFunction,
  config: PublicWebPilotConfig
): void {
  if (!config.origin) {
    next();
    return;
  }

  let target: URL;
  try {
    target = new URL(req.originalUrl, `${config.origin}/`);
  } catch (error) {
    console.error("[PublicWeb] Invalid SPYREELS_PUBLIC_WEB_ORIGIN:", error);
    next();
    return;
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    console.error(`[PublicWeb] Unsupported public web protocol: ${target.protocol}`);
    next();
    return;
  }

  const requestHost = (req.headers["x-forwarded-host"] || req.headers.host || "")
    .toString()
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  if (requestHost && requestHost === target.host.toLowerCase()) {
    console.error("[PublicWeb] Refusing to proxy pilot route back to the same host.");
    next();
    return;
  }

  const headers: http.OutgoingHttpHeaders = { ...req.headers };
  for (const header of HOP_BY_HOP_HEADERS) delete headers[header];
  delete headers["content-length"];
  headers.host = target.host;
  headers["x-forwarded-host"] = requestHost || req.headers.host || "";
  headers["x-forwarded-proto"] = req.protocol;

  const transport = target.protocol === "https:" ? https : http;
  let settled = false;

  const upstreamRequest = transport.request(
    target,
    {
      method: req.method,
      headers,
    },
    (upstreamResponse) => {
      if (
        (normalizedPath(req.path) === VIRAL_REEL_FINDER_PILOT_PATH ||
          (config.homepageEnabled && normalizedPath(req.path) === "/")) &&
        (upstreamResponse.statusCode ?? 500) >= 500
      ) {
        upstreamResponse.resume();
        if (!settled) {
          settled = true;
          console.error(
            `[PublicWeb] Pilot renderer returned ${upstreamResponse.statusCode}; falling back to Vite.`
          );
          next();
        }
        return;
      }

      settled = true;
      res.statusCode = upstreamResponse.statusCode ?? 502;
      copyUpstreamHeaders(upstreamResponse, res);
      upstreamResponse.pipe(res);
    }
  );

  upstreamRequest.setTimeout(config.timeoutMs, () => {
    upstreamRequest.destroy(new Error(`Public web renderer timed out after ${config.timeoutMs}ms`));
  });

  upstreamRequest.on("error", (error) => {
    if (settled || res.headersSent) return;
    settled = true;
    console.error("[PublicWeb] Pilot proxy failed; falling back to existing renderer:", error);
    next();
  });

  req.on("aborted", () => upstreamRequest.destroy());
  upstreamRequest.end();
}

/**
 * Registers the reversible public-web pilot handoff before the Vite/static SPA
 * fallback. Disabled by default. Enabling it requires both:
 *
 *   SPYREELS_PUBLIC_WEB_PILOT=true
 *   SPYREELS_PUBLIC_WEB_ORIGIN=http(s)://<public-web-service>
 *
 * The homepage is opted in separately with SPYREELS_PUBLIC_WEB_HOME=true.
 * Authentication query links stay on the existing SPA until auth is migrated.
 */
export function registerPublicWebPilotProxy(
  app: Express,
  config: PublicWebPilotConfig = getPublicWebPilotConfig()
): void {
  if (!config.enabled) return;
  if (!config.origin) {
    console.warn(
      "[PublicWeb] SPYREELS_PUBLIC_WEB_PILOT=true but SPYREELS_PUBLIC_WEB_ORIGIN is missing; pilot remains off."
    );
    return;
  }

  console.log(
    `[PublicWeb] Pilot routing enabled for ${VIRAL_REEL_FINDER_PILOT_PATH}${config.homepageEnabled ? " and /" : ""} -> ${config.origin}`
  );

  if (config.homepageEnabled) {
    // An older PWA worker cached the SPA navigation shell. Its script URL now
    // falls through to that shell, so it cannot update itself and continues to
    // intercept visits to /. Replace it with a network-only worker. Product
    // routes remain available online through the existing Express app.
    app.get("/sw.js", (_req, res) => {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.send(
        "self.addEventListener('install', () => self.skipWaiting());\n" +
          "self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));\n"
      );
    });
  }

  app.use(async (req, res, next) => {
    if (req.path === "/" && (req.query.signup === "1" || req.query.login === "1")) {
      next();
      return;
    }
    // A signed token alone does not prove the account still exists. Use the
    // same authentication check as product APIs before routing into the SPA.
    if (req.path === "/" && req.headers.cookie) {
      const token = parseCookieHeader(req.headers.cookie)[COOKIE_NAME];
      if (token) {
        try {
          if (await sdk.authenticateRequest(req)) {
            next();
            return;
          }
        } catch (error) {
          console.warn("[PublicWeb] Session check failed; serving public homepage:", error);
        }
      }
    }
    if (!isPublicWebPilotRequest(req.path, req.method, config)) {
      next();
      return;
    }
    proxyRequest(req, res, next, config);
  });
}
