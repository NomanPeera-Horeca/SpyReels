import { describe, expect, it } from "vitest";
import { channelFields, needsChannelLookup } from "../youtubeChannels";

describe("needsChannelLookup", () => {
  it("looks up only YouTube Shorts with the placeholder creator that could be viral", () => {
    expect(needsChannelLookup({ platform: "youtube", creatorHandle: "@youtube", views: 50_000 })).toBe(true);
    expect(needsChannelLookup({ platform: "youtube", creatorHandle: null, views: 50_000 })).toBe(true);
    expect(needsChannelLookup({ platform: "youtube", creatorHandle: "@youtube", views: 9_999 })).toBe(false);
    expect(needsChannelLookup({ platform: "youtube", creatorHandle: "@mrbeast", views: 50_000 })).toBe(false);
    expect(needsChannelLookup({ platform: "tiktok", creatorHandle: null, views: 50_000 })).toBe(false);
  });
});

describe("channelFields", () => {
  it("builds the creator fields the adapters use", () => {
    expect(channelFields({ username: "@CoachMia", fullName: "Coach Mia" })).toEqual({
      creatorId: "CoachMia",
      creatorHandle: "@CoachMia",
      creatorName: "Coach Mia",
    });
    expect(channelFields({ username: "coachmia", fullName: " " })?.creatorName).toBe("coachmia");
  });

  it("never returns the placeholder or an empty channel", () => {
    expect(channelFields({ username: "", fullName: "X" })).toBeNull();
    expect(channelFields({ username: "YouTube", fullName: "YouTube" })).toBeNull();
  });
});
