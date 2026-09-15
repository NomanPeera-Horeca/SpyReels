import {
  getMonthlyUsage,
  getUserSubscription,
} from "../../stripe/stripe-service";
import { getPlanLimits, PLANS, type PlanId } from "../../stripe/products";
import type { AiGatewayActor } from "../types";

/**
 * Safe account/entitlement view for external AI hosts.
 * Stripe customer/subscription identifiers are intentionally not exposed.
 */
export async function getAccountUsage(actor: AiGatewayActor) {
  const subscription = await getUserSubscription(actor.userId);
  const planId = subscription.plan as PlanId;
  const plan = PLANS[planId];
  const [usage, limits] = await Promise.all([
    getMonthlyUsage(actor.userId),
    Promise.resolve(getPlanLimits(planId)),
  ]);

  return {
    plan: {
      id: planId,
      name: plan.name,
      status: subscription.status,
      billingInterval: subscription.billingInterval,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? subscription.currentPeriodEnd.toISOString()
        : null,
    },
    usage,
    limits,
  };
}
