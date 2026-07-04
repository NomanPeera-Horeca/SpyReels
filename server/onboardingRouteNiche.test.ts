import { describe, expect, it } from "vitest";
import { buildFirstOnboardingScriptPrompt } from "../server/onboardingRouteNiche";

describe("buildFirstOnboardingScriptPrompt", () => {
  it("includes niche and audience in the generation prompt", () => {
    const prompt = buildFirstOnboardingScriptPrompt("Personal finance", "College students");
    expect(prompt).toContain("Personal finance");
    expect(prompt).toContain("College students");
    expect(prompt).toContain("Instagram Reels audio");
  });
});
