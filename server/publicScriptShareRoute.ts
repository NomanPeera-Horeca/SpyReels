import type { Express, Request, Response, NextFunction } from "express";
import { recordPublicShareView } from "./scriptShareLinks";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 60;

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return req.socket.remoteAddress ?? "unknown";
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

function wantsJsonResponse(req: Request): boolean {
  if (req.query.format === "json") return true;
  const accept = req.headers.accept ?? "";
  return accept.includes("application/json") && !accept.startsWith("text/html");
}

function sendNotFound(res: Response): void {
  res.status(404).json({
    error: "not_found",
    message: "This link is invalid or has been revoked.",
  });
}

export function registerPublicScriptShareRoutes(app: Express): void {
  app.get(
    "/s/:token",
    async (req: Request, res: Response, next: NextFunction) => {
      if (!wantsJsonResponse(req)) {
        return next();
      }

      const ip = clientIp(req);
      if (isRateLimited(ip)) {
        res.status(429).json({
          error: "rate_limited",
          message: "Too many requests. Please try again in a minute.",
        });
        return;
      }

      const token = typeof req.params.token === "string" ? req.params.token.trim() : "";
      if (!token || token.length > 32) {
        sendNotFound(res);
        return;
      }

      try {
        const script = await recordPublicShareView(token);
        if (!script) {
          sendNotFound(res);
          return;
        }
        res.json({ script });
      } catch (error) {
        console.error("[PublicScriptShare] Error:", error);
        res.status(500).json({
          error: "server_error",
          message: "Unable to load this script right now.",
        });
      }
    }
  );
}
