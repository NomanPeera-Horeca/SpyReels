import { describe, expect, it } from "vitest";
import { recommendationStateFromSources } from "./jobs";

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
      })
    ).toEqual({ state: "failed", at: 30 });
  });

  it("does not let an older failed row hide a retry running on this process", () => {
    expect(
      recommendationStateFromSources({
        job: { status: "failed", payload: { outcome: { state: "failed" } }, at: 10 },
        memory: { state: "running" },
        suggestionsSaved: false,
      }).state
    ).toBe("running");
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
