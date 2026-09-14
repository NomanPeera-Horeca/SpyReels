import type { Express } from "express";
import { registerAiMcpRoute } from "./mcp";
import {
  assertAiGatewayConfiguration,
  isAiGatewayEnabled,
} from "./oauth/config";
import { registerAiOAuthRoutes } from "./oauth/routes";

/**
 * Register every externally reachable AI Gateway route in one place.
 * The feature flag defaults off, so merging the code alone cannot expose
 * OAuth or MCP endpoints in production.
 */
export function registerAiGatewayRoutes(app: Express): boolean {
  if (!isAiGatewayEnabled()) {
    return false;
  }

  assertAiGatewayConfiguration();
  registerAiOAuthRoutes(app);
  registerAiMcpRoute(app);
  console.log("[ai-gateway] OAuth + MCP routes registered");
  return true;
}
