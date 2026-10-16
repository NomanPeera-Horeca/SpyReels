import { describe, expect, it } from "vitest";
import type { AnalysisAvailability, SocialProfileStatus } from "./model";
import {
  allowedSuggestionEvidence,
  canCompleteStep,
  deriveReadiness,
  decideAnalysisRequest,
  deriveRunStatus,
  idsToSupersedeOnRegeneration,
  idsToConfirmForStep,
  initialStepStatuses,
  isPersonalizationComplete,
  isStaleSuggestion,
  liveItems,
  parseSocialHandle,
  planAiSuggestionMerge,
  planDismiss,
  planItemEdit,
  profileAnalysisIdempotencyKey,
  resolveActiveProfileId,
  resolveAnalysisAvailability,
  resolveResumeStep,
  validateSuggestion,
  type AiSuggestion,
  type ExistingRunSummary,
  type ItemRecord,
  type OnboardingProgressInput,
} from "./state";

/* ------------------------------------------------------------------ */
/* Handles                                                             */
/* ------------------------------------------------------------------ */

describe("parseSocialHandle", () => {
  it("accepts plain, @ and mixed-case handles", () => {
    expect(parseSocialHandle("instagram", "Noman_Peera")).toEqual({
      ok: true,
      platform: "instagram",
      handle: "noman_peera",
    });
    expect(parseSocialHandle("instagram", "  @noman.peera ")).toMatchObject({
      ok: true,
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
    ).toMatchObject({
      ok: true,
      handle: "noman_peera",
    });
    expect(
      parseSocialHandle("instagram", "instagram.com/noman_peera")
    ).toMatchObject({ ok: true, handle: "noman_peera" });
    expect(
      parseSocialHandle("tiktok", "https://www.tiktok.com/@khaby.lame?lang=en")
    ).toMatchObject({
      ok: true,
      handle: "khaby.lame",
    });
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

/* ------------------------------------------------------------------ */
/* Task 1: every user gets Goal, Audience and Pillars                  */
/* ------------------------------------------------------------------ */

type Case = {
  name: string;
  profileStatus: SocialProfileStatus;
  latestRunStatus: "succeeded" | "partial" | "failed" | "running" | null;
  postsInWindow: number | null;
  expected: AnalysisAvailability;
  mayClaimPerformance: boolean;
};

const CASES: Case[] = [
  {
    name: "established creator (450 posts)",
    profileStatus: "confirmed",
    latestRunStatus: "succeeded",
    postsInWindow: 450,
    expected: "available",
    mayClaimPerformance: true,
  },
  {
    name: "small creator (1 post)",
    profileStatus: "confirmed",
    latestRunStatus: "succeeded",
    postsInWindow: 1,
    expected: "available",
    mayClaimPerformance: true,
  },
  {
    name: "small creator (9 posts)",
    profileStatus: "confirmed",
    latestRunStatus: "partial",
    postsInWindow: 9,
    expected: "available",
    mayClaimPerformance: true,
  },
  {
    name: "new account (0 public posts)",
    profileStatus: "confirmed",
    latestRunStatus: "succeeded",
    postsInWindow: 0,
    expected: "no_public_posts",
    mayClaimPerformance: false,
  },
  {
    name: "private account",
    profileStatus: "private",
    latestRunStatus: null,
    postsInWindow: null,
    expected: "private_account",
    mayClaimPerformance: false,
  },
  {
    name: '"I don\'t post yet"',
    profileStatus: "not_posting_yet",
    latestRunStatus: null,
    postsInWindow: null,
    expected: "not_posting_yet",
    mayClaimPerformance: false,
  },
  {
    name: "analysis failed",
    profileStatus: "confirmed",
    latestRunStatus: "failed",
    postsInWindow: null,
    expected: "unavailable",
    mayClaimPerformance: false,
  },
  {
    name: "analysis still running",
    profileStatus: "confirmed",
    latestRunStatus: "running",
    postsInWindow: null,
    expected: "in_progress",
    mayClaimPerformance: false,
  },
];

describe("no post-count threshold: every user completes Goal > Audience > Pillars", () => {
  it("every profile starts with all three steps pending", () => {
    expect(initialStepStatuses()).toEqual({
      goal: "pending",
      audience: "pending",
      pillars: "pending",
    });
  });

  for (const c of CASES) {
    describe(c.name, () => {
      const availability = resolveAnalysisAvailability(c);

      it(`analysis availability is "${c.expected}"`, () => {
        expect(availability).toBe(c.expected);
      });

      it("can complete all three steps (never blocked by analysis)", () => {
        for (const step of ["goal", "audience", "pillars"] as const) {
          expect(canCompleteStep(step, availability)).toBe(true);
        }
      });

      it("resumes through Goal, Audience and Pillars in order, never skipping one", () => {
        const seen: string[] = [];
        const stepStatus = initialStepStatuses();
        const progress: OnboardingProgressInput = {
          hasConfirmedProfile: true,
          primaryUseCaseAnswered: true,
          attributionResolved: true,
          stepStatus,
          completedAt: null,
        };
        for (let i = 0; i < 4; i++) {
          const step = resolveResumeStep(progress);
          seen.push(step);
          if (step === "done") break;
          stepStatus[step as "goal" | "audience" | "pillars"] = "confirmed";
        }
        expect(seen).toEqual(["goal", "audience", "pillars", "done"]);
      });

      it("gets AI recommendations for audiences and pillars; numbers only with real history", () => {
        expect(allowedSuggestionEvidence(availability)).toContain(
          "profile_inferred"
        );
        expect(
          allowedSuggestionEvidence(availability).includes("performance_backed")
        ).toBe(c.mayClaimPerformance);

        const recommended: AiSuggestion[] = [
          {
            kind: "audience",
            payload: { who: "Restaurant owners", outcome: "open faster" },
            evidence: "profile_inferred",
            analysisRunId: null,
          },
          {
            kind: "pillar",
            payload: {
              title: "Kitchen setup tips",
              description: "How to plan a line",
              viewSharePercent: null,
            },
            evidence: "profile_inferred",
            analysisRunId: null,
          },
        ];
        const plan = planAiSuggestionMerge([], recommended, 1, availability);
        expect(plan.insert.map(i => [i.kind, i.evidence])).toEqual([
          ["audience", "profile_inferred"],
          ["pillar", "profile_inferred"],
        ]);
      });

      it(
        c.mayClaimPerformance
          ? "may show a measured view share"
          : "may NOT show any measured number",
        () => {
          const measured: AiSuggestion = {
            kind: "pillar",
            payload: { title: "Tours", description: "", viewSharePercent: 42 },
            evidence: "performance_backed",
            analysisRunId: "run-1",
          };
          expect(validateSuggestion(measured, availability)).toBe(
            c.mayClaimPerformance
              ? null
              : "performance_evidence_without_analysis"
          );
        }
      );
    });
  }

  it("an AI-recommended pillar can never carry a view share", () => {
    expect(
      validateSuggestion(
        {
          kind: "pillar",
          payload: { title: "T", description: "", viewSharePercent: 30 },
          evidence: "profile_inferred",
          analysisRunId: null,
        },
        "available"
      )
    ).toBe("numbers_without_performance_evidence");
  });

  it("performance-backed suggestions must name the analysis run", () => {
    expect(
      validateSuggestion(
        {
          kind: "audience",
          payload: { who: "a", outcome: "b" },
          evidence: "performance_backed",
          analysisRunId: null,
        },
        "available"
      )
    ).toBe("performance_evidence_without_run");
  });

  it("the shared model has no post-count threshold or 'not applicable' step state", async () => {
    const model = await import("./model");
    expect(Object.keys(model).some(k => /MIN_POSTS/i.test(k))).toBe(false);
    expect(
      (model.STEP_STATUSES as readonly string[]).includes("not_applicable")
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Resume and readiness                                                */
/* ------------------------------------------------------------------ */

const base: OnboardingProgressInput = {
  hasConfirmedProfile: true,
  primaryUseCaseAnswered: true,
  attributionResolved: true,
  stepStatus: { goal: "pending", audience: "pending", pillars: "pending" },
  completedAt: null,
};

describe("resolveResumeStep: interrupted onboarding resumes at the first unfinished step", () => {
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

  it("an earlier unfinished step wins over later finished ones", () => {
    expect(
      resolveResumeStep({
        ...base,
        stepStatus: {
          goal: "suggested",
          audience: "confirmed",
          pillars: "confirmed",
        },
      })
    ).toBe("goal");
  });

  it("skipped steps count as finished; completed users are done", () => {
    expect(
      resolveResumeStep({
        ...base,
        stepStatus: {
          goal: "skipped",
          audience: "skipped",
          pillars: "skipped",
        },
      })
    ).toBe("done");
    expect(
      resolveResumeStep({
        ...base,
        hasConfirmedProfile: false,
        completedAt: new Date(),
      })
    ).toBe("done");
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

  it("personalization can be complete with no analysis at all (private / not posting yet)", () => {
    const r = deriveReadiness({
      stepStatus: done,
      latestRunStatus: null,
      hasRecommendations: true,
      hasPlanCards: false,
    });
    expect(r).toEqual({
      personalizationCompleted: true,
      analysisCompleted: false,
      recommendationsReady: true,
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

/* ------------------------------------------------------------------ */
/* Task 3: preserve confirmed preferences and history                  */
/* ------------------------------------------------------------------ */

function item(
  partial: Partial<ItemRecord> & Pick<ItemRecord, "id" | "kind" | "payload">
): ItemRecord {
  return {
    source: "ai_suggested",
    status: "suggested",
    evidence: "profile_inferred",
    analysisRunId: null,
    basedOnVersion: 1,
    dismissedAtVersion: null,
    supersedesItemId: null,
    ...partial,
  } as ItemRecord;
}

const suggest = (
  s: Omit<AiSuggestion, "evidence" | "analysisRunId"> & Partial<AiSuggestion>
): AiSuggestion => ({
  evidence: "profile_inferred",
  analysisRunId: null,
  ...s,
});

describe("AI suggestions never silently overwrite confirmed values", () => {
  it("never suggests over a confirmed single value (goal, niche, language)", () => {
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
      [suggest({ kind: "goal", payload: { text: "Grow a brand" } })],
      1,
      "available"
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
        evidence: "user_provided",
      }),
    ];
    expect(
      planAiSuggestionMerge(
        existing,
        [
          suggest({
            kind: "niche",
            payload: { slug: "fitness", label: "Fitness" },
          }),
        ],
        1,
        "available"
      ).insert
    ).toEqual([]);
  });

  it("only inserts: it never returns updates or deletes", () => {
    const plan = planAiSuggestionMerge(
      [],
      [
        suggest({
          kind: "language",
          payload: { code: "en", label: "English" },
        }),
      ],
      1,
      "available"
    );
    expect(Object.keys(plan).sort()).toEqual(["insert", "skipped"]);
  });

  it("existing confirmed pillars are kept; new suggestions are added beside them", () => {
    const existing = [
      item({
        id: "p1",
        kind: "pillar",
        payload: {
          title: "Kitchen tours",
          description: "",
          viewSharePercent: null,
        },
        status: "confirmed",
      }),
    ];
    const plan = planAiSuggestionMerge(
      existing,
      [
        suggest({
          kind: "pillar",
          payload: {
            title: "Kitchen Tours",
            description: "rewrite",
            viewSharePercent: null,
          },
        }),
        suggest({
          kind: "pillar",
          payload: {
            title: "Equipment tips",
            description: "",
            viewSharePercent: null,
          },
        }),
      ],
      2,
      "no_public_posts"
    );
    expect(plan.skipped).toEqual([{ kind: "pillar", reason: "duplicate" }]);
    expect(
      plan.insert.map(i => (i.payload as { title: string }).title)
    ).toEqual(["Equipment tips"]);
  });

  it("rejects suggestions with invented numbers instead of storing them", () => {
    const plan = planAiSuggestionMerge(
      [],
      [
        suggest({
          kind: "pillar",
          payload: { title: "Tours", description: "", viewSharePercent: 55 },
        }),
      ],
      1,
      "no_public_posts"
    );
    expect(plan.insert).toEqual([]);
    expect(plan.skipped).toEqual([
      { kind: "pillar", reason: "numbers_without_performance_evidence" },
    ]);
  });
});

describe("dismissed suggestions do not reappear without a legitimate new recommendation", () => {
  const dismissed = item({
    id: "p9",
    kind: "pillar",
    payload: { title: "Recipes", description: "", viewSharePercent: null },
    status: "dismissed",
    basedOnVersion: 1,
    dismissedAtVersion: 2,
  });
  const again = suggest({
    kind: "pillar",
    payload: {
      title: "recipes",
      description: "re-run",
      viewSharePercent: null,
    },
  });

  it("blocked while the user's answers are unchanged (same or older version)", () => {
    expect(
      planAiSuggestionMerge([dismissed], [again], 2, "available").skipped
    ).toEqual([{ kind: "pillar", reason: "dismissed" }]);
  });

  it("allowed again once goal or audience changed (version moved on)", () => {
    expect(
      planAiSuggestionMerge([dismissed], [again], 3, "available").insert
    ).toHaveLength(1);
  });

  it("planDismiss records the version at dismissal; only suggestions can be dismissed", () => {
    const s = item({
      id: "s1",
      kind: "pillar",
      payload: { title: "x", description: "", viewSharePercent: null },
    });
    expect(planDismiss(s, 4)).toEqual({
      itemId: "s1",
      status: "dismissed",
      dismissedAtVersion: 4,
    });
    expect(() => planDismiss({ ...s, status: "confirmed" }, 4)).toThrow();
  });
});

describe("edits preserve history and invalidate dependent pillars", () => {
  it("editing a goal supersedes the old row, confirms the new one and bumps the version", () => {
    const goal = item({ id: "g1", kind: "goal", payload: { text: "Old" } });
    const plan = planItemEdit(goal, { text: "New" }, 2);
    expect(plan).toEqual({
      supersedeItemId: "g1",
      insert: {
        kind: "goal",
        payload: { text: "New" },
        source: "user_edited",
        status: "confirmed",
        evidence: "user_provided",
        analysisRunId: null,
        basedOnVersion: 3,
        dismissedAtVersion: null,
        supersedesItemId: "g1",
      },
      nextVersion: 3,
      invalidatedKinds: ["pillar"],
    });
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

  it("an edit plan touches only items: no analysis run is changed or deleted", () => {
    const a = item({
      id: "a1",
      kind: "audience",
      payload: { who: "x", outcome: "y" },
    });
    expect(
      Object.keys(planItemEdit(a, { who: "z", outcome: "y" }, 1)).sort()
    ).toEqual(["insert", "invalidatedKinds", "nextVersion", "supersedeItemId"]);
  });

  it("editing a measured pillar's title keeps the real view share and its run", () => {
    const p = item({
      id: "p1",
      kind: "pillar",
      payload: { title: "Tours", description: "a", viewSharePercent: 38 },
      evidence: "performance_backed",
      analysisRunId: "run-1",
      status: "confirmed",
    });
    const plan = planItemEdit(
      p,
      { title: "Kitchen tours", description: "a", viewSharePercent: 38 },
      4
    );
    expect(plan.insert).toMatchObject({
      evidence: "performance_backed",
      analysisRunId: "run-1",
      payload: { viewSharePercent: 38 },
    });
    expect(plan.nextVersion).toBe(4);
  });

  it("a user cannot type a 'measured' view share", () => {
    const p = item({
      id: "p1",
      kind: "pillar",
      payload: { title: "Tours", description: "", viewSharePercent: null },
    });
    const plan = planItemEdit(
      p,
      { title: "Tours", description: "", viewSharePercent: 90 },
      1
    );
    expect(plan.insert).toMatchObject({
      evidence: "user_provided",
      analysisRunId: null,
      payload: { viewSharePercent: null },
    });
    const m = item({
      id: "p2",
      kind: "pillar",
      payload: { title: "T", description: "", viewSharePercent: 20 },
      evidence: "performance_backed",
      analysisRunId: "r",
    });
    expect(
      planItemEdit(m, { title: "T", description: "", viewSharePercent: 70 }, 1)
        .insert
    ).toMatchObject({
      evidence: "user_provided",
      payload: { viewSharePercent: null },
    });
  });

  it("refuses to edit superseded or dismissed rows", () => {
    expect(() =>
      planItemEdit(
        item({
          id: "g0",
          kind: "goal",
          payload: { text: "x" },
          status: "superseded",
        }),
        { text: "y" },
        1
      )
    ).toThrow();
    expect(() =>
      planItemEdit(
        item({
          id: "g0",
          kind: "goal",
          payload: { text: "x" },
          status: "dismissed",
          dismissedAtVersion: 1,
        }),
        { text: "y" },
        1
      )
    ).toThrow();
  });
});

describe("stale suggestions and confirmation", () => {
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

  it("AI pillar suggestions built on older answers are stale; confirmed pillars never are", () => {
    expect(isStaleSuggestion(stale, 2)).toBe(true);
    expect(isStaleSuggestion(fresh, 2)).toBe(false);
    expect(isStaleSuggestion(confirmed, 2)).toBe(false);
    expect(
      isStaleSuggestion(
        item({
          id: "g1",
          kind: "goal",
          payload: { text: "x" },
          basedOnVersion: 1,
        }),
        2
      )
    ).toBe(false);
  });

  it("confirming Pillars confirms fresh suggestions only, never stale ones", () => {
    expect(
      idsToConfirmForStep("pillars", [stale, fresh, confirmed], 2)
    ).toEqual(["p2"]);
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
    expect(idsToConfirmForStep("goal", items, 1)).toEqual(["g1", "n1"]);
    expect(idsToConfirmForStep("audience", items, 1)).toEqual(["a1"]);
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
        dismissedAtVersion: 1,
      }),
    ];
    expect(liveItems(items).map(i => i.id)).toEqual(["2"]);
  });
});

/* ------------------------------------------------------------------ */
/* Active profile                                                      */
/* ------------------------------------------------------------------ */

describe("resolveActiveProfileId: never a stale or foreign profile", () => {
  const WS = "ws-a";
  const profiles = [
    {
      id: "p-new",
      workspaceId: WS,
      deletedAt: null,
      createdAt: new Date("2026-03-01"),
    },
    {
      id: "p-old",
      workspaceId: WS,
      deletedAt: null,
      createdAt: new Date("2026-01-01"),
    },
    {
      id: "p-gone",
      workspaceId: WS,
      deletedAt: new Date(),
      createdAt: new Date("2025-12-01"),
    },
    {
      id: "p-other",
      workspaceId: "ws-b",
      deletedAt: null,
      createdAt: new Date("2025-01-01"),
    },
  ];

  it("honors a valid selection", () => {
    expect(
      resolveActiveProfileId({
        workspaceId: WS,
        storedSelectionId: "p-new",
        profiles,
      })
    ).toEqual({ profileId: "p-new", selectionWasStale: false });
  });

  it("a selection pointing at a deleted profile falls back to the oldest live one", () => {
    expect(
      resolveActiveProfileId({
        workspaceId: WS,
        storedSelectionId: "p-gone",
        profiles,
      })
    ).toEqual({ profileId: "p-old", selectionWasStale: true });
  });

  it("a selection pointing at another workspace is never returned", () => {
    expect(
      resolveActiveProfileId({
        workspaceId: WS,
        storedSelectionId: "p-other",
        profiles,
      })
    ).toEqual({ profileId: "p-old", selectionWasStale: true });
  });

  it("no live profiles gives null", () => {
    expect(
      resolveActiveProfileId({
        workspaceId: "ws-empty",
        storedSelectionId: null,
        profiles,
      })
    ).toEqual({ profileId: null, selectionWasStale: false });
  });
});

/* ------------------------------------------------------------------ */
/* Analysis runs                                                       */
/* ------------------------------------------------------------------ */

describe("analysis runs", () => {
  it("idempotency key is stable and validated", () => {
    const k = profileAnalysisIdempotencyKey(
      "3f1b2c3d-0000-4000-8000-000000000001",
      "a1b2c3d4e5f60718"
    );
    expect(k).toBe(
      "profile_analysis:3f1b2c3d-0000-4000-8000-000000000001:a1b2c3d4e5f60718"
    );
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

/* ------------------------------------------------------------------ */
/* Task 2: retry vs user refresh vs background refresh                 */
/* ------------------------------------------------------------------ */

describe("decideAnalysisRequest", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);
  const run = (over: Partial<ExistingRunSummary>): ExistingRunSummary => ({
    id: "r1",
    requestKind: "initial",
    status: "succeeded",
    sameAccountIdentity: true,
    createdAt: minutesAgo(120),
    completedAt: minutesAgo(110),
    ...over,
  });

  describe("never calls the provider for accounts we cannot analyze", () => {
    for (const profileStatus of [
      "private",
      "not_posting_yet",
      "not_found",
      "lookup_failed",
    ] as const) {
      it(profileStatus, () => {
        for (const requestKind of [
          "initial",
          "user_refresh",
          "background",
        ] as const) {
          expect(
            decideAnalysisRequest({
              requestKind,
              profileStatus,
              runs: [],
              now,
              usageAllowed: true,
            })
          ).toEqual({ action: "reject", reason: "not_analyzable" });
        }
      });
    }
  });

  describe("automatic retry and repeated requests", () => {
    it("first 'That's me' creates the initial run", () => {
      expect(
        decideAnalysisRequest({
          requestKind: "initial",
          profileStatus: "confirmed",
          runs: [],
          now,
        })
      ).toEqual({
        action: "create",
        requestKind: "initial",
        refreshSequence: null,
        periodIndex: null,
      });
    });

    it("reload or double tap while running reuses the active run (no duplicate job)", () => {
      const active = run({
        id: "r-active",
        status: "running",
        completedAt: null,
      });
      for (const requestKind of [
        "initial",
        "user_refresh",
        "background",
      ] as const) {
        expect(
          decideAnalysisRequest({
            requestKind,
            profileStatus: "confirmed",
            runs: [active],
            now,
            usageAllowed: true,
          })
        ).toEqual({ action: "reuse_active", runId: "r-active" });
      }
    });

    it("a failed initial analysis is retried in place (same run, same key)", () => {
      expect(
        decideAnalysisRequest({
          requestKind: "initial",
          profileStatus: "confirmed",
          runs: [run({ id: "r-failed", status: "failed" })],
          now,
        })
      ).toEqual({ action: "retry_failed", runId: "r-failed" });
    });

    it("after success, 'That's me' again reuses the finished run (no new provider work)", () => {
      expect(
        decideAnalysisRequest({
          requestKind: "initial",
          profileStatus: "confirmed",
          runs: [run({ id: "r-ok" })],
          now,
        })
      ).toEqual({ action: "reuse_completed", runId: "r-ok" });
    });

    it("a changed handle counts as a new account: a new initial run", () => {
      expect(
        decideAnalysisRequest({
          requestKind: "initial",
          profileStatus: "confirmed",
          runs: [run({ sameAccountIdentity: false })],
          now,
        })
      ).toMatchObject({ action: "create", requestKind: "initial" });
    });
  });

  describe("user-authorized refresh", () => {
    it("allowed on the same day once the cooldown has passed: creates run n+1, keeps history", () => {
      const runs = [
        run({ id: "r0", requestKind: "initial", completedAt: minutesAgo(300) }),
        run({
          id: "r1",
          requestKind: "user_refresh",
          completedAt: minutesAgo(61),
        }),
      ];
      expect(
        decideAnalysisRequest({
          requestKind: "user_refresh",
          profileStatus: "confirmed",
          runs,
          now,
          usageAllowed: true,
        })
      ).toEqual({
        action: "create",
        requestKind: "user_refresh",
        refreshSequence: 2,
        periodIndex: null,
      });
    });

    it("refused during the cooldown, with the time it becomes available", () => {
      const d = decideAnalysisRequest({
        requestKind: "user_refresh",
        profileStatus: "confirmed",
        runs: [run({ completedAt: minutesAgo(10) })],
        now,
        usageAllowed: true,
      });
      expect(d).toEqual({
        action: "reject",
        reason: "cooldown",
        retryAfter: new Date(now.getTime() + 50 * 60_000),
      });
    });

    it("refused when the existing usage-limit check says no", () => {
      expect(
        decideAnalysisRequest({
          requestKind: "user_refresh",
          profileStatus: "confirmed",
          runs: [],
          now,
          usageAllowed: false,
        })
      ).toEqual({ action: "reject", reason: "usage_limit" });
      expect(
        decideAnalysisRequest({
          requestKind: "user_refresh",
          profileStatus: "confirmed",
          runs: [],
          now,
        })
      ).toEqual({ action: "reject", reason: "usage_limit" });
    });

    it("a failed run also starts the cooldown (no hammering a failing provider)", () => {
      expect(
        decideAnalysisRequest({
          requestKind: "user_refresh",
          profileStatus: "confirmed",
          runs: [run({ status: "failed", completedAt: minutesAgo(5) })],
          now,
          usageAllowed: true,
        })
      ).toMatchObject({ action: "reject", reason: "cooldown" });
    });
  });

  describe("background refresh", () => {
    const enabled = {
      userRefreshCooldownMinutes: 60,
      backgroundRefreshEnabled: true,
      backgroundRefreshIntervalDays: 7,
    };

    it("off by default (no approved policy yet)", () => {
      expect(
        decideAnalysisRequest({
          requestKind: "background",
          profileStatus: "confirmed",
          runs: [],
          now,
        })
      ).toEqual({ action: "reject", reason: "background_disabled" });
    });

    it("when enabled, skips profiles analyzed within the interval", () => {
      const d = decideAnalysisRequest({
        requestKind: "background",
        profileStatus: "confirmed",
        runs: [run({ completedAt: minutesAgo(60 * 24 * 3) })],
        now,
        policy: enabled,
      });
      expect(d).toMatchObject({ action: "reject", reason: "fresh_enough" });
    });

    it("when enabled and stale, creates one run for the current period", () => {
      const d = decideAnalysisRequest({
        requestKind: "background",
        profileStatus: "confirmed",
        runs: [run({ completedAt: minutesAgo(60 * 24 * 8) })],
        now,
        policy: enabled,
      });
      expect(d).toEqual({
        action: "create",
        requestKind: "background",
        refreshSequence: null,
        periodIndex: Math.floor(now.getTime() / (7 * 86_400_000)),
      });
    });
  });
});

/* ------------------------------------------------------------------ */
/* Task 1: regeneration never touches confirmed values                 */
/* ------------------------------------------------------------------ */

describe("idsToSupersedeOnRegeneration", () => {
  const items: ItemRecord[] = [
    item({
      id: "old-ai",
      kind: "pillar",
      payload: { title: "a", description: "", viewSharePercent: null },
      analysisRunId: "run-1",
    }),
    item({
      id: "inferred",
      kind: "pillar",
      payload: { title: "b", description: "", viewSharePercent: null },
    }),
    item({
      id: "confirmed",
      kind: "pillar",
      payload: { title: "c", description: "", viewSharePercent: 30 },
      status: "confirmed",
      evidence: "performance_backed",
      analysisRunId: "run-1",
    }),
    item({
      id: "user",
      kind: "pillar",
      payload: { title: "d", description: "", viewSharePercent: null },
      source: "user_entered",
      evidence: "user_provided",
    }),
    item({
      id: "dismissed",
      kind: "pillar",
      payload: { title: "e", description: "", viewSharePercent: null },
      status: "dismissed",
      dismissedAtVersion: 1,
    }),
    item({
      id: "new-run",
      kind: "pillar",
      payload: { title: "f", description: "", viewSharePercent: null },
      analysisRunId: "run-2",
    }),
    item({ id: "goal-ai", kind: "goal", payload: { text: "g" } }),
  ];

  it("supersedes only unconfirmed AI suggestions of the regenerated kinds from older runs", () => {
    expect(idsToSupersedeOnRegeneration(items, "run-2", ["pillar"])).toEqual([
      "old-ai",
      "inferred",
    ]);
  });

  it("confirmed, user-written and dismissed values are never in the list", () => {
    const ids = idsToSupersedeOnRegeneration(items, "run-2", [
      "pillar",
      "goal",
      "audience",
      "niche",
      "language",
    ]);
    for (const kept of ["confirmed", "user", "dismissed", "new-run"])
      expect(ids).not.toContain(kept);
  });
});
