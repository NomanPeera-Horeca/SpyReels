import { describe, expect, it } from "vitest";
import { composeStarterDescription, hasStarterAnswer, needsStarterQuestions } from "./starterQuestions";

describe("starter questions", () => {
  it("turns the three answers into the creator's own description", () => {
    expect(
      composeStarterDescription({
        topic: "  Home workouts for busy moms. ",
        audience: "Busy moms who want to lose 20 lbs",
        purpose: "get_clients",
      })
    ).toBe(
      "I create content about Home workouts for busy moms. I make it for Busy moms who want to lose 20 lbs. I want my content to bring me clients for my services."
    );
    expect(composeStarterDescription({ purpose: "share_entertain" })).toBe(
      "I want my content to share my life and entertain people."
    );
    expect(hasStarterAnswer({ topic: "  ", audience: "" })).toBe(false);
  });

  it("asks when there is nothing to read, and never after the creator answered", () => {
    const base = { bio: null, postCount: 0, hasCreatorDescription: false };
    expect(needsStarterQuestions({ ...base, profileStatus: "not_posting_yet" })).toBe(true);
    expect(needsStarterQuestions({ ...base, profileStatus: "confirmed" })).toBe(true);
    expect(needsStarterQuestions({ ...base, profileStatus: "confirmed", bio: "🇺🇸 hi" })).toBe(true);
    expect(needsStarterQuestions({ ...base, profileStatus: "confirmed", postCount: 12 })).toBe(false);
    expect(
      needsStarterQuestions({ ...base, profileStatus: "confirmed", bio: "Daily No-BS Strategies to grow your restaurant" })
    ).toBe(false);
    expect(needsStarterQuestions({ ...base, profileStatus: "not_posting_yet", hasCreatorDescription: true })).toBe(false);
  });
});
