import { z } from "zod";
import { AiGatewayError } from "../errors";
import { AiGatewayRegistry } from "../registry";
import { getAccountUsage } from "../services/account";
import { findCreator, findTopContent } from "../services/creatorResearch";
import type { AiGatewayActor, AiGatewayContext } from "../types";

function requireActor(context: AiGatewayContext): AiGatewayActor {
  if (!context.actor) {
    throw new AiGatewayError({
      code: "UNAUTHENTICATED",
      message: "Connect your SpyReels account to use this tool.",
      retryable: false,
    });
  }
  return context.actor;
}

const handleSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  // Zod 4 overwrite preserves the string schema for MCP JSON Schema export.
  .overwrite((value) => value.replace(/^@/, ""));

export function createSpyReelsAiToolRegistry(): AiGatewayRegistry {
  const registry = new AiGatewayRegistry();

  registry.register({
    name: "find_creator",
    title: "Find Instagram creator",
    description:
      "Resolve a public Instagram handle and return the canonical creator profile before doing deeper research.",
    category: "research",
    auth: "required",
    readOnly: true,
    inputSchema: z.object({ handle: handleSchema }),
    execute: async (_context, input) => findCreator(input.handle),
  });

  registry.register({
    name: "find_top_content",
    title: "Find top creator Reels",
    description:
      "Research a public Instagram creator and rank their strongest recent Reels by views or engagement.",
    category: "research",
    auth: "required",
    readOnly: true,
    inputSchema: z.object({
      handle: handleSchema,
      limit: z.number().int().min(1).max(10).default(5),
      rankBy: z.enum(["views", "engagement"]).default("views"),
    }),
    execute: async (context, input) =>
      findTopContent({
        actor: requireActor(context),
        handle: input.handle,
        limit: input.limit,
        rankBy: input.rankBy,
      }),
  });

  registry.register({
    name: "get_usage",
    title: "Get SpyReels access and usage",
    description:
      "Return the connected user's effective SpyReels access and usage. Treat access as authoritative: owner/admin accounts can have unlimited usage even when historical billing metadata shows a free or cancelled subscription.",
    category: "account",
    auth: "required",
    readOnly: true,
    inputSchema: z.object({}).strict(),
    execute: async (context) => getAccountUsage(requireActor(context)),
  });

  return registry;
}

export const spyReelsAiTools = createSpyReelsAiToolRegistry();
