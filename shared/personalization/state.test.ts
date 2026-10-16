import { describe, expect, it } from "vitest";
import {
  deriveReadiness,
  deriveRunStatus,
  idsToConfirmForStep,
  initialStepStatuses,
  isPersonalizationComplete,
  isStaleSuggestion,
  liveItems,
  parseSocialHandle,
  planAiSuggestionMerge,
  planItemEdit,
  profileAnalysisIdempotencyKey,
  resolveResumeStep,
  type ItemRecord,
  type OnboardingProgressInput,
} from "./state";

describe("parseSocialHandle", () => {
  it("accepts plain, @ and mixed-case handles", () => {
    expect(parseSocialHandle("instagram", "Noman_Peera")).toEqual({
      ok: true,
      platform: "instagram",
      handle: "noman_peera",
    });
    expect(parseSocialHandle("instagram", "  @noman.peera ")).toEqual({
      ok: true,
      platform: "instagram",
      handle: "noman.peera",
    });
    expect(parseSocialHandle("tiktok", "@khaby.lame")).toMatchObject({
      ok: true,
      handle: "khaby.lame",
    });
    expect(parseSocialHandle("youtube", "@Mr-Beast")).toMatchObject({
      ok: true,
      handle: "mr-beast",
    });
  });

  it("accepts profile links for the chosen platform", () => {
    expect(
      parseSocialHandle(
        "instagram",
        "https://www.instagram.com/noman_peera/?hl=en"
      )
    ).toMatchObject({ ok: true, handle: "noman_peera" });
    expect(
      parseSocialHandle("instagram", "instagram.com/noman_peera")
    ).toMatchObject({ ok: true, handle: "noman_peera" });
    expect(
      parseSocialHandle("tiktok", "https://www.tiktok.com/@khaby.lame?lang=en")
    ).toMatchObject({ ok: true, handle: "khaby.lame" });
    expect(
      parseSocialHandle("youtube", "https://youtube.com/@mrbeast/shorts")
    ).toMatchObject({ ok: true, handle: "mrbeast" });
  });

  it("rejects empty, invalid, post links, channel ids and the wrong platform", () => {
    expect(parseSocialHandle("instagram", "   ")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(parseSocialHandle("instagram", "bad handle!")).toEqual({
      ok: false,
      reason: "invalid_handle",
    });
    expect(parseSocialHandle("instagram", "a".repeat(31))).toEqual({
      ok: false,
      reason: "invalid_handle",
    });
    expect(parseSocialHandle("tiktok", "a")).toEqual({
      ok: false,
      reason: "invalid_handle",
    });
    expect(
      parseSocialHandle("instagram", "https://instagram.com/reel/abc123")
    ).toEqual({ ok: false, reason: "unsupported_link" });
    expect(
      parseSocialHandle("youtube", "https://youtube.com/channel/UC123")
    ).toEqual({ ok: false, reason: "unsupported_link" });
    expect(
      parseSocialHandle("tiktok", "https://instagram.com/noman_peera")
    ).toEqual({ ok: false, reason: "platform_mismatch" });
  });
});

const base: OnboardingProgressInput = {
  hasConfirmedProfile: true,
  primaryUseCaseAnswered: true,
  attributionResolved: true,
  stepStatus: { goal: "pending", audience: "pending", pillars: "pending" },
  completedAt: null,
};

describe("resolveResumeStep", () => {
  it("follows the approved order", () => {
    expect(resolveResumeStep({ ...base, hasConfirmedProfile: false })).toBe(
      "platform"
    );
    expect(resolveResumeStep({ ...base, primaryUseCaseAnswered: false })).toBe(
      "use_case"
    );
    expect(resolveResumeStep({ ...base, attributionResolved: false })).toBe(
      "attribution"
    );
    expect(resolveResumeStep(base)).toBe("goal");
    expect(
      resolveResumeStep({
        ...base,
        stepStatus: {
          goal: "confirmed",
          audience: "suggested",
          pillars: "pending",
        },
      })
    ).toBe("audience");
    expect(
      resolveResumeStep({
        ...base,
        stepStatus: {
          goal: "skipped",
          audience: "confirmed",
          pillars: "suggested",
        },
      })
    ).toBe("pillars");
  });

  it("treats skipped and not_applicable as finished", () => {
    expect(
      resolveResumeStep({
        ...base,
        stepStatus: {
          goal: "skipped",
          audience: "not_applicable",
          pillars: "not_applicable",
        },
      })
    ).toBe("done");
  });

  it("completed users are done regardless of step state", () => {
    expect(
      resolveResumeStep({
        ...base,
        hasConfirmedProfile: false,
        completedAt: new Date(),
      })
    ).toBe("done");
  });
});

describe("initialStepStatuses (fewer than 10 posts rule)", () => {
  it("thin accounts get Goal only", () => {
    expect(initialStepStatuses(9)).toEqual({
      goal: "pending",
      audience: "not_applicable",
      pillars: "not_applicable",
    });
  });
  it("10+ posts or unknown keep all three", () => {
    expect(initialStepStatuses(10)).toEqual({
      goal: "pending",
      audience: "pending",
      pillars: "pending",
    });
    expect(initialStepStatuses(null)).toEqual({
      goal: "pending",
      audience: "pending",
      pillars: "pending",
    });
  });
});

describe("deriveReadiness: four independent signals", () => {
  const done = {
    goal: "confirmed",
    audience: "confirmed",
    pillars: "skipped",
  } as const;

  it("personalization can be complete while analysis is still running", () => {
    expect(
      deriveReadiness({
        stepStatus: done,
        latestRunStatus: "running",
        hasRecommendations: false,
        hasPlanCards: false,
      })
    ).toEqual({
      personalizationCompleted: true,
      analysisCompleted: false,
      recommendationsReady: false,
      planAvailable: false,
    });
  });

  it("a plan can exist before personalization", () => {
    const r = deriveReadiness({
      stepStatus: base.stepStatus,
      latestRunStatus: null,
      hasRecommendations: false,
      hasPlanCards: true,
    });
    expect(r.planAvailable).toBe(true);
    expect(r.personalizationCompleted).toBe(false);
  });

  it("partial analysis counts as completed, failed does not", () => {
    expect(
      deriveReadiness({
        stepStatus: done,
        latestRunStatus: "partial",
        hasRecommendations: false,
        hasPlanCards: false,
      }).analysisCompleted
    ).toBe(true);
    expect(
      deriveReadiness({
        stepStatus: done,
        latestRunStatus: "failed",
        hasRecommendations: false,
        hasPlanCards: false,
      }).analysisCompleted
    ).toBe(false);
  });

  it("isPersonalizationComplete needs every step finished", () => {
    expect(
      isPersonalizationComplete({
        goal: "confirmed",
        audience: "suggested",
        pillars: "confirmed",
      })
    ).toBe(false);
  });
});

function item(
  partial: Partial<ItemRecord> & Pick<ItemRecord, "id" | "kind" | "payload">
): ItemRecord {
  return {
    source: "ai_suggested",
    status: "suggested",
    basedOnVersion: 1,
    supersedesItemId: null,
    ...partial,
  } as ItemRecord;
}

describe("planAiSuggestionMerge: AI never overwrites the user", () => {
  it("never suggests over a confirmed single-value item (goal, niche, language)", () => {
    const existing = [
      item({
        id: "g1",
        kind: "goal",
        payload: { text: "Sell more ovens" },
        status: "confirmed",
      }),
    ];
    const plan = planAiSuggestionMerge(
      existing,
      [{ kind: "goal", payload: { text: "Grow a brand" } }],
      1
    );
    expect(plan.insert).toEqual([]);
    expect(plan.skipped).toEqual([
      { kind: "goal", reason: "user_value_locked" },
    ]);
  });

  it("never suggests over a user-written value even if not yet confirmed", () => {
    const existing = [
      item({
        id: "n1",
        kind: "niche",
        payload: { slug: "food", label: "Food" },
        source: "user_entered",
      }),
    ];
    expect(
      planAiSuggestionMerge(
        existing,
        [{ kind: "niche", payload: { slug: "fitness", label: "Fitness" } }],
        1
      ).insert
    ).toEqual([]);
  });

  it("skips duplicates and anything the user dismissed", () => {
    const existing = [
      item({
        id: "a1",
        kind: "audience",
        payload: { who: "Restaurant owners", outcome: "cut costs" },
        status: "confirmed",
        source: "user_entered",
      }),
      item({
        id: "p1",
        kind: "pillar",
        payload: {
          title: "Kitchen tours",
          description: "",
          viewSharePercent: 40,
        },
        status: "dismissed",
      }),
    ];
    const plan = planAiSuggestionMerge(
      existing,
      [
        {
          kind: "audience",
          payload: { who: "  restaurant OWNERS ", outcome: "Cut costs" },
        },
        {
          kind: "pillar",
          payload: {
            title: "kitchen tours",
            description: "x",
            viewSharePercent: 40,
          },
        },
        {
          kind: "pillar",
          payload: {
            title: "Equipment tips",
            description: "y",
            viewSharePercent: 25,
          },
        },
        {
          kind: "pillar",
          payload: {
            title: "Equipment Tips",
            description: "dup in same batch",
            viewSharePercent: 25,
          },
        },
      ],
      3
    );
    expect(plan.insert).toHaveLength(1);
    expect(plan.insert[0]).toMatchObject({
      kind: "pillar",
      source: "ai_suggested",
      status: "suggested",
      basedOnVersion: 3,
    });
  });

  it("only inserts: it never returns updates or deletes", () => {
    const plan = planAiSuggestionMerge(
      [],
      [{ kind: "language", payload: { code: "en", label: "English" } }],
      1
    );
    expect(Object.keys(plan).sort()).toEqual(["insert", "skipped"]);
  });
});

describe("planItemEdit: edits supersede, never delete", () => {
  it("editing a goal supersedes the old row, confirms the new one and bumps the version", () => {
    const goal = item({ id: "g1", kind: "goal", payload: { text: "Old" } });
    const plan = planItemEdit(goal, { text: "New" }, 2);
    expect(plan.supersedeItemId).toBe("g1");
    expect(plan.insert).toEqual({
      kind: "goal",
      payload: { text: "New" },
      source: "user_edited",
      status: "confirmed",
      basedOnVersion: 3,
      supersedesItemId: "g1",
    });
    expect(plan.nextVersion).toBe(3);
    expect(plan.invalidatedKinds).toEqual(["pillar"]);
  });

  it("editing an audience also invalidates pillar suggestions", () => {
    const a = item({
      id: "a1",
      kind: "audience",
      payload: { who: "x", outcome: "y" },
    });
    expect(
      planItemEdit(a, { who: "x2", outcome: "y" }, 5).invalidatedKinds
    ).toEqual(["pillar"]);
  });

  it("editing a pillar or language keeps the version (nothing depends on them)", () => {
    const p = item({
      id: "p1",
      kind: "pillar",
      payload: { title: "a", description: "b", viewSharePercent: 30 },
    });
    expect(
      planItemEdit(
        p,
        { title: "a2", description: "b", viewSharePercent: 30 },
        4
      ).nextVersion
    ).toBe(4);
  });

  it("refuses to edit superseded or dismissed rows", () => {
    const old = item({
      id: "g0",
      kind: "goal",
      payload: { text: "x" },
      status: "superseded",
    });
    expect(() => planItemEdit(old, { text: "y" }, 1)).toThrow();
  });
});

describe("stale suggestions and confirmation", () => {
  it("AI pillar suggestions built on older answers are stale; confirmed items never are", () => {
    const stale = item({
      id: "p1",
      kind: "pillar",
      payload: { title: "a", description: "", viewSharePercent: null },
      basedOnVersion: 1,
    });
    const fresh = item({
      id: "p2",
      kind: "pillar",
      payload: { title: "b", description: "", viewSharePercent: null },
      basedOnVersion: 2,
    });
    const confirmed = item({
      id: "p3",
      kind: "pillar",
      payload: { title: "c", description: "", viewSharePercent: null },
      basedOnVersion: 1,
      status: "confirmed",
    });
    const goalSuggestion = item({
      id: "g1",
      kind: "goal",
      payload: { text: "x" },
      basedOnVersion: 1,
    });
    expect(isStaleSuggestion(stale, 2)).toBe(true);
    expect(isStaleSuggestion(fresh, 2)).toBe(false);
    expect(isStaleSuggestion(confirmed, 2)).toBe(false);
    expect(isStaleSuggestion(goalSuggestion, 2)).toBe(false);
  });

  it("confirm on the Goal screen confirms goal, niche and language suggestions only", () => {
    const items = [
      item({ id: "g1", kind: "goal", payload: { text: "x" } }),
      item({
        id: "n1",
        kind: "niche",
        payload: { slug: "food", label: "Food" },
      }),
      item({
        id: "l1",
        kind: "language",
        payload: { code: "en", label: "English" },
        status: "confirmed",
      }),
      item({ id: "a1", kind: "audience", payload: { who: "a", outcome: "b" } }),
    ];
    expect(idsToConfirmForStep("goal", items)).toEqual(["g1", "n1"]);
    expect(idsToConfirmForStep("audience", items)).toEqual(["a1"]);
  });

  it("liveItems hides superseded and dismissed rows", () => {
    const items = [
      item({
        id: "1",
        kind: "goal",
        payload: { text: "a" },
        status: "superseded",
      }),
      item({
        id: "2",
        kind: "goal",
        payload: { text: "b" },
        status: "confirmed",
      }),
      item({
        id: "3",
        kind: "pillar",
        payload: { title: "c", description: "", viewSharePercent: null },
        status: "dismissed",
      }),
    ];
    expect(liveItems(items).map(i => i.id)).toEqual(["2"]);
  });
});

describe("analysis runs", () => {
  it("idempotency key is stable and validated", () => {
    const k = profileAnalysisIdempotencyKey(
      "3f1b2c3d-0000-4000-8000-000000000001",
      "a1b2c3d4e5f60718"
    );
    expect(k).toBe(
      "profile_analysis:3f1b2c3d-0000-4000-8000-000000000001:a1b2c3d4e5f60718"
    );
    expect(
      profileAnalysisIdempotencyKey(
        "3f1b2c3d-0000-4000-8000-000000000001",
        "a1b2c3d4e5f60718"
      )
    ).toBe(k);
    expect(() =>
      profileAnalysisIdempotencyKey("bad id;drop", "a1b2c3d4e5f60718")
    ).toThrow();
    expect(() => profileAnalysisIdempotencyKey("abc", "NOTHEX")).toThrow();
  });

  it("run status comes from real stage states", () => {
    expect(deriveRunStatus({})).toBe("queued");
    expect(
      deriveRunStatus({
        published_content: "done",
        strongest_performers: "running",
      })
    ).toBe("running");
    expect(
      deriveRunStatus({
        published_content: "done",
        strongest_performers: "done",
        hooks_and_topics: "skipped",
        niche_opportunities: "done",
      })
    ).toBe("succeeded");
    expect(
      deriveRunStatus({
        published_content: "done",
        strongest_performers: "failed",
        hooks_and_topics: "done",
        niche_opportunities: "done",
      })
    ).toBe("partial");
    expect(
      deriveRunStatus({
        published_content: "failed",
        strongest_performers: "failed",
        hooks_and_topics: "failed",
        niche_opportunities: "failed",
      })
    ).toBe("failed");
  });
});
