import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  coachScriptDownReasonLabel,
  COACH_SCRIPT_DOWN_REASONS,
  isCoachScriptDownReasonId,
} from "@shared/coachScriptFeedback";
import { coachScriptFeedback, coachScripts } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { sendCoachScriptFeedbackEmail } from "../utils/email";

const downReasonIds = COACH_SCRIPT_DOWN_REASONS.map((r) => r.id) as [
  (typeof COACH_SCRIPT_DOWN_REASONS)[number]["id"],
  ...(typeof COACH_SCRIPT_DOWN_REASONS)[number]["id"][],
];

export const coachScriptFeedbackRouter = router({
  submit: protectedProcedure
    .input(
      z
        .object({
          coachScriptId: z.number().int().positive(),
          rating: z.enum(["up", "down"]),
          reason: z.enum(downReasonIds).optional(),
          note: z.string().trim().max(500).optional(),
        })
        .superRefine((val, ctx) => {
          if (val.rating === "down" && !val.reason) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Pick what was off about this script.",
              path: ["reason"],
            });
          }
        })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable. Try again in a moment.",
        });
      }

      const [script] = await db
        .select()
        .from(coachScripts)
        .where(
          and(
            eq(coachScripts.id, input.coachScriptId),
            eq(coachScripts.workspaceId, ctx.workspaceId)
          )
        )
        .limit(1);

      if (!script) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Script not found." });
      }

      const reason =
        input.rating === "down" && input.reason && isCoachScriptDownReasonId(input.reason)
          ? input.reason
          : null;
      const note = input.note?.trim() || null;

      try {
        await db
          .insert(coachScriptFeedback)
          .values({
            userId: ctx.user.id,
            workspaceId: ctx.workspaceId,
            coachScriptId: script.id,
            rating: input.rating,
            reason,
            note,
          })
          .onDuplicateKeyUpdate({
            set: {
              rating: input.rating,
              reason,
              note,
            },
          });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[coachScriptFeedback.submit] insert failed:", err);
        if (/coach_script_feedback|doesn't exist|ER_NO_SUCH_TABLE/i.test(message)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Feedback is temporarily unavailable. Please try again soon.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your feedback. Please try again.",
        });
      }

      try {
        await sendCoachScriptFeedbackEmail({
          rating: input.rating,
          reasonLabel: reason ? coachScriptDownReasonLabel(reason) : null,
          note,
          scriptId: script.id,
          scriptTitle: script.title,
          scriptHook: script.hook,
          userId: ctx.user.id,
          userName: ctx.user.name ?? null,
          userEmail: ctx.user.email ?? null,
        });
      } catch (err) {
        console.error("[coachScriptFeedback.submit] email failed:", err);
        // Feedback is stored; email failure should not block the user.
      }

      return { success: true as const };
    }),
});
