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

describe("profileAnalysisJobKeys: no duplicate analysis jobs", () => {
  const input = {
    socialProfileId: "3f1b2c3d-0000-4000-8000-000000000001",
    platform: "instagram" as const,
    normalizedHandle: "noman_peera",
    platformAccountId: "123",
    requestedAt: new Date("2026-10-16T09:00:00Z"),
  };

  it("repeated requests on the same day give the same key", () => {
    const a = profileAnalysisJobKeys(input);
    const b = profileAnalysisJobKeys({
      ...input,
      requestedAt: new Date("2026-10-16T23:59:59Z"),
    });
    expect(a).toEqual(b);
    expect(a.idempotencyKey).toMatch(
      /^profile_analysis:3f1b2c3d-0000-4000-8000-000000000001:[a-f0-9]{32}$/
    );
  });

  it("a new day, a changed handle or another profile gives a new key", () => {
    const a = profileAnalysisJobKeys(input).idempotencyKey;
    expect(
      profileAnalysisJobKeys({
        ...input,
        requestedAt: new Date("2026-10-17T00:00:01Z"),
      }).idempotencyKey
    ).not.toBe(a);
    expect(
      profileAnalysisJobKeys({ ...input, normalizedHandle: "noman_new" })
        .idempotencyKey
    ).not.toBe(a);
    expect(
      profileAnalysisJobKeys({
        ...input,
        socialProfileId: "3f1b2c3d-0000-4000-8000-000000000002",
      }).idempotencyKey
    ).not.toBe(a);
  });
});
