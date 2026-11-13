import { beforeEach, describe, expect, it, vi } from "vitest";
import { coachBrandDescription, confirmedGoalsAndPillars } from "./coachProfileLoader";

const item = (kind: string, payload: unknown, status = "confirmed", sortOrder = 0, id = `${kind}-${sortOrder}`) =>
  ({ id, kind, payload, status, source: "ai_suggested", socialProfileId: "p", workspaceId: "w", sortOrder }) as never;

describe("Agent brief from the confirmed profile", () => {
  it("reads confirmed goals and pillars in screen order, ignoring unconfirmed ones", () => {
    const out = confirmedGoalsAndPillars([
      item("pillar", { title: "Luxury Travel Hacks" }, "confirmed", 2),
      item("goal", { text: "Help entrepreneurs turn points into luxury trips." }),
      item("pillar", { title: "Points to Luxury Trips" }, "confirmed", 1),
      item("pillar", { title: "Not confirmed yet" }, "suggested", 3),
    ]);
    expect(out.goals).toEqual(["Help entrepreneurs turn points into luxury trips."]);
    expect(out.pillars).toEqual(["Points to Luxury Trips", "Luxury Travel Hacks"]);
  });

  it("puts goal and pillars ahead of the old brand text; nothing when there is nothing", () => {
    expect(coachBrandDescription("Old bio", ["Grow"], ["A", "B"])).toBe("Goal: Grow\nContent pillars: A; B.\nOld bio");
    expect(coachBrandDescription(null, [], [])).toBeNull();
    expect(coachBrandDescription("Old bio", [], [])).toBe("Old bio");
  });
});

const state = {
  selectedNicheSlugs: ["business-entrepreneurship"],
  businessDescription: null,
  targetAudience: null,
  onboardingCompletedAt: new Date(),
  onboardingSkippedAt: null,
};
vi.mock("../db", () => ({ getOnboardingState: async () => state, getDb: async () => null }));
vi.mock("./activeNiche", () => ({ loadActiveNichePayload: async () => ({ slug: "x", label: "points and travel for entrepreneurs" }) }));
const loader = vi.hoisted(() => ({ result: null as unknown }));
vi.mock("./coachProfileLoader", async orig => ({
  ...(await orig<typeof import("./coachProfileLoader")>()),
  loadCoachPersonalization: async () => loader.result,
}));

describe("getCreatorCoachProfile", () => {
  beforeEach(() => {
    loader.result = {
      resolution: {
        profile: {
          niche: "points and travel for entrepreneurs",
          nicheSlug: "points-and-travel",
          targetAudience: "Entrepreneurs who travel frequently (to help them travel more)",
          brandDescription: null,
        },
        hasEnoughToPlan: true,
      },
      goals: ["Help entrepreneurs turn credit card points into luxury trips."],
      pillars: ["Points to Luxury Trips", "Luxury Travel Hacks"],
    };
  });

  it("Agent: writes for the confirmed niche, audience, goal and pillars (not 'General audience')", async () => {
    const { getCreatorCoachProfile } = await import("../planCoachProfile");
    const p = await getCreatorCoachProfile(1, { confirmedProfile: true, workspaceId: "w" });
    expect(p.niche).toBe("points and travel for entrepreneurs");
    expect(p.targetAudience).toContain("Entrepreneurs who travel frequently");
    expect(p.brandDescription).toContain("Goal: Help entrepreneurs turn credit card points");
    expect(p.brandDescription).toContain("Content pillars: Points to Luxury Trips; Luxury Travel Hacks.");
    // Taxonomy slug stays as before (audience research keys on it).
    expect(p.nicheSlug).toBe("business-entrepreneurship");
  });

  it("other callers (Remake, carousels) keep the old fields exactly", async () => {
    const { getCreatorCoachProfile } = await import("../planCoachProfile");
    const p = await getCreatorCoachProfile(1);
    expect(p.targetAudience).toBe("General audience");
    expect(p.brandDescription).toBeNull();
    expect(p.niche).toBe("points and travel for entrepreneurs");
  });

  it("no new profile: the Agent falls back to the old fields", async () => {
    loader.result = null;
    const { getCreatorCoachProfile } = await import("../planCoachProfile");
    const p = await getCreatorCoachProfile(1, { confirmedProfile: true, workspaceId: "w" });
    expect(p.targetAudience).toBe("General audience");
  });
});
