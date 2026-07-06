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
