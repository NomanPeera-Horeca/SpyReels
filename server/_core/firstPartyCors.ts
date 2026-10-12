import type { NextFunction, Request, Response } from "express";
import {
  SPYREELS_APP_ORIGIN_DEFAULT,
  SPYREELS_SITE_ORIGIN,
} from "../../shared/spyreelsOrigins";

/**
 * Credentialed CORS for first-party browser calls from apex marketing
 * (spyreels.ai) to the product API host (app.spyreels.ai).
 *
 * SameSite=Lax + Domain=.spyreels.ai already share the session cookie
 * across those hosts; browsers still require explicit ACAO/ACAC headers
 * because the hosts are cross-origin.
 */

const PROD_ORIGINS = new Set([
  SPYREELS_SITE_ORIGIN,
  "https://www.spyreels.ai",
  SPYREELS_APP_ORIGIN_DEFAULT,
]);

const DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
]);

function allowedOrigins(): Set<string> {
  const allowed = new Set(PROD_ORIGINS);
  const site = process.env.SPYREELS_SITE_URL?.trim().replace(/\/$/, "");
  const app = process.env.SPYREELS_APP_ORIGIN?.trim().replace(/\/$/, "");
  if (site) allowed.add(site);
  if (app) allowed.add(app);
  if (process.env.NODE_ENV !== "production") {
    for (const origin of DEV_ORIGINS) allowed.add(origin);
  }
  return allowed;
}

function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins().has(origin);
}

const DEFAULT_ALLOW_HEADERS = [
  "content-type",
  "x-workspace-id",
  "trpc-accept",
  "x-trpc-source",
].join(", ");

export function firstPartyApiCors(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.path.startsWith("/api")) return next();

  const origin = req.headers.origin;
  if (typeof origin === "string" && isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    const requested = req.headers["access-control-request-headers"];
    res.setHeader(
      "Access-Control-Allow-Headers",
      typeof requested === "string" && requested.trim()
        ? requested
        : DEFAULT_ALLOW_HEADERS
    );
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }
  }

  return next();
}
