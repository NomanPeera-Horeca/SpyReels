import type { Express, NextFunction, Request, Response } from "express";
import http from "node:http";
import https from "node:https";

export const VIRAL_REEL_FINDER_PILOT_PATH = "/features/viral-reel-finder";
const NEXT_ASSET_PREFIX = "/_next/";

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
  return path === VIRAL_REEL_FINDER_PILOT_PATH || pathname.startsWith(NEXT_ASSET_PREFIX);
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

  // Guard against accidentally pointing the proxy back at the same public host.
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
      // The pilot page fails open to the existing Vite renderer. This means a
      // public-web outage does not take the current production landing page down.
      if (
        normalizedPath(req.path) === VIRAL_REEL_FINDER_PILOT_PATH &&
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
 * Only the Viral Reel Finder and its Next.js /_next assets are proxied.
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
    `[PublicWeb] Pilot routing enabled for ${VIRAL_REEL_FINDER_PILOT_PATH} -> ${config.origin}`
  );

  app.use((req, res, next) => {
    if (!isPublicWebPilotRequest(req.path, req.method, config)) {
      next();
      return;
    }
    proxyRequest(req, res, next, config);
  });
}
