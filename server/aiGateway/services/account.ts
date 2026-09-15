import {
  getMonthlyUsage,
  getUserSubscription,
} from "../../stripe/stripe-service";
import { getPlanLimits, PLANS, type PlanId } from "../../stripe/products";
import { hasUnlimitedUsage } from "../../usageBypass";
import type { AiGatewayActor } from "../types";

/**
 * Safe account/entitlement view for external AI hosts.
 *
 * Effective product access is authoritative. Billing metadata is intentionally
 * secondary because owner/admin access can remain unlimited even when an old
 * Stripe subscription is free, cancelled, or otherwise inactive.
 * Stripe customer/subscription identifiers are never exposed.
 */
export async function getAccountUsage(actor: AiGatewayActor) {
  const subscription = await getUserSubscription(actor.userId);
  const planId = subscription.plan as PlanId;
  const plan = PLANS[planId];
  const unlimitedUsage = hasUnlimitedUsage(actor);
  const usage = await getMonthlyUsage(actor.userId);

  const billing = {
    plan: {
      id: planId,
      name: plan.name,
    },
    status: subscription.status,
    billingInterval: subscription.billingInterval,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    currentPeriodEnd: subscription.currentPeriodEnd
      ? subscription.currentPeriodEnd.toISOString()
      : null,
  };

  if (unlimitedUsage) {
    const accessLabel = actor.role === "admin" ? "Admin" : "Owner";
    return {
      access: {
        mode: "unlimited" as const,
        label: accessLabel,
        status: "active" as const,
        unlimitedUsage: true,
        authoritative: true,
        message:
          "This SpyReels account has unlimited usage. Billing-plan quotas do not apply to this account.",
      },
      // Backward-compatible effective plan view for existing AI clients.
      plan: {
        id: "admin" as const,
        name: accessLabel,
        status: "active" as const,
        billingInterval: null,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
      usage,
      limits: null,
      billing,
    };
  }

  return {
    access: {
      mode: "plan" as const,
      label: plan.name,
      status: subscription.status,
      unlimitedUsage: false,
      authoritative: true,
    },
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
    limits: getPlanLimits(planId),
    billing,
  };
}
