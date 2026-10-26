import { PLANS, type BillingInterval, type PlanId } from "./products";

const PAID_PLAN_IDS = ["starter", "pro", "business", "agency"] as const;
export type PaidPlanId = (typeof PAID_PLAN_IDS)[number];

/**
 * Expand a subscription price on a list call.
 * Stripe allows four levels. data.items.data.price.product is five and is rejected.
 */
export const STRIPE_SUBSCRIPTION_LIST_PRICE_EXPAND = "data.items.data.price";

export function stripeExpandDepth(path: string): number {
  return path.split(".").filter((part) => part.length > 0).length;
}

type PlanMetadata = {
  plan_id?: string | null;
  billing_interval?: string | null;
} | null | undefined;

export type StripePlanSource = {
  metadata?: PlanMetadata;
  price?: {
    metadata?: PlanMetadata;
    unit_amount?: number | null;
    recurring?: { interval?: string | null } | null;
    product?:
      | string
      | { metadata?: { plan_id?: string | null } | null; deleted?: boolean }
      | null;
  } | null;
};

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === "string" && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

function billingInterval(
  metadataInterval: string | null | undefined,
  recurringInterval: string | null | undefined
): BillingInterval {
  if (metadataInterval === "yearly" || recurringInterval === "year") return "yearly";
  return "monthly";
}

/**
 * Read a paid SpyReels plan from a Stripe subscription.
 * Metadata wins. A catalog price amount is used when metadata is missing.
 */
export function planFromStripeSubscription(
  source: StripePlanSource
): { plan: PaidPlanId; interval: BillingInterval } | null {
  const recurring = source.price?.recurring?.interval;
  if (isPaidPlanId(source.metadata?.plan_id)) {
    return {
      plan: source.metadata.plan_id,
      interval: billingInterval(source.metadata.billing_interval, recurring),
    };
  }

  if (isPaidPlanId(source.price?.metadata?.plan_id)) {
    return {
      plan: source.price.metadata.plan_id,
      interval: billingInterval(source.price.metadata.billing_interval, recurring),
    };
  }

  const product = source.price?.product;
  if (product && typeof product === "object" && !product.deleted && isPaidPlanId(product.metadata?.plan_id)) {
    return {
      plan: product.metadata.plan_id,
      interval: billingInterval(null, recurring),
    };
  }

  const amount = source.price?.unit_amount;
  if (typeof amount !== "number") return null;
  if (recurring !== "month" && recurring !== "year") return null;
  const interval: BillingInterval = recurring === "year" ? "yearly" : "monthly";
  const matches = PAID_PLAN_IDS.filter((planId) => {
    const plan = PLANS[planId];
    const expected = interval === "yearly" ? plan.yearlyTotal : plan.monthlyPrice;
    return expected === amount;
  });
  if (matches.length !== 1) return null;
  return { plan: matches[0], interval };
}

/** Product id to load when subscription metadata, price metadata, and amount do not name a plan. */
export function productIdForPlanFallback(source: StripePlanSource): string | null {
  if (planFromStripeSubscription(source)) return null;
  const product = source.price?.product;
  if (typeof product !== "string") return null;
  const id = product.trim();
  return id.length > 0 ? id : null;
}

export function planRank(plan: PlanId): number {
  const order: PlanId[] = ["free", "starter", "pro", "business", "agency"];
  const index = order.indexOf(plan);
  return index < 0 ? 0 : index;
}
