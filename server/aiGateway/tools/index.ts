import { z } from "zod";
import { AiGatewayError } from "../errors";
import { AiGatewayRegistry } from "../registry";
import { getAccountUsage } from "../services/account";
import { findCreator, findTopContent } from "../services/creatorResearch";
import { inspectReelUrl, transcribeReelUrl } from "../services/reelResearch";
import { remakeReelUrl } from "../services/remakeReel";
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
    title: "Rank creator Reels from a bounded sample",
    description:
      "Fetch a bounded sample of a public Instagram creator's Reels and rank that analyzed sample by views or engagement. The result includes sample size and date range and must not be described as the creator's absolute all-time top Reels.",
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
    name: "inspect_reel",
    title: "Inspect an Instagram Reel",
    description:
      "Inspect one exact public Instagram Reel URL and return verified creator, caption, performance metrics, duration and posting metadata for that Reel.",
    category: "research",
    auth: "required",
    readOnly: true,
    inputSchema: z.object({
      url: z.string().trim().min(1).max(2048),
    }),
    execute: async (_context, input) => inspectReelUrl(input.url),
  });

  registry.register({
    name: "transcribe_reel",
    title: "Transcribe an Instagram Reel",
    description:
      "Transcribe the spoken audio from one exact public Instagram Reel URL. Reuses an existing SpyReels transcript when available; otherwise consumes the connected account's normal transcription quota.",
    category: "analysis",
    auth: "required",
    readOnly: true,
    inputSchema: z.object({
      url: z.string().trim().min(1).max(2048),
    }),
    execute: async (context, input) =>
      transcribeReelUrl({
        actor: requireActor(context),
        url: input.url,
      }),
  });

  registry.register({
    name: "remake_reel",
    title: "Remake an Instagram Reel",
    description:
      "Generate a new script from one exact public Instagram Reel URL using the same SpyReels remake engine as the app. Infer the user's remake intent naturally when it is clear; do not ask unnecessary setup questions. Map requests like 'keep the same topic' to same_topic. Map an explicit new subject or angle such as 'make this about menu engineering' to custom and pass that direction in angle. Map requests such as 'remake this for me', 'make this my version', 'adapt this to my niche', or 'remake this similarly for me' to niche so SpyReels uses the connected creator profile. If the user explicitly names a different niche or audience, treat that wording as an explicit custom direction so it is not overridden by the saved profile. Only when the user gives no usable direction, for example only 'remake this', ask one short natural clarification based on the three SpyReels choices: use my idea, keep this topic, or adapt to my niche. Do not mechanically list choices when the intent is already clear. custom requires angle. This action can consume normal SpyReels transcription/remake usage and never publishes content automatically.",
    category: "creation",
    auth: "required",
    readOnly: false,
    requiredScope: "spyreels:create",
    inputSchema: z.object({
      url: z.string().trim().min(1).max(2048),
      instruction: z
        .string()
        .trim()
        .min(1)
        .max(2000)
        .describe(
          "Copy the user's actual remake instruction as closely as possible, excluding the Reel URL. Do not add, infer, or paraphrase a niche, topic, or angle that the user did not state. SpyReels resolves the mode itself and will request clarification when the instruction is ambiguous."
        ),
      gradeLevel: z
        .enum(["auto", "2", "3", "4", "5", "6", "7", "8"])
        .default("auto"),
    }),
    execute: async (context, input) =>
      remakeReelUrl({
        actor: requireActor(context),
        url: input.url,
        instruction: input.instruction,
        gradeLevel: input.gradeLevel,
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
