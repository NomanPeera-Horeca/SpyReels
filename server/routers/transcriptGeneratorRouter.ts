import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { clientIpFromRequest } from "../publicRateLimit";
import { previewTranscriptGenerator } from "../transcriptGeneratorPreview";
import { TRANSCRIPT_GENERATOR_VARIANTS } from "@shared/transcriptGeneratorLanding";
import { not } from "drizzle-orm";

export const transcriptGeneratorRouter = router({
    preview: publicProcedure
      .input(
        z.object({
          url: z.string().min(8).max(2000),
          variant: z.enum([
            "instagram",
            "tiktok",
            "youtubeShorts",
            "youtube",
          ]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        try {
          if (!(TRANSCRIPT_GENERATOR_VARIANTS as string[]).includes(input.variant)) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid variant." });
          }
          return await previewTranscriptGenerator({
            url: input.url,
            variant: input.variant,
            clientIp: clientIpFromRequest(ctx.req),
          });
        } catch (error) {
          if (error instanceof TRPCError) throw error;
          console.error("[Transcript generator] preview failed:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not generate that transcript. Please try again.",
          });
        }
      }),
});
