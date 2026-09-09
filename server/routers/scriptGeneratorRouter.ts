import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { previewScriptGeneratorPack, claimScriptGeneratorToStudio } from "../scriptGeneratorPreview";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";

export const scriptGeneratorRouter = router({
    preview: publicProcedure
      .input(
        z.object({
          topic: z.string().min(10).max(800),
          platform: z.string().min(2).max(64),
          length: z.string().min(2).max(64),
          tone: z.string().min(2).max(64),
        })
      )
      .mutation(async ({ input }) => {
        try {
          return await previewScriptGeneratorPack({
            topic: input.topic,
            platform: input.platform,
            length: input.length,
            tone: input.tone,
          });
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.error("[Script generator] preview failed:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: formatIdeaScriptErrorForUser(error, "script"),
          });
        }
      }),

    claimToStudio: protectedProcedure
      .input(z.object({ sessionToken: z.string().min(20).max(20000) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await claimScriptGeneratorToStudio({
            userId: ctx.user.id,
            workspaceId: ctx.workspaceId,
            sessionToken: input.sessionToken,
          });
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.error("[Script generator] claimToStudio failed:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: formatIdeaScriptErrorForUser(error, "script"),
          });
        }
      }),
});
