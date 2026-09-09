import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { exportToGoogleDocs, isGoogleDocsConfigured } from "../googleDocs";
import { protectedProcedure, router } from "../_core/trpc";

export const googleDocsRouter = router({
  isConfigured: protectedProcedure.query(() => {
    return { configured: isGoogleDocsConfigured() };
  }),

  exportScript: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      sourceHandle: z.string().nullable().optional(),
      gradeLevel: z.string().nullable().optional(),
      postDate: z.string().nullable().optional(),
      wordCount: z.number().nullable().optional(),
      notes: z.string().nullable().optional(),
      shareWithEmail: z.string().email().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isGoogleDocsConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Google credentials not configured. Please add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in Settings > Secrets.",
        });
      }

      try {
        const result = await exportToGoogleDocs(
          {
            title: input.title,
            content: input.content,
            sourceHandle: input.sourceHandle,
            gradeLevel: input.gradeLevel,
            postDate: input.postDate,
            wordCount: input.wordCount,
            notes: input.notes,
          },
          input.shareWithEmail || ctx.user.email || undefined
        );

        return {
          documentUrl: result.documentUrl,
          documentId: result.documentId,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to create Google Doc";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),
});