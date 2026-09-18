import type { Express, Request, Response } from "express";
import { executeSpyReelsAiTool, listSpyReelsAiTools } from "./execute";
import {
  AiGatewayBearerAuthError,
  authenticateAiGatewayRequest,
  sendAiGatewayBearerChallenge,
} from "./oauth/authenticate";
import {
  AI_GATEWAY_OPENAPI_PATH,
  AI_GATEWAY_REST_BASE_PATH,
  buildAiGatewayOpenApiDocument,
} from "./openapi";

function statusForError(code: string): number {
  switch (code) {
    case "INVALID_INPUT":
      return 400;
    case "UNAUTHENTICATED":
      return 401;
    case "INSUFFICIENT_SCOPE":
      return 403;
    case "CLARIFICATION_REQUIRED":
      return 400;
    case "TOOL_NOT_FOUND":
    case "NOT_FOUND":
      return 404;
    case "PRIVATE_ACCOUNT":
      return 409;
    case "USAGE_LIMIT_REACHED":
      return 429;
    case "UPSTREAM_UNAVAILABLE":
      return 502;
    default:
      return 500;
  }
}

async function requireReadAccess(req: Request, res: Response) {
  try {
    return await authenticateAiGatewayRequest(req, ["spyreels:read"]);
  } catch (error) {
    if (error instanceof AiGatewayBearerAuthError) {
      sendAiGatewayBearerChallenge(res, error);
      return null;
    }
    console.error(
      "[ai-gateway] REST authentication failed",
      error instanceof Error ? error.message : String(error)
    );
    res.status(500).json({
      error: "internal_error",
      message: "SpyReels could not authenticate this request.",
    });
    return null;
  }
}

export function registerAiRestRoutes(app: Express): void {
  app.get(AI_GATEWAY_OPENAPI_PATH, (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(buildAiGatewayOpenApiDocument());
  });

  app.get(`${AI_GATEWAY_REST_BASE_PATH}/tools`, async (req: Request, res: Response) => {
    const authenticated = await requireReadAccess(req, res);
    if (!authenticated) return;

    res.json({
      tools: listSpyReelsAiTools(),
      meta: {
        requestId: authenticated.context.requestId,
        source: authenticated.context.source,
      },
    });
  });

  app.post(
    `${AI_GATEWAY_REST_BASE_PATH}/tools/:toolName`,
    async (req: Request, res: Response) => {
      const authenticated = await requireReadAccess(req, res);
      if (!authenticated) return;

      const toolName = req.params.toolName?.trim() || "";
      const result = await executeSpyReelsAiTool(
        toolName,
        req.body ?? {},
        authenticated.context
      );

      if (!result.ok) {
        res.status(statusForError(result.error.code)).json(result);
        return;
      }

      res.json(result);
    }
  );
}
