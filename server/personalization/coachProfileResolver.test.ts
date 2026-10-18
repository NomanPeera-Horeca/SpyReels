import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveCoachPersonalization,
  type LegacyCoachState,
  type ScopedItem,
} from "./coachProfileResolver";

const getOnboardingState = vi.fn();
vi.mock("../db", () => ({
  getOnboardingState: (...a: unknown[]) => getOnboardingState(...a),
}));

const WS = "ws-a";
const PROFILE = { id: "p1", workspaceId: WS, deletedAt: null };

const legacy = (over: Partial<LegacyCoachState> = {}): LegacyCoachState => ({
  selectedNicheSlugs: ["fitness"],
  businessDescription: "I coach busy moms to lose weight",
  targetAudience: "Busy moms",
  onboardingCompletedAt: new Date("2026-01-01"),
  onboardingSkippedAt: null,
  ...over,
});

let seq = 0;
const item = (
  over: Partial<ScopedItem> & Pick<ScopedItem, "kind" | "payload">
): ScopedItem =>
  ({
    id: `i${++seq}`,
    socialProfileId: "p1",
    workspaceId: WS,
    sortOrder: 0,
    source: "user_entered",
    status: "confirmed",
    evidence: "user_provided",
    analysisRunId: null,
    basedOnVersion: 1,
    dismissedAtVersion: null,
    supersedesItemId: null,
    ...over,
  }) as ScopedItem;

describe("no new data: identical to today's getCreatorCoachProfile", () => {
  beforeEach(() => getOnboardingState.mockReset());

  const fixtures: LegacyCoachState[] = [
    legacy(),
    legacy({
      businessDescription: null,
      targetAudience: null,
      selectedNicheSlugs: ["personal_finance"],
    }),
    legacy({
      businessDescription: "  ",
      targetAudience: "  ",
      selectedNicheSlugs: [],
    }),
    legacy({
      businessDescription: "Real estate listings coaching",
      targetAudience: null,
      selectedNicheSlugs: null,
    }),
    legacy({
      businessDescription: null,
      onboardingCompletedAt: null,
      onboardingSkippedAt: new Date(),
    }),
  ];

  for (const [i, state] of fixtures.entries()) {
    it(`fixture ${i + 1}`, async () => {
      getOnboardingState.mockResolvedValue(state);
      const { getCreatorCoachProfile } = await import("../planCoachProfile");
      const today = await getCreatorCoachProfile(1);
      const resolved = resolveCoachPersonalization({
        workspaceId: WS,
        legacy: state,
        activeProfile: null,
        items: null,
        personalizationVersion: 1,
      });
      expect(resolved.profile).toEqual(today);
      expect(resolved.hasEnoughToPlan).toBe(true);
    });
  }

  it("the precondition matches: no business, no completion, no skip", async () => {
    const state = legacy({
      businessDescription: null,
      onboardingCompletedAt: null,
      onboardingSkippedAt: null,
    });
    getOnboardingState.mockResolvedValue(state);
    const { getCreatorCoachProfile } = await import("../planCoachProfile");
    await expect(getCreatorCoachProfile(1)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(
      resolveCoachPersonalization({
        workspaceId: WS,
        legacy: state,
        activeProfile: null,
        items: null,
        personalizationVersion: 1,
      }).hasEnoughToPlan
    ).toBe(false);
  });
});

describe("priority: confirmed > user-entered > legacy > default", () => {
  it("confirmed values of the active profile win over legacy", () => {
    const r = resolveCoachPersonalization({
      workspaceId: WS,
      legacy: legacy(),
      activeProfile: PROFILE,
      personalizationVersion: 1,
      items: [
        item({
          kind: "brand_description",
          payload: { text: "Commercial kitchen tips" },
        }),
        item({
          kind: "audience",
          payload: { who: "Restaurant owners", outcome: "open faster" },
        }),
        item({ kind: "niche", payload: { slug: "food", label: "Food" } }),
      ],
    });
    expect(r.profile).toEqual({
      niche: "Food",
      nicheSlug: "food",
      targetAudience: "Restaurant owners (to help them open faster)",
      brandDescription: "Commercial kitchen tips",
    });
    expect(r.sources).toEqual({
      niche: "confirmed",
      targetAudience: "confirmed",
      brandDescription: "confirmed",
    });
  });

  it("user-written but unconfirmed values are used when nothing is confirmed", () => {
    const r = resolveCoachPersonalization({
      workspaceId: WS,
      legacy: legacy(),
      activeProfile: PROFILE,
      personalizationVersion: 1,
      items: [
        item({
          kind: "audience",
          payload: { who: "Chefs", outcome: "" },
          status: "suggested",
          source: "user_edited",
        }),
      ],
    });
    expect(r.profile.targetAudience).toBe("Chefs");
    expect(r.sources.targetAudience).toBe("user_entered");
    expect(r.sources.brandDescription).toBe("legacy");
  });

  it("missing kinds fall back to legacy per field, not all-or-nothing", () => {
    const r = resolveCoachPersonalization({
      workspaceId: WS,
      legacy: legacy(),
      activeProfile: PROFILE,
      personalizationVersion: 1,
      items: [
        item({ kind: "audience", payload: { who: "Chefs", outcome: "" } }),
      ],
    });
    expect(r.profile.brandDescription).toBe("I coach busy moms to lose weight");
    expect(r.sources).toMatchObject({
      targetAudience: "confirmed",
      brandDescription: "legacy",
      niche: "inferred",
    });
  });

  it("defaults when nothing exists anywhere", () => {
    const r = resolveCoachPersonalization({
      workspaceId: WS,
      legacy: legacy({
        businessDescription: null,
        targetAudience: null,
        selectedNicheSlugs: null,
      }),
      activeProfile: null,
      items: null,
      personalizationVersion: 1,
    });
    expect(r.profile.targetAudience).toBe("General audience");
    expect(r.sources).toEqual({
      niche: "default",
      targetAudience: "default",
      brandDescription: "default",
    });
  });
});

describe("explicit handling of unusable values", () => {
  it("never uses unconfirmed AI suggestions, dismissed, superseded or stale rows", () => {
    const r = resolveCoachPersonalization({
      workspaceId: WS,
      legacy: legacy(),
      activeProfile: PROFILE,
      personalizationVersion: 3,
      items: [
        item({
          kind: "audience",
          payload: { who: "AI guess", outcome: "" },
          source: "ai_suggested",
          status: "suggested",
          evidence: "profile_inferred",
          basedOnVersion: 3,
        }),
        item({
          kind: "audience",
          payload: { who: "Old", outcome: "" },
          status: "superseded",
        }),
        item({
          kind: "brand_description",
          payload: { text: "Dismissed" },
          source: "ai_suggested",
          status: "dismissed",
          evidence: "profile_inferred",
          dismissedAtVersion: 2,
        }),
        item({
          kind: "pillar",
          payload: { title: "Stale", description: "", viewSharePercent: null },
          source: "ai_suggested",
          status: "suggested",
          evidence: "profile_inferred",
          basedOnVersion: 1,
        }),
      ],
    });
    expect(r.profile.targetAudience).toBe("Busy moms");
    expect(r.profile.brandDescription).toBe("I coach busy moms to lose weight");
    expect(r.ignored).toEqual({
      otherProfileOrWorkspace: 0,
      aiUnconfirmed: 1,
      stale: 1,
      dismissedOrSuperseded: 2,
    });
  });
});

describe("isolation: never another workspace or profile", () => {
  it("items from another profile or workspace are ignored, never merged", () => {
    const r = resolveCoachPersonalization({
      workspaceId: WS,
      legacy: legacy(),
      activeProfile: PROFILE,
      personalizationVersion: 1,
      items: [
        item({ kind: "audience", payload: { who: "Mine", outcome: "" } }),
        item({
          kind: "audience",
          payload: { who: "Other profile", outcome: "" },
          socialProfileId: "p2",
        }),
        item({
          kind: "audience",
          payload: { who: "Other workspace", outcome: "" },
          workspaceId: "ws-b",
        }),
      ],
    });
    expect(r.profile.targetAudience).toBe("Mine");
    expect(r.ignored.otherProfileOrWorkspace).toBe(2);
  });

  it("an active profile from another workspace, or soft-deleted, is not used at all", () => {
    for (const activeProfile of [
      { id: "p1", workspaceId: "ws-b", deletedAt: null },
      { id: "p1", workspaceId: WS, deletedAt: new Date() },
    ]) {
      const r = resolveCoachPersonalization({
        workspaceId: WS,
        legacy: legacy(),
        activeProfile,
        personalizationVersion: 1,
        items: [
          item({
            kind: "audience",
            payload: { who: "Should not appear", outcome: "" },
          }),
        ],
      });
      expect(r.profile.targetAudience).toBe("Busy moms");
    }
  });

  it("several audiences of the SAME profile are listed in order, not mixed with others", () => {
    const r = resolveCoachPersonalization({
      workspaceId: WS,
      legacy: legacy(),
      activeProfile: PROFILE,
      personalizationVersion: 1,
      items: [
        item({
          kind: "audience",
          payload: { who: "Second", outcome: "" },
          sortOrder: 1,
        }),
        item({
          kind: "audience",
          payload: { who: "First", outcome: "grow" },
          sortOrder: 0,
        }),
      ],
    });
    expect(r.profile.targetAudience).toBe("First (to help them grow); Second");
  });

  it("a confirmed strategy counts as enough to plan even without legacy completion", () => {
    const r = resolveCoachPersonalization({
      workspaceId: WS,
      legacy: legacy({
        businessDescription: null,
        onboardingCompletedAt: null,
        onboardingSkippedAt: null,
      }),
      activeProfile: PROFILE,
      personalizationVersion: 1,
      items: [item({ kind: "goal", payload: { text: "Sell more ovens" } })],
    });
    expect(r.hasEnoughToPlan).toBe(true);
  });
});
