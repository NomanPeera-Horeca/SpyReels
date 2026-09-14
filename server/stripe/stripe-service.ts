import {
  getMonthlyUsage,
  getUserSubscription as getBillingSubscription,
} from "./stripe-service-core";
import { getPlanLimits, type PlanId } from "./products";
import {
  getActiveComplimentaryGrant,
  resolveAccessSource,
  resolveEffectivePlan,
} from "../entitlements/complimentaryAccess";
import { hasUnlimitedUsage, unlimitedUsageResult } from "../usageBypass";

export * from "./stripe-service-core";

/**
 * Returns the user's effective product entitlement while preserving the
 * underlying Stripe subscription as billing metadata.
 *
 * Stripe is the source of truth for paid billing. Complimentary access can
 * only raise the effective plan and never rewrites or downgrades Stripe.
 */
export async function getUserSubscription(userId: number) {
  const billing = await getBillingSubscription(userId);
  const billingPlan = billing.plan as PlanId;
  const grant = await getActiveComplimentaryGrant(userId);
  const complimentaryPlan = grant?.plan ?? null;
  const plan = resolveEffectivePlan(billingPlan, complimentaryPlan);

  return {
    ...billing,
    plan,
    billingPlan,
    accessSource: resolveAccessSource(billingPlan, complimentaryPlan),
    complimentaryAccess: grant
      ? {
          id: grant.id,
          plan: grant.plan,
          startsAt: grant.startsAt,
          expiresAt: grant.expiresAt,
        }
      : null,
  };
}

type UsageField =
  | "scrapeCount"
  | "searchCount"
  | "transcribeCount"
  | "recreateCount"
  | "rewriteCount"
  | "exportCount"
  | "brollGenerationCount"
  | "extensionSortCount"
  | "extensionSaveCount"
  | "extensionTranscribeCount"
  | "extensionRecreateCount";

/**
 * Server-side usage enforcement using the effective entitlement. Unlike the
 * owner/admin bypass, complimentary users still consume normal plan usage so
 * their QA behavior mirrors a paying customer.
 */
export async function checkUsageLimit(
  userId: number,
  action: UsageField,
  userOpenId?: string,
  hints?: { email?: string | null; role?: string | null }
): Promise<{
  allowed: boolean;
  limit: number;
  used: number;
  planRequired?: PlanId;
}> {
  if (
    hasUnlimitedUsage({
      openId: userOpenId,
      email: hints?.email,
      role: hints?.role,
    })
  ) {
    return unlimitedUsageResult();
  }

  const { getUserById } = await import("../db");
  const user = await getUserById(userId);
  if (user && hasUnlimitedUsage(user)) {
    return unlimitedUsageResult();
  }

  const sub = await getUserSubscription(userId);
  const limits = getPlanLimits(sub.plan);
  const usage = await getMonthlyUsage(userId);

  const limitMap: Record<UsageField, keyof typeof limits> = {
    scrapeCount: "scrapesPerMonth",
    searchCount: "searchesPerDay",
    transcribeCount: "transcriptionsPerMonth",
    recreateCount: "recreatesPerMonth",
    rewriteCount: "rewritesPerScript",
    exportCount: "scrapesPerMonth",
    brollGenerationCount: "brollGenerationsPerMonth",
    extensionSortCount: "extSortsPerDay",
    extensionSaveCount: "extSavesPerDay",
    extensionTranscribeCount: "extTranscribesPerMonth",
    extensionRecreateCount: "extRecreatesPerMonth",
  };

  const limitKey = limitMap[action];
  const limit = limits[limitKey] as number;
  const used = usage[action] || 0;

  if (used >= limit) {
    const planOrder: PlanId[] = [
      "free",
      "starter",
      "pro",
      "business",
      "agency",
    ];
    const currentIdx = planOrder.indexOf(sub.plan);
    const planRequired = planOrder.find((candidate, index) => {
      if (index <= currentIdx) return false;
      const candidateLimits = getPlanLimits(candidate);
      return (candidateLimits[limitKey] as number) > limit;
    });

    return {
      allowed: false,
      limit,
      used,
      planRequired: planRequired || "agency",
    };
  }

  return { allowed: true, limit, used };
}
