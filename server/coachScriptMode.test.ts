import { describe, expect, it } from "vitest";
import { inferCoachScriptMode } from "@shared/coachScriptMode";

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
});
