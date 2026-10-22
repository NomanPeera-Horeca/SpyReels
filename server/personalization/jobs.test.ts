import { describe, expect, it } from "vitest";
import { recommendationStateFromSources, shouldStartRecommendationJob } from "./jobs";

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
