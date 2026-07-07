import { describe, expect, it } from "vitest";
import { coachScriptModeForPlanCard, inferCoachScriptMode } from "@shared/coachScriptMode";

describe("inferCoachScriptMode", () => {
  it("picks loop for behind-the-scenes format", () => {
    expect(
      inferCoachScriptMode({
        description: "Write a script",
        contentFormat: "behind-the-scenes",
      })
    ).toBe("loop");
  });

  it("picks loop for BTS lifestyle description", () => {
    expect(
      inferCoachScriptMode({
        description: "Behind the scenes holiday content with music",
      })
    ).toBe("loop");
  });

  it("picks story for talking head", () => {
    expect(
      inferCoachScriptMode({
        description: "Why your Reels get 200 views",
        contentFormat: "talking-head",
      })
    ).toBe("story");
  });

  it("picks story for MOFU talking-head plan cards", () => {
    expect(
      inferCoachScriptMode({
        description: "Day 12 plan idea",
        contentFormat: "talking-head",
        funnelStage: "mofu",
      })
    ).toBe("story");
  });

  it("calendar plan cards always use story length even for voiceover-broll", () => {
    expect(
      coachScriptModeForPlanCard({
        description: "Day 1 plan idea: student loans",
        contentFormat: "voiceover-broll",
        funnelStage: "tofu",
        sourceType: "ai_pick",
        day: 1,
      })
    ).toBe("story");
  });

  it("spark deck cards can still use loop mode for BTS format", () => {
    expect(
      coachScriptModeForPlanCard({
        description: "Spark Deck idea",
        contentFormat: "behind-the-scenes",
        funnelStage: "tofu",
        sourceType: "user_spark",
        day: 0,
      })
    ).toBe("loop");
  });
});
