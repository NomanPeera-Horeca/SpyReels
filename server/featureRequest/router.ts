import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { sendFeatureRequestEmail } from "../utils/email";

export const featureRequestRouter = router({
  submit: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(3).max(120),
        details: z.string().trim().min(10).max(2000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await sendFeatureRequestEmail({
          title: input.title,
          details: input.details,
          userId: ctx.user.id,
          userName: ctx.user.name ?? null,
          userEmail: ctx.user.email ?? null,
        });
      } catch (err) {
        console.error("[featureRequest.submit] email failed:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not send your request. Please try again in a moment.",
        });
      }

      return { success: true as const };
    }),
});
