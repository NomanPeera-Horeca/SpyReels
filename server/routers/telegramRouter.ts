import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTelegramConnection,
  deleteTelegramConnection,
  getTelegramConnectionByUserId,
  updateTelegramConnection,
} from "../db";
import { getTelegramBotInfo, setupTelegramWebhook } from "../telegramBot";
import { protectedProcedure, router } from "../_core/trpc";

export const telegramRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const connection = await getTelegramConnectionByUserId(ctx.user.id);
    const botInfo = await getTelegramBotInfo();
    return {
      connected: connection?.isConnected === 1,
      telegramUsername: connection?.telegramUsername || null,
      botUsername: botInfo?.username || null,
      botName: botInfo?.name || null,
    };
  }),

  generateLinkCode: protectedProcedure.mutation(async ({ ctx }) => {
    const code = crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const existing = await getTelegramConnectionByUserId(ctx.user.id);
    if (existing) {
      await updateTelegramConnection(existing.id, {
        linkCode: code,
        linkCodeExpiresAt: expiresAt,
        isConnected: 0,
        telegramChatId: null,
      });
    } else {
      await createTelegramConnection({
        userId: ctx.user.id,
        linkCode: code,
        linkCodeExpiresAt: expiresAt,
      });
    }

    const botInfo = await getTelegramBotInfo();
    return {
      code,
      expiresAt: expiresAt.toISOString(),
      botUsername: botInfo?.username || "SpyReelsBot",
    };
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const connection = await getTelegramConnectionByUserId(ctx.user.id);
    if (connection) {
      await deleteTelegramConnection(connection.id);
    }
    return { success: true };
  }),

  setupWebhook: protectedProcedure
    .input(z.object({ baseUrl: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin" && ctx.user.openId !== process.env.OWNER_OPEN_ID) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const success = await setupTelegramWebhook(input.baseUrl);
      return { success };
    }),
});