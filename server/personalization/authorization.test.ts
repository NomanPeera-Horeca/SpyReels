import { describe, expect, it } from "vitest";
import { resolveActiveProfileId } from "@shared/personalization/state";
import { profileAnalysisJobKeys } from "./analysisJobKey";
import {
  assertCanRemoveSocialProfile,
  assertChildOfProfile,
  assertSocialProfileInWorkspace,
  buildActiveSelection,
  planProfileDeactivation,
  type PersonalizationCtx,
} from "./authorization";

const WS_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const WS_B = "bbbbbbbb-0000-4000-8000-00000000000b";

const owner: PersonalizationCtx = {
  user: { id: 1 },
  workspaceId: WS_A,
  workspaceRole: "owner",
};
const member: PersonalizationCtx = {
  user: { id: 3 },
  workspaceId: WS_A,
  workspaceRole: "member",
};
const otherWs: PersonalizationCtx = {
  user: { id: 2 },
  workspaceId: WS_B,
  workspaceRole: "owner",
};

const profileA = { id: "pa", workspaceId: WS_A, deletedAt: null };
const profileB = { id: "pb", workspaceId: WS_B, deletedAt: null };

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return "no error";
};

describe("assertSocialProfileInWorkspace", () => {
  it("allows a live profile in the caller's workspace", () => {
    expect(assertSocialProfileInWorkspace(profileA, member)).toBe(profileA);
  });

  it("returns NOT_FOUND for another workspace's profile (no existence hint)", () => {
    expect(code(() => assertSocialProfileInWorkspace(profileB, member))).toBe(
      "NOT_FOUND"
    );
    expect(code(() => assertSocialProfileInWorkspace(profileA, otherWs))).toBe(
      "NOT_FOUND"
    );
  });

  it("returns NOT_FOUND for missing or soft-deleted profiles", () => {
    expect(code(() => assertSocialProfileInWorkspace(null, member))).toBe(
      "NOT_FOUND"
    );
    expect(
      code(() =>
        assertSocialProfileInWorkspace(
          { ...profileA, deletedAt: new Date() },
          member
        )
      )
    ).toBe("NOT_FOUND");
  });

  it("rejects unauthenticated callers and missing workspace context", () => {
    expect(
      code(() =>
        assertSocialProfileInWorkspace(profileA, { ...member, user: null })
      )
    ).toBe("UNAUTHORIZED");
    expect(
      code(() =>
        assertSocialProfileInWorkspace(profileA, {
          ...member,
          workspaceId: null,
        })
      )
    ).toBe("INTERNAL_SERVER_ERROR");
  });
});

describe("assertChildOfProfile (items, runs, progress)", () => {
  it("allows a child of the profile", () => {
    const child = { id: "i1", workspaceId: WS_A, socialProfileId: "pa" };
    expect(assertChildOfProfile(child, profileA, "Item")).toBe(child);
  });

  it("rejects a child of another profile in the same workspace", () => {
    expect(
      code(() =>
        assertChildOfProfile(
          { id: "i2", workspaceId: WS_A, socialProfileId: "pa2" },
          profileA,
          "Item"
        )
      )
    ).toBe("NOT_FOUND");
  });

  it("rejects a child whose workspace disagrees with its profile", () => {
    expect(
      code(() =>
        assertChildOfProfile(
          { id: "r1", workspaceId: WS_B, socialProfileId: "pa" },
          profileA,
          "Analysis"
        )
      )
    ).toBe("NOT_FOUND");
  });

  it("rejects missing rows", () => {
    expect(code(() => assertChildOfProfile(null, profileA, "Progress"))).toBe(
      "NOT_FOUND"
    );
  });
});

describe("profile switching", () => {
  it("builds the selection from server context, not from the request", () => {
    expect(buildActiveSelection(profileA, member)).toEqual({
      workspaceId: WS_A,
      userId: 3,
      socialProfileId: "pa",
    });
  });

  it("refuses to select another workspace's profile", () => {
    expect(code(() => buildActiveSelection(profileB, member))).toBe(
      "NOT_FOUND"
    );
  });

  it("after switching workspace, a selection from the old workspace is ignored", () => {
    const profiles = [
      { ...profileA, createdAt: new Date("2026-01-01") },
      { ...profileB, createdAt: new Date("2026-01-01") },
    ];
    expect(
      resolveActiveProfileId({
        workspaceId: WS_B,
        storedSelectionId: "pa",
        profiles,
      })
    ).toEqual({
      profileId: "pb",
      selectionWasStale: true,
    });
  });
});

describe("removing a profile", () => {
  it("is owner-only", () => {
    expect(code(() => assertCanRemoveSocialProfile(member))).toBe("FORBIDDEN");
    expect(code(() => assertCanRemoveSocialProfile(owner))).toBe("no error");
  });

  it("clears every active selection before soft-deleting", () => {
    expect(planProfileDeactivation(profileA, owner)).toEqual({
      workspaceId: WS_A,
      socialProfileId: "pa",
      steps: ["delete_active_selections", "soft_delete_profile"],
    });
  });

  it("cannot remove another workspace's profile even as an owner", () => {
    expect(code(() => planProfileDeactivation(profileB, owner))).toBe(
      "NOT_FOUND"
    );
  });
});

describe("profileAnalysisJobKeys: one key per logical request, not per day", () => {
  const account = {
    socialProfileId: "3f1b2c3d-0000-4000-8000-000000000001",
    platform: "instagram" as const,
    normalizedHandle: "noman_peera",
    platformAccountId: "123",
  };
  const initial = { ...account, requestKind: "initial" as const };

  it("automatic retry / reload of the same request gives the same key (no duplicate provider work)", () => {
    expect(profileAnalysisJobKeys(initial)).toEqual(
      profileAnalysisJobKeys({ ...initial })
    );
    expect(profileAnalysisJobKeys(initial).idempotencyKey).toMatch(
      /^profile_analysis:3f1b2c3d-0000-4000-8000-000000000001:[a-f0-9]{32}$/
    );
  });

  it("two simultaneous refresh taps compute the same sequence, so they share one key", () => {
    const a = profileAnalysisJobKeys({
      ...account,
      requestKind: "user_refresh",
      refreshSequence: 3,
    });
    const b = profileAnalysisJobKeys({
      ...account,
      requestKind: "user_refresh",
      refreshSequence: 3,
    });
    expect(a).toEqual(b);
  });

  it("a legitimate refresh on the same day gets a NEW key (next sequence)", () => {
    const keys = new Set(
      [
        profileAnalysisJobKeys(initial),
        profileAnalysisJobKeys({
          ...account,
          requestKind: "user_refresh",
          refreshSequence: 1,
        }),
        profileAnalysisJobKeys({
          ...account,
          requestKind: "user_refresh",
          refreshSequence: 2,
        }),
        profileAnalysisJobKeys({
          ...account,
          requestKind: "background",
          periodIndex: 2950,
        }),
      ].map(k => k.idempotencyKey)
    );
    expect(keys.size).toBe(4);
  });

  it("several background schedulers in the same period share one key; the next period differs", () => {
    const p1 = profileAnalysisJobKeys({
      ...account,
      requestKind: "background",
      periodIndex: 2950,
    });
    expect(
      profileAnalysisJobKeys({
        ...account,
        requestKind: "background",
        periodIndex: 2950,
      })
    ).toEqual(p1);
    expect(
      profileAnalysisJobKeys({
        ...account,
        requestKind: "background",
        periodIndex: 2951,
      }).idempotencyKey
    ).not.toBe(p1.idempotencyKey);
  });

  it("a changed handle or another profile is a different request", () => {
    const a = profileAnalysisJobKeys(initial).idempotencyKey;
    expect(
      profileAnalysisJobKeys({ ...initial, normalizedHandle: "noman_new" })
        .idempotencyKey
    ).not.toBe(a);
    expect(
      profileAnalysisJobKeys({
        ...initial,
        socialProfileId: "3f1b2c3d-0000-4000-8000-000000000002",
      }).idempotencyKey
    ).not.toBe(a);
  });

  it("rejects an invalid refresh sequence", () => {
    expect(() =>
      profileAnalysisJobKeys({
        ...account,
        requestKind: "user_refresh",
        refreshSequence: 0,
      })
    ).toThrow();
  });
});

describe("permission rule stays provisional and unchanged", () => {
  it("members can select and edit (no owner check); only owners remove", () => {
    expect(code(() => buildActiveSelection(profileA, member))).toBe("no error");
    expect(code(() => assertCanRemoveSocialProfile(member))).toBe("FORBIDDEN");
    expect(code(() => planProfileDeactivation(profileA, member))).toBe(
      "FORBIDDEN"
    );
  });
});
