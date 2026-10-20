import { describe, expect, it } from "vitest";
import { suggestionRequestKey } from "./suggestionRequest";

const base = {
  step: "goal" as const,
  version: 1,
  analysisRunId: "run-1",
  analysisStatus: "running",
  postsInWindow: 0,
  confirmedGoal: false,
  confirmedAudience: false,
  retry: 0,
};

describe("suggestionRequestKey", () => {
  it("stays put while analysis is still running without posts", () => {
    expect(suggestionRequestKey(base)).toBe(suggestionRequestKey({ ...base, analysisStatus: "queued" }));
  });

  it("changes once posts are stored, and again when the user confirms a goal", () => {
    const before = suggestionRequestKey(base);
    const withPosts = suggestionRequestKey({
      ...base,
      analysisStatus: "succeeded",
      postsInWindow: 12,
    });
    const confirmed = suggestionRequestKey({
      ...base,
      analysisStatus: "succeeded",
      postsInWindow: 12,
      step: "audience",
      confirmedGoal: true,
    });
    expect(withPosts).not.toBe(before);
    expect(confirmed).not.toBe(withPosts);
  });

  it("changes when the user asks to try suggestions again", () => {
    expect(suggestionRequestKey(base)).not.toBe(suggestionRequestKey({ ...base, retry: 1 }));
  });
});
