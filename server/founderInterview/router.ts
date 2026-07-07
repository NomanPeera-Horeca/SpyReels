import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { founderInterviewRequests } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { notifyOwner } from "../_core/notification";
import { getDb } from "../db";
import { notifyOwnerViaTelegram } from "../telegramBot";
import {
  findFounderInterviewCountry,
  formatFounderInterviewPhoneE164,
  isValidFounderInterviewPhoneNational,
  normalizeFounderInterviewPhoneNational,
} from "@shared/founderInterviewCountries";

export const founderInterviewRouter = router({
  submitInterest: protectedProcedure
    .input(
      z.object({
        countryCode: z.string().length(2),
        phoneNational: z.string().min(1).max(20),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const country = findFounderInterviewCountry(input.countryCode.toUpperCase());
      if (!country) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Select a valid country.",
        });
      }

      const phoneNational = normalizeFounderInterviewPhoneNational(input.phoneNational);
      if (!isValidFounderInterviewPhoneNational(phoneNational)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enter a valid phone number (6 to 15 digits).",
        });
      }

      const phoneE164 = formatFounderInterviewPhoneE164(country.dialCode, phoneNational);
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database unavailable. Try again in a moment.",
        });
      }
      const now = new Date();

      try {
        await db
          .insert(founderInterviewRequests)
          .values({
            userId: ctx.user.id,
            countryCode: country.code,
            dialCode: country.dialCode,
            phoneNational,
            phoneE164,
            updatedAt: now,
          })
          .onDuplicateKeyUpdate({
            set: {
              countryCode: country.code,
              dialCode: country.dialCode,
              phoneNational,
              phoneE164,
              updatedAt: now,
            },
          });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[founderInterview.submitInterest] insert failed:", err);
        if (/founder_interview_requests|doesn't exist|ER_NO_SUCH_TABLE/i.test(message)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Phone capture is temporarily unavailable. You can still book on Calendly.",
          });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not save your phone number. Try again in a moment.",
        });
      }

      const userLabel = ctx.user.name?.trim() || "SpyReels user";
      const emailLabel = ctx.user.email?.trim() || "no email on file";
      const message = [
        "Founder interview request",
        `Name: ${userLabel}`,
        `Email: ${emailLabel}`,
        `Phone: ${phoneE164}`,
        `Country: ${country.name}`,
        `User ID: ${ctx.user.id}`,
      ].join("\n");

      void notifyOwnerViaTelegram(message);
      void notifyOwner({
        title: "Founder interview phone captured",
        content: message,
      }).catch(() => undefined);

      return { phoneE164 };
    }),
});
