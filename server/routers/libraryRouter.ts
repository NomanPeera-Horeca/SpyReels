import { z } from "zod";
import { getLibraryScripts, getLibraryTranscripts } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const libraryRouter = router({
  transcripts: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      source: z.enum(["scraped", "collected"]).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const opts = input || {};
      return getLibraryTranscripts(ctx.workspaceId, opts);
    }),

  scripts: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      source: z.enum(["saved", "recreated", "idea"]).optional(),
      status: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional())
    .query(async ({ ctx, input }) => {
      const opts = input || {};
      return getLibraryScripts(ctx.workspaceId, opts);
    }),
});