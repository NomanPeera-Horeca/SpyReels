import { z } from "zod";
import {
  createCheckoutSession,
  createPortalSession,
  checkUsageLimit,
  incrementUsage,
  getMonthlyUsage,
  getUserSubscription,
} from "../stripe/stripe-service";
import {
  getPlanLimits,
  PLANS,
  type BillingInterval,
  type PlanId,
} from "../stripe/products";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";

export const billingRouter = router({
  subscription: protectedProcedure.query(async ({ ctx }) => {
    const sub = await getUserSubscription(ctx.user.id);
    const limits = getPlanLimits(sub.plan as PlanId);
    const usage = await getMonthlyUsage(ctx.user.id);
    return { ...sub, limits, usage };
  }),

  usage: protectedProcedure.query(async ({ ctx }) => {
    const sub = await getUserSubscription(ctx.user.id);
    const limits = getPlanLimits(sub.plan as PlanId);
    const usage = await getMonthlyUsage(ctx.user.id);
    return { limits, usage, plan: sub.plan };
  }),

  plans: publicProcedure.query(() => {
    return Object.entries(PLANS).map(([id, plan]) => ({
      planId: id,
      ...plan,
    }));
  }),

  checkout: protectedProcedure
    .input(z.object({
      planId: z.enum(["starter", "pro", "business", "agency"]),
      interval: z.enum(["monthly", "yearly"]),
      origin: z.string(),
      referralId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const url = await createCheckoutSession({
        userId: ctx.user.id,
        email: ctx.user.email || "",
        name: ctx.user.name || "",
        planId: input.planId as PlanId,
        interval: input.interval as BillingInterval,
        origin: input.origin,
        referralId: input.referralId,
      });
      return { url };
    }),

  portal: protectedProcedure
    .input(z.object({ origin: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const url = await createPortalSession(ctx.user.id, input.origin);
      return { url };
    }),

  checkLimit: protectedProcedure
    .input(z.object({
      action: z.enum([
        "scrapeCount", "searchCount", "transcribeCount",
        "recreateCount", "rewriteCount", "exportCount",
        "brollGenerationCount",
        "extensionSortCount", "extensionSaveCount",
        "extensionTranscribeCount", "extensionRecreateCount",
      ]),
    }))
    .query(async ({ ctx, input }) => {
      return checkUsageLimit(ctx.user.id, input.action as any, ctx.user.openId, {
        email: ctx.user.email,
        role: ctx.user.role,
      });
    }),

  trackUsage: protectedProcedure
    .input(z.object({
      action: z.enum([
        "scrapeCount", "searchCount", "transcribeCount",
        "recreateCount", "rewriteCount", "exportCount",
        "brollGenerationCount",
        "extensionSortCount", "extensionSaveCount",
        "extensionTranscribeCount", "extensionRecreateCount",
      ]),
    }))
    .mutation(async ({ ctx, input }) => {
      await incrementUsage(ctx.user.id, input.action as any);
      return { success: true };
    }),
});