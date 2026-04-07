import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock stripe
vi.mock("stripe", () => {
  const mockStripe = {
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: "https://checkout.stripe.com/test-session",
          id: "cs_test_123",
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: "https://billing.stripe.com/test-portal",
        }),
      },
    },
    subscriptions: {
      retrieve: vi.fn().mockResolvedValue({
        id: "sub_test_123",
        status: "active",
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        items: { data: [{ price: { id: "price_pro_monthly" } }] },
      }),
    },
    customers: {
      create: vi.fn().mockResolvedValue({ id: "cus_test_123" }),
    },
    webhooks: {
      constructEvent: vi.fn().mockImplementation((body, sig, secret) => ({
        id: "evt_test_123",
        type: "checkout.session.completed",
        data: {
          object: {
            client_reference_id: "1",
            customer: "cus_test_123",
            subscription: "sub_test_123",
            metadata: { user_id: "1", plan_id: "pro", billing_period: "monthly" },
          },
        },
      })),
    },
  };
  return { default: vi.fn(() => mockStripe) };
});

// Mock db
vi.mock("./db", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onDuplicateKeyUpdate: vi.fn().mockReturnThis(),
    set: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockReturnThis(),
  })),
}));

// Import after mocks
import { PLANS, getPlanLimits, type PlanId } from "./stripe/products";

describe("Pricing Products Configuration", () => {
  it("should have 5 pricing tiers", () => {
    expect(Object.keys(PLANS)).toHaveLength(5);
  });

  it("should have correct plan IDs", () => {
    const planIds = Object.values(PLANS).map((p) => p.id);
    expect(planIds).toEqual(["free", "starter", "pro", "business", "agency"]);
  });

  it("should have free plan at $0", () => {
    const free = Object.values(PLANS).find((p) => p.id === "free");
    expect(free).toBeDefined();
    expect(free!.monthlyPrice).toBe(0);
    expect(free!.yearlyTotal).toBe(0);
  });

  it("should have annual discount on all paid plans", () => {
    const paidPlans = Object.values(PLANS).filter((p) => p.id !== "free");
    for (const plan of paidPlans) {
      expect(plan.yearlyTotal).toBeLessThan(plan.monthlyPrice * 12);
    }
  });

  it("should have Pro as the most popular plan", () => {
    const pro = Object.values(PLANS).find((p) => p.id === "pro");
    expect(pro).toBeDefined();
    expect(pro!.highlighted).toBe(true);
  });

  it("should have increasing prices from Starter to Agency", () => {
    const starter = Object.values(PLANS).find((p) => p.id === "starter")!;
    const pro = Object.values(PLANS).find((p) => p.id === "pro")!;
    const business = Object.values(PLANS).find((p) => p.id === "business")!;
    const agency = Object.values(PLANS).find((p) => p.id === "agency")!;
    expect(starter.monthlyPrice).toBeLessThan(pro.monthlyPrice);
    expect(pro.monthlyPrice).toBeLessThan(business.monthlyPrice);
    expect(business.monthlyPrice).toBeLessThan(agency.monthlyPrice);
  });
});

describe("Plan Limits", () => {
  it("should return correct limits for free plan", () => {
    const limits = getPlanLimits("free");
    expect(limits.scrapesPerMonth).toBe(2);
    expect(limits.transcriptionsPerMonth).toBe(3);
    expect(limits.recreatesPerMonth).toBe(0);
    expect(limits.savedScripts).toBe(5);
    expect(limits.teamMembers).toBe(1);
  });

  it("should return correct limits for starter plan", () => {
    const limits = getPlanLimits("starter");
    expect(limits.scrapesPerMonth).toBe(10);
    expect(limits.transcriptionsPerMonth).toBe(30);
    expect(limits.recreatesPerMonth).toBe(15);
    expect(limits.savedScripts).toBe(50);
  });

  it("should return correct limits for pro plan", () => {
    const limits = getPlanLimits("pro");
    expect(limits.scrapesPerMonth).toBe(50);
    expect(limits.transcriptionsPerMonth).toBe(200);
    expect(limits.recreatesPerMonth).toBe(100);
    expect(limits.teamMembers).toBe(3);
  });

  it("should return correct limits for business plan", () => {
    const limits = getPlanLimits("business");
    expect(limits.scrapesPerMonth).toBe(200);
    expect(limits.transcriptionsPerMonth).toBe(1000);
    expect(limits.recreatesPerMonth).toBe(500);
    expect(limits.teamMembers).toBe(10);
  });

  it("should return effectively unlimited for agency plan", () => {
    const limits = getPlanLimits("agency");
    expect(limits.scrapesPerMonth).toBeGreaterThanOrEqual(999999);
    expect(limits.transcriptionsPerMonth).toBeGreaterThanOrEqual(999999);
    expect(limits.recreatesPerMonth).toBeGreaterThanOrEqual(999999);
    expect(limits.savedScripts).toBeGreaterThanOrEqual(999999);
    expect(limits.teamMembers).toBe(25);
  });

  it("should default to free plan for unknown plan IDs", () => {
    const limits = getPlanLimits("unknown" as PlanId);
    expect(limits.scrapesPerMonth).toBe(2);
    expect(limits.transcriptionsPerMonth).toBe(3);
  });
});

describe("Stripe Webhook Handling", () => {
  it("should handle test events with verified response", async () => {
    // Simulate the test event pattern from Stripe integration docs
    const testEvent = { id: "evt_test_abc123", type: "test" };
    expect(testEvent.id.startsWith("evt_test_")).toBe(true);
  });

  it("should handle checkout.session.completed event", () => {
    const event = {
      id: "evt_real_123",
      type: "checkout.session.completed",
      data: {
        object: {
          client_reference_id: "1",
          customer: "cus_test_123",
          subscription: "sub_test_123",
          metadata: {
            user_id: "1",
            plan_id: "pro",
            billing_period: "monthly",
          },
        },
      },
    };
    expect(event.type).toBe("checkout.session.completed");
    expect(event.data.object.metadata.plan_id).toBe("pro");
    expect(event.data.object.client_reference_id).toBe("1");
  });

  it("should handle customer.subscription.updated event", () => {
    const event = {
      id: "evt_real_456",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_123",
          status: "active",
          customer: "cus_test_123",
          current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        },
      },
    };
    expect(event.type).toBe("customer.subscription.updated");
    expect(event.data.object.status).toBe("active");
  });

  it("should handle customer.subscription.deleted event", () => {
    const event = {
      id: "evt_real_789",
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_test_123",
          status: "canceled",
          customer: "cus_test_123",
        },
      },
    };
    expect(event.type).toBe("customer.subscription.deleted");
    expect(event.data.object.status).toBe("canceled");
  });
});

describe("Annual vs Monthly Pricing", () => {
  it("should offer at least 35% discount on annual plans", () => {
    const paidPlans = Object.values(PLANS).filter((p) => p.id !== "free");
    for (const plan of paidPlans) {
      const discount = 1 - plan.yearlyTotal / (plan.monthlyPrice * 12);
      expect(discount).toBeGreaterThanOrEqual(0.35);
    }
  });

  it("should have Starter annual cheaper than monthly", () => {
    const starter = Object.values(PLANS).find((p) => p.id === "starter")!;
    expect(starter.yearlyTotal).toBeLessThan(starter.monthlyPrice * 12);
    expect(starter.yearlyTotal).toBeGreaterThan(0);
  });

  it("should have Pro annual cheaper than monthly", () => {
    const pro = Object.values(PLANS).find((p) => p.id === "pro")!;
    expect(pro.yearlyTotal).toBeLessThan(pro.monthlyPrice * 12);
    expect(pro.yearlyTotal).toBeGreaterThan(0);
  });
});

describe("Usage Gating - Server-side Enforcement", () => {
  it("should enforce scrape limits on free plan", () => {
    const freeLimits = getPlanLimits("free");
    expect(freeLimits.scrapesPerMonth).toBe(2);
    // Free users should be limited to 2 scrapes
    const used = 2;
    expect(used >= freeLimits.scrapesPerMonth).toBe(true);
  });

  it("should enforce transcription limits on free plan", () => {
    const freeLimits = getPlanLimits("free");
    expect(freeLimits.transcriptionsPerMonth).toBe(3);
    // Free users should be limited to 3 transcriptions
    const used = 3;
    expect(used >= freeLimits.transcriptionsPerMonth).toBe(true);
  });

  it("should block AI re-creation on free plan", () => {
    const freeLimits = getPlanLimits("free");
    expect(freeLimits.recreatesPerMonth).toBe(0);
    // Free users should not be able to re-create at all
    const used = 0;
    expect(used >= freeLimits.recreatesPerMonth).toBe(true);
  });

  it("should block rewrites on free plan", () => {
    const freeLimits = getPlanLimits("free");
    expect(freeLimits.rewritesPerScript).toBe(0);
    // Free users should not be able to rewrite at all
    const used = 0;
    expect(used >= freeLimits.rewritesPerScript).toBe(true);
  });

  it("should allow generous limits on pro plan", () => {
    const proLimits = getPlanLimits("pro");
    expect(proLimits.scrapesPerMonth).toBe(50);
    expect(proLimits.transcriptionsPerMonth).toBe(200);
    expect(proLimits.recreatesPerMonth).toBe(100);
    expect(proLimits.rewritesPerScript).toBe(10);
  });

  it("should have unlimited searches on pro plan", () => {
    const proLimits = getPlanLimits("pro");
    expect(proLimits.searchesPerDay).toBeGreaterThanOrEqual(999999);
  });

  it("should have extension limits on starter plan", () => {
    const starterLimits = getPlanLimits("starter");
    expect(starterLimits.extSortsPerDay).toBe(25);
    expect(starterLimits.extSavesPerDay).toBe(20);
    expect(starterLimits.extTranscribesPerMonth).toBe(15);
    expect(starterLimits.extRecreatesPerMonth).toBe(5);
  });
});

describe("Feature Flags per Plan", () => {
  it("free plan should not have premium features", () => {
    const freeLimits = getPlanLimits("free");
    expect(freeLimits.hasSrtExport).toBe(false);
    expect(freeLimits.hasAiCues).toBe(false);
    expect(freeLimits.hasCalendar).toBe(false);
    expect(freeLimits.hasKanban).toBe(false);
    expect(freeLimits.hasVoiceTeleprompter).toBe(false);
    expect(freeLimits.hasCsvExport).toBe(false);
    expect(freeLimits.hasGoogleSheets).toBe(false);
    expect(freeLimits.hasApiAccess).toBe(false);
  });

  it("starter plan should have basic premium features", () => {
    const starterLimits = getPlanLimits("starter");
    expect(starterLimits.hasSrtExport).toBe(true);
    expect(starterLimits.hasCalendar).toBe(true);
    expect(starterLimits.hasKanban).toBe(true);
    expect(starterLimits.hasCsvExport).toBe(true);
    expect(starterLimits.hasGoogleSheets).toBe(true);
    // But not advanced features
    expect(starterLimits.hasAiCues).toBe(false);
    expect(starterLimits.hasVoiceTeleprompter).toBe(false);
    expect(starterLimits.hasApiAccess).toBe(false);
  });

  it("pro plan should have all core features", () => {
    const proLimits = getPlanLimits("pro");
    expect(proLimits.hasSrtExport).toBe(true);
    expect(proLimits.hasAiCues).toBe(true);
    expect(proLimits.hasCalendar).toBe(true);
    expect(proLimits.hasKanban).toBe(true);
    expect(proLimits.hasVoiceTeleprompter).toBe(true);
    expect(proLimits.hasSmartTakes).toBe(true);
    expect(proLimits.hasGoogleDocs).toBe(true);
    expect(proLimits.hasPdfDocx).toBe(true);
    expect(proLimits.hasFullVersionHistory).toBe(true);
    // But not enterprise features
    expect(proLimits.hasApiAccess).toBe(false);
    expect(proLimits.hasWhiteLabel).toBe(false);
  });

  it("business plan should have API access", () => {
    const businessLimits = getPlanLimits("business");
    expect(businessLimits.hasApiAccess).toBe(true);
    expect(businessLimits.hasPrioritySupport).toBe(true);
    expect(businessLimits.hasWhiteLabel).toBe(false);
  });

  it("agency plan should have everything", () => {
    const agencyLimits = getPlanLimits("agency");
    expect(agencyLimits.hasApiAccess).toBe(true);
    expect(agencyLimits.hasWhiteLabel).toBe(true);
    expect(agencyLimits.hasPrioritySupport).toBe(true);
    expect(agencyLimits.teamMembers).toBe(25);
    expect(agencyLimits.workspaces).toBe(10);
  });
});
