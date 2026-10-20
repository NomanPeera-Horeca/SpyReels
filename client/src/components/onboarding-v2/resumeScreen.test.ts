import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS } from "@shared/personalization/model";
import { screenFromResume } from "./resumeScreen";

describe("screenFromResume", () => {
  it("maps every saved step to a screen without treating it as finished", () => {
    const screens = ONBOARDING_STEPS.map(step => [step, screenFromResume(step)]);
    expect(screens).toEqual([
      ["platform", "platform"],
      ["profile_confirm", "platform"],
      ["use_case", "use_case"],
      ["attribution", "attribution"],
      ["goal", "goal"],
      ["audience", "audience"],
      ["pillars", "pillars"],
      ["done", "done"],
    ]);
  });
});
