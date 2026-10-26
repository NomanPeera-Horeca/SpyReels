import { describe, expect, it } from "vitest";
import {
  planFromStripeSubscription,
  productIdForPlanFallback,
  STRIPE_SUBSCRIPTION_LIST_PRICE_EXPAND,
  stripeExpandDepth,
} from "./stripePlanSync";

describe("planFromStripeSubscription", () => {
  it("reads the plan stored on the Stripe subscription", () => {
    expect(
      planFromStripeSubscription({
        metadata: { plan_id: "pro", billing_interval: "monthly" },
      })
    ).toEqual({ plan: "pro", interval: "monthly" });
  });

  it("reads plan metadata from the price when the subscription has none", () => {
    expect(
      planFromStripeSubscription({
        price: {
          metadata: { plan_id: "business", billing_interval: "yearly" },
          recurring: { interval: "year" },
        },
      })
    ).toEqual({ plan: "business", interval: "yearly" });
  });

  it("recognizes the Pro monthly price when Stripe has no plan metadata", () => {
    expect(
      planFromStripeSubscription({
        price: {
          unit_amount: 4900,
          recurring: { interval: "month" },
        },
      })
    ).toEqual({ plan: "pro", interval: "monthly" });
  });

  it("recognizes the Pro yearly price", () => {
    expect(
      planFromStripeSubscription({
        price: {
          unit_amount: 34800,
          recurring: { interval: "year" },
        },
      })
    ).toEqual({ plan: "pro", interval: "yearly" });
  });

  it("does not treat an unknown price as a paid plan", () => {
    expect(
      planFromStripeSubscription({
        price: {
          unit_amount: 100,
          recurring: { interval: "month" },
        },
      })
    ).toBeNull();
  });

  it("reads the plan from product metadata", () => {
    expect(
      planFromStripeSubscription({
        price: {
          unit_amount: 100,
          recurring: { interval: "month" },
          product: { metadata: { plan_id: "pro" }, deleted: false },
        },
      })
    ).toEqual({ plan: "pro", interval: "monthly" });
  });

  it("keeps the subscription list expand inside Stripe's four-level limit", () => {
    expect(stripeExpandDepth(STRIPE_SUBSCRIPTION_LIST_PRICE_EXPAND)).toBe(4);
    expect(STRIPE_SUBSCRIPTION_LIST_PRICE_EXPAND.endsWith(".product")).toBe(false);
    expect(stripeExpandDepth("data.items.data.price.product")).toBe(5);
  });

  it("loads the product only when the price itself does not name a plan", () => {
    expect(
      productIdForPlanFallback({
        price: {
          metadata: { plan_id: "pro" },
          product: "prod_already_known",
        },
      })
    ).toBeNull();
    expect(
      productIdForPlanFallback({
        price: {
          unit_amount: 100,
          recurring: { interval: "month" },
          product: "prod_needs_lookup",
        },
      })
    ).toBe("prod_needs_lookup");
  });
});
