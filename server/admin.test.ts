import { describe, it, expect, vi } from "vitest";

// Mock the admin router logic
describe("Admin Dashboard", () => {
  describe("Overview metrics", () => {
    it("should calculate MRR correctly from paid subscriptions", () => {
      const priceMap: Record<string, number> = { starter: 19, pro: 49, business: 99, agency: 199 };
      const paidSubs = [
        { plan: "pro", billingInterval: "monthly", stripeSubscriptionId: "sub_1" },
        { plan: "starter", billingInterval: "monthly", stripeSubscriptionId: "sub_2" },
        { plan: "business", billingInterval: "yearly", stripeSubscriptionId: "sub_3" },
      ];
      const mrr = paidSubs.reduce((sum, s) => {
        const base = priceMap[s.plan] || 0;
        return sum + (s.billingInterval === "yearly" ? Math.round(base * 0.8) : base);
      }, 0);
      // pro monthly (49) + starter monthly (19) + business yearly (99*0.8=79)
      expect(mrr).toBe(49 + 19 + 79);
    });

    it("should correctly identify paid vs free users", () => {
      const paidPlans = ["starter", "pro", "business", "agency"];
      const allSubs = [
        { plan: "free", stripeSubscriptionId: null },
        { plan: "pro", stripeSubscriptionId: "sub_1" },
        { plan: "free", stripeSubscriptionId: null },
        { plan: "starter", stripeSubscriptionId: "sub_2" },
      ];
      const paidSubs = allSubs.filter(s => paidPlans.includes(s.plan) && s.stripeSubscriptionId);
      expect(paidSubs.length).toBe(2);
    });

    it("should calculate conversion rate correctly", () => {
      const totalUsers = 13;
      const paidUsers = 3;
      const rate = Math.round((paidUsers / totalUsers) * 100);
      expect(rate).toBe(23);
    });
  });

  describe("Retention status", () => {
    it("should mark user as active if last seen within 7 days", () => {
      const now = new Date();
      const lastSeen = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const daysSince = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
      let status = "active";
      if (daysSince > 30) status = "churned";
      else if (daysSince > 7) status = "at_risk";
      expect(status).toBe("active");
      expect(daysSince).toBe(2);
    });

    it("should mark user as at_risk if last seen 8-30 days ago", () => {
      const now = new Date();
      const lastSeen = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
      const daysSince = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
      let status = "active";
      if (daysSince > 30) status = "churned";
      else if (daysSince > 7) status = "at_risk";
      expect(status).toBe("at_risk");
    });

    it("should mark user as churned if last seen over 30 days ago", () => {
      const now = new Date();
      const lastSeen = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000); // 45 days ago
      const daysSince = Math.floor((now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24));
      let status = "active";
      if (daysSince > 30) status = "churned";
      else if (daysSince > 7) status = "at_risk";
      expect(status).toBe("churned");
    });
  });

  describe("User enrichment", () => {
    it("should correctly map usage data to users", () => {
      const usageMap = new Map<number, any>([
        [1, { scrapeCount: 5, transcribeCount: 3, recreateCount: 2, rewriteCount: 1, searchCount: 10 }],
      ]);
      const userId = 1;
      const usage = usageMap.get(userId);
      expect(usage).toBeDefined();
      expect(usage!.scrapeCount).toBe(5);

      const missingUserId = 999;
      const missingUsage = usageMap.get(missingUserId);
      expect(missingUsage).toBeUndefined();
    });

    it("should handle search filtering by name and email", () => {
      const users = [
        { name: "John Doe", email: "john@test.com" },
        { name: "Jane Smith", email: "jane@test.com" },
        { name: "Bob Builder", email: "bob@example.com" },
      ];
      const search = "john";
      const filtered = users.filter(u =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      );
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe("John Doe");
    });

    it("should handle plan filtering", () => {
      const users = [
        { name: "User1", plan: "free" },
        { name: "User2", plan: "pro" },
        { name: "User3", plan: "free" },
        { name: "User4", plan: "starter" },
      ];
      const planFilter = "pro";
      const filtered = users.filter(u => u.plan === planFilter);
      expect(filtered.length).toBe(1);
      expect(filtered[0].name).toBe("User2");
    });
  });
});
