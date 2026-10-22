import { describe, expect, it } from "vitest";
import { recommendationWaitState, stepHasDisplaySuggestions } from "./recommendationWait";

const base = {
  requested: true,
  status: null,
  seenAt: 10,
  waitExpired: false,
  requestFailed: false,
  statusUnreadable: false,
  hasSavedSuggestions: false,
};

describe("recommendationWaitState", () => {
  it("stays quiet until this step has asked", () => {
    expect(recommendationWaitState({ ...base, requested: false }).state).toBe("idle");
  });

  it("does not treat an empty status as a running job", () => {
    expect(recommendationWaitState(base).state).toBe("idle");
    expect(
      recommendationWaitState({
        ...base,
        status: { state: "running", at: 11 },
      }).state
    ).toBe("running");
    expect(
      recommendationWaitState({
        ...base,
        status: { state: "failed", at: 10 },
      }).state
    ).toBe("failed");
  });

  it("shows saved suggestions while a newer evidence key has no job", () => {
    expect(recommendationWaitState({ ...base, hasSavedSuggestions: true }).state).toBe("idle");
    expect(
      recommendationWaitState({
        ...base,
        hasSavedSuggestions: true,
        status: { state: "running", at: 11 },
      }).state
    ).toBe("idle");
    expect(
      recommendationWaitState({
        ...base,
        hasSavedSuggestions: true,
        waitExpired: true,
      }).state
    ).toBe("idle");
  });

  it("leaves loading when the job fails, the request fails, or the status cannot be read", () => {
    expect(
      recommendationWaitState({
        ...base,
        status: { state: "failed", at: 20 },
      }).state
    ).toBe("failed");
    expect(recommendationWaitState({ ...base, requestFailed: true }).state).toBe("failed");
    expect(recommendationWaitState({ ...base, statusUnreadable: true }).state).toBe("failed");
    expect(
      recommendationWaitState({
        ...base,
        hasSavedSuggestions: true,
        status: { state: "failed", at: 20 },
      }).state
    ).toBe("failed");
  });

  it("leaves loading when the wait expires, and shows a fresh clarifying question", () => {
    expect(recommendationWaitState({ ...base, waitExpired: true }).state).toBe("failed");
    expect(
      recommendationWaitState({
        ...base,
        status: { state: "clarify", question: "Why do you create?", at: 20 },
      })
    ).toEqual({ state: "clarify", question: "Why do you create?" });
  });

  it("does not treat a slow finished job as still loading once its outcome time changes", () => {
    expect(
      recommendationWaitState({
        ...base,
        waitExpired: true,
        status: { state: "done", at: 20 },
      }).state
    ).toBe("idle");
  });
});

describe("stepHasDisplaySuggestions", () => {
  it("keeps profile-phase niche and language visible after posts arrive", () => {
    const items = [
      { kind: "niche" },
      { kind: "language" },
      { kind: "audience" },
    ];
    expect(stepHasDisplaySuggestions("goal", items)).toBe(true);
    expect(stepHasDisplaySuggestions("audience", items)).toBe(true);
    expect(stepHasDisplaySuggestions("pillars", items)).toBe(false);
    expect(stepHasDisplaySuggestions(null, items)).toBe(false);
  });
});
