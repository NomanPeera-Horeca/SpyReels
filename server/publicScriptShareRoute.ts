import type { Express, Request, Response, NextFunction } from "express";
import { recordPublicShareView } from "./scriptShareLinks";
import {
  clientIpFromRequest,
  isPublicIpRateLimited,
} from "./publicRateLimit";

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

      const ip = clientIpFromRequest(req);
      if (isPublicIpRateLimited(ip)) {
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
