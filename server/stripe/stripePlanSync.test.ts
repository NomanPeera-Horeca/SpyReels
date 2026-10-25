import { describe, expect, it } from "vitest";
import { planFromStripeSubscription } from "./stripePlanSync";

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
});
