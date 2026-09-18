import { describe, expect, it } from "vitest";
import { resolveRemakeIntent } from "./remakeIntent";

describe("resolveRemakeIntent", () => {
  it.each([
    "remake this",
    "using spyreels remake this",
    "Using SpyReels Private Test, remake this https://www.instagram.com/reel/ABC123/",
    "please remake this reel",
  ])("requires clarification for vague request: %s", (instruction) => {
    expect(resolveRemakeIntent(instruction)).toEqual({
      status: "clarification_required",
    });
  });

  it.each([
    "remake this similarly for me",
    "remake this for me",
    "make this my version",
    "adapt this to my niche",
    "remake this for my niche",
    "remake this for my audience",
  ])("maps clear profile-based request to niche: %s", (instruction) => {
    expect(resolveRemakeIntent(instruction)).toEqual({
      status: "resolved",
      mode: "niche",
    });
  });

  it.each([
    "keep the same topic but rewrite it for me",
    "same topic",
    "keep this topic",
    "do not change the topic",
  ])("maps same-topic request correctly: %s", (instruction) => {
    expect(resolveRemakeIntent(instruction)).toEqual({
      status: "resolved",
      mode: "same_topic",
    });
  });

  it.each([
    "remake this for my fitness niche",
    "make this about menu engineering",
    "use this structure but make it about labor cost",
    "change the topic to restaurant pricing",
  ])("maps explicit new direction to custom: %s", (instruction) => {
    const result = resolveRemakeIntent(instruction);
    expect(result.status).toBe("resolved");
    if (result.status !== "resolved") return;
    expect(result.mode).toBe("custom");
    expect(result.angle).toBeTruthy();
  });
});
