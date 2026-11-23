import { describe, expect, it } from "vitest";
import { compactCount, creatorRowStatus, initialResearchTab } from "./creatorResearchModel";
import { failedLabel, mergeMyCreators, updatedAgo, type MyCreatorJob } from "@/lib/myCreators";

const NOW = new Date("2026-11-23T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("tab choice", () => {
  it("opens on Explore for a first visit, on My creators once there are any", () => {
    expect(initialResearchTab(null, false)).toBe("explore");
    expect(initialResearchTab(null, true)).toBe("my");
  });
  it("respects the tab in the address (Creator Radar forwards to ?tab=my)", () => {
    expect(initialResearchTab("my", false)).toBe("my");
    expect(initialResearchTab("explore", true)).toBe("explore");
    expect(initialResearchTab("bogus", true)).toBe("my");
  });
});

describe("row text", () => {
  const base = { platform: "instagram" as const, status: "completed", followerCount: 48_200, totalReels: 57, updatedAt: hoursAgo(2), progressPercent: 100 };

  it("shows followers, videos and when it was updated", () => {
    expect(creatorRowStatus(base, NOW)).toEqual({ kind: "ready", text: "48.2K followers · 57 videos · Updated 2 hours ago" });
  });
  it("says subscribers for YouTube and handles one video", () => {
    expect(creatorRowStatus({ ...base, platform: "youtube", totalReels: undefined, totalVideos: 1 }, NOW).text).toBe(
      "48.2K subscribers · 1 video · Updated 2 hours ago"
    );
  });
  it("shows progress while researching", () => {
    expect(creatorRowStatus({ ...base, status: "running", progressPercent: 45 }, NOW)).toEqual({
      kind: "researching",
      text: "Finding their best videos… 45%",
    });
    expect(creatorRowStatus({ ...base, status: "pending" }, NOW).text).toBe("Waiting to start…");
  });
  it("explains a failed research in plain words", () => {
    expect(creatorRowStatus({ ...base, status: "failed", failureReason: "account_private" }, NOW)).toEqual({
      kind: "failed",
      text: "This account is private",
    });
    expect(failedLabel(null)).toBe("Research didn't finish");
  });
  it("flags a refresh that didn't finish but keeps the old numbers", () => {
    expect(creatorRowStatus({ ...base, errorMessage: "timeout" }, NOW).kind).toBe("refresh_failed");
  });
});

describe("helpers", () => {
  it("formats counts", () => {
    expect(compactCount(950)).toBe("950");
    expect(compactCount(48_200)).toBe("48.2K");
    expect(compactCount(1_200_000)).toBe("1.2M");
    expect(compactCount(null)).toBe("0");
  });
  it("says when it was updated", () => {
    expect(updatedAgo(new Date(NOW.getTime() - 30_000), NOW)).toBe("just now");
    expect(updatedAgo(hoursAgo(1), NOW)).toBe("1 hour ago");
    expect(updatedAgo(hoursAgo(30), NOW)).toBe("yesterday");
    expect(updatedAgo(hoursAgo(24 * 6), NOW)).toBe("6 days ago");
  });
  it("keeps one row per creator and platform (the session with more videos)", () => {
    const job = (id: number, platform: "instagram" | "tiktok", handle: string, totalReels: number, h: number) =>
      ({ id, platform, handle, totalReels, totalVideos: totalReels, updatedAt: hoursAgo(h), followerCount: 1, status: "completed" }) as unknown as MyCreatorJob;
    const out = mergeMyCreators([job(1, "instagram", "Chef", 10, 5), job(2, "instagram", "chef", 40, 9), job(3, "tiktok", "chef", 5, 1)]);
    expect(out.map(j => j.id)).toEqual([3, 2]);
  });
});
