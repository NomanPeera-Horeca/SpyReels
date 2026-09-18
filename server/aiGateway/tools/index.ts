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
      "Generate a new script from one exact public Instagram Reel URL using the same SpyReels remake engine as the app. Pass the user's actual remake wording in instruction. Do not choose an internal mode yourself. SpyReels resolves whether the request means keep the same topic, adapt to the connected creator profile, or use an explicit new angle. Only when the user's wording is genuinely vague, such as only 'remake this', ask one short natural clarification. Do not add a niche or topic the user did not state. This action can consume normal SpyReels transcription/remake usage and never publishes content automatically.",
    category: "creation",
    auth: "required",
    readOnly: false,
    requiredScope: "spyreels:create",
    inputSchema: z
      .object({
        url: z.string().trim().min(1).max(2048),
        instruction: z
          .string()
          .trim()
          .min(1)
          .max(2000)
          .optional()
          .describe(
            "Preferred field. Copy the user's actual remake instruction as closely as possible, excluding the Reel URL. Do not add, infer, or paraphrase a niche, topic, or angle that the user did not state. SpyReels resolves intent itself and requests clarification when the instruction is ambiguous."
          ),
        mode: z
          .enum(["custom", "same_topic", "niche"])
          .optional()
          .describe(
            "Deprecated compatibility field for AI hosts that cached the older tool schema. Do not use for new calls."
          ),
        angle: z
          .string()
          .trim()
          .min(1)
          .max(2000)
          .optional()
          .describe(
            "Deprecated compatibility field. Only used with legacy mode=custom."
          ),
        gradeLevel: z
          .enum(["auto", "2", "3", "4", "5", "6", "7", "8"])
          .default("auto"),
      })
      .superRefine((value, ctx) => {
        if (value.instruction?.trim()) return;

        if (value.mode === "same_topic") return;

        if (value.mode === "custom" && value.angle?.trim()) return;

        if (value.mode === "niche") {
          ctx.addIssue({
            code: "custom",
            path: ["instruction"],
            message:
              "This connector is using an older cached remake schema. Refresh or reconnect SpyReels, then retry so SpyReels can verify that adapt-to-niche was explicitly requested.",
          });
          return;
        }

        ctx.addIssue({
          code: "custom",
          path: ["instruction"],
          message:
            "Provide the user's actual remake instruction. A bare remake request must be clarified before generation.",
        });
      }),
    execute: async (context, input) => {
      const effectiveInstruction =
        input.instruction?.trim() ||
        (input.mode === "same_topic"
          ? "keep the same topic"
          : input.mode === "custom" && input.angle?.trim()
            ? `make this about ${input.angle.trim()}`
            : "");

      return remakeReelUrl({
        actor: requireActor(context),
        url: input.url,
        instruction: effectiveInstruction,
        gradeLevel: input.gradeLevel,
      });
    },
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
