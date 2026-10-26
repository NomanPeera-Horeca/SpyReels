import { describe, expect, it } from "vitest";
import {
  confirmedAnswerKey,
  recommendationEvidenceToken,
  recommendationJobKey,
  recommendationStateFromSources,
  shouldStartRecommendationJob,
} from "./jobs";

describe("recommendationStateFromSources", () => {
  it("reads a finished outcome from the job row when this process has no memory", () => {
    expect(
      recommendationStateFromSources({
        job: {
          status: "succeeded",
          payload: { outcome: { state: "clarify", question: "What should the videos do?" } },
          at: 20,
        },
        memory: null,
        suggestionsSaved: false,
      })
    ).toEqual({
      state: "clarify",
      question: "What should the videos do?",
      at: 20,
    });
  });

  it("treats saved suggestions as done when the job row is on another instance's memory only", () => {
    expect(
      recommendationStateFromSources({
        job: null,
        memory: null,
        suggestionsSaved: true,
      })
    ).toEqual({ state: "done", at: 1 });
  });

  it("keeps a failed goal failed when other suggestions for the step were saved", () => {
    expect(
      recommendationStateFromSources({
        job: { status: "failed", payload: { outcome: { state: "failed" } }, at: 30 },
        memory: null,
        suggestionsSaved: true,
        liveSuggestions: true,
      })
    ).toEqual({ state: "failed", at: 30 });
  });

  it("lets a finished job override stale in-memory running", () => {
    expect(
      recommendationStateFromSources({
        job: { status: "succeeded", payload: { outcome: { state: "done" } }, at: 30 },
        memory: { state: "running", at: 5 },
        suggestionsSaved: false,
      })
    ).toEqual({ state: "done", at: 30 });
    expect(
      recommendationStateFromSources({
        job: { status: "failed", payload: { outcome: { state: "failed" } }, at: 30 },
        memory: { state: "running" },
        suggestionsSaved: false,
      }).state
    ).toBe("failed");
  });

  it("keeps a newer in-flight retry running after an older failed row", () => {
    expect(
      recommendationStateFromSources({
        job: { status: "failed", payload: { outcome: { state: "failed" } }, at: 10 },
        memory: { state: "running", at: 20 },
        suggestionsSaved: false,
      })
    ).toEqual({ state: "running", at: 20 });
  });

  it("tracks a real enrichment while saved suggestions stay available", () => {
    expect(
      recommendationStateFromSources({
        job: null,
        memory: { state: "running", at: 40 },
        suggestionsSaved: false,
        liveSuggestions: true,
      }).state
    ).toBe("running");
  });

  it("shows saved suggestions when a newer evidence key has no job yet", () => {
    expect(
      recommendationStateFromSources({
        job: null,
        memory: { state: "running" },
        suggestionsSaved: false,
        liveSuggestions: true,
      })
    ).toEqual({ state: "done", at: 1 });
    expect(
      recommendationStateFromSources({
        job: null,
        memory: null,
        suggestionsSaved: false,
        liveSuggestions: false,
      })
    ).toBeNull();
  });

  it("does not start another model call when this evidence key already finished", () => {
    expect(shouldStartRecommendationJob(null)).toBe(true);
    expect(shouldStartRecommendationJob("succeeded")).toBe(false);
    expect(shouldStartRecommendationJob("failed")).toBe(false);
    expect(shouldStartRecommendationJob("dead")).toBe(false);
  });

  it("starts exactly one new job for a confirmed answer and reuses it", () => {
    const profile = {
      profileId: "profile-1",
      version: 1,
      evidence: "profile",
    };
    const answer = "I photograph weddings for couples.";
    const confirmedGoal = {
      kind: "goal",
      status: "confirmed",
      payload: { text: answer },
    };
    const open = recommendationJobKey({
      ...profile,
      step: "goal",
      answerKey: confirmedAnswerKey("goal", []),
    });
    const answered = recommendationJobKey({
      ...profile,
      step: "goal",
      answerKey: confirmedAnswerKey("goal", [confirmedGoal]),
    });
    expect(answered).not.toBe(open);
    const started = new Map<string, "succeeded">();
    const request = (key: string) => {
      if (shouldStartRecommendationJob(started.get(key) ?? null)) {
        started.set(key, "succeeded");
        return "start";
      }
      return "reuse";
    };
    expect(request(open)).toBe("start");
    expect(request(open)).toBe("reuse");
    expect(request(answered)).toBe("start");
    expect(request(answered)).toBe("reuse");
    expect([...started.keys()]).toEqual([open, answered]);
    const audienceAnswered = recommendationJobKey({
      ...profile,
      step: "audience",
      answerKey: confirmedAnswerKey("audience", [confirmedGoal]),
    });
    expect(request(audienceAnswered)).toBe("start");
    expect(request(audienceAnswered)).toBe("reuse");
    const goalAfterAudience = recommendationJobKey({
      ...profile,
      step: "goal",
      answerKey: confirmedAnswerKey("goal", [
        confirmedGoal,
        { kind: "audience", status: "confirmed", payload: { who: "Couples", outcome: "remember the day" } },
      ]),
    });
    expect(goalAfterAudience).toBe(answered);
    expect(request(goalAfterAudience)).toBe("reuse");
  });

  it("keeps an abstention on one key and changes the key after a confirmed answer", () => {
    const base = {
      profileId: "profile-1",
      step: "goal" as const,
      version: 1,
      evidence: "profile",
    };
    const open = confirmedAnswerKey("goal", []);
    expect(open).toBe("open");
    const abstained = recommendationJobKey({ ...base, answerKey: open });
    expect(recommendationJobKey({ ...base, answerKey: open })).toBe(abstained);
    const answered = confirmedAnswerKey("goal", [
      { kind: "goal", status: "confirmed", payload: { text: "I photograph weddings for couples." } },
    ]);
    expect(answered).not.toBe(open);
    expect(recommendationJobKey({ ...base, answerKey: answered })).not.toBe(abstained);
    expect(
      confirmedAnswerKey("goal", [
        { kind: "goal", status: "suggested", payload: { text: "Help couples remember their wedding day." } },
      ])
    ).toBe("open");
  });

  it("keeps a queued durable job visible as running", () => {
    expect(
      recommendationStateFromSources({
        job: { status: "queued", payload: {}, at: 5 },
        memory: null,
        suggestionsSaved: false,
      })
    ).toEqual({ state: "running", at: 5 });
  });
});

describe("recommendationEvidenceToken", () => {
  it("keeps the post key until website facts exist", () => {
    expect(recommendationEvidenceToken([], [])).toBe("profile");
    expect(recommendationEvidenceToken(["b", "a"], [])).toBe(
      recommendationEvidenceToken(["a", "b"], [])
    );
    const posts = recommendationEvidenceToken(["post-1"], []);
    const withSite = recommendationEvidenceToken(["post-1"], ["Book a workshop"]);
    expect(withSite.startsWith(`${posts}:w`)).toBe(true);
    expect(withSite).not.toBe(posts);
  });
});
