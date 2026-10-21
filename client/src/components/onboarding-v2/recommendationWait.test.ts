import { describe, expect, it } from "vitest";
import { recommendationWaitState } from "./recommendationWait";

const base = {
  requested: true,
  status: null,
  seenAt: 10,
  waitExpired: false,
  requestFailed: false,
  statusUnreadable: false,
};

describe("recommendationWaitState", () => {
  it("stays quiet until this step has asked", () => {
    expect(recommendationWaitState({ ...base, requested: false }).state).toBe("idle");
  });

  it("shows the loading line only while the current job is still open", () => {
    expect(recommendationWaitState(base).state).toBe("running");
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
    ).toBe("running");
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
