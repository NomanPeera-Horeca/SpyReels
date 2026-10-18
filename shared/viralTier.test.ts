import { describe, expect, it } from "vitest";
import { followerViralBadge } from "./viralTier";

describe("followerViralBadge", () => {
  it("applies the 3x and 5,000-view floor", () => {
    expect(followerViralBadge(4_999, 100)).toBeNull();
    expect(followerViralBadge(29_000, 10_000)).toBeNull(); // 2.9x
  });
  it("hides the 3x to 5x Skip tier", () => {
    expect(followerViralBadge(40_000, 10_000)).toBeNull();
  });
  it("maps tiers at their boundaries and formats the label", () => {
    expect(followerViralBadge(50_000, 10_000)?.label).toBe("Healthy · 5x followers");
    expect(followerViralBadge(25_000, 1_000)?.tier).toBe("Strong");
    expect(followerViralBadge(100_000, 1_000)?.tier).toBe("Viral");
    expect(followerViralBadge(500_000, 1_000)?.tier).toBe("Explosive");
    expect(followerViralBadge(34_900, 1_000)?.label).toBe("Strong · 34x followers");
  });
  it("never shows a badge without a real follower count", () => {
    expect(followerViralBadge(100_000, 0)).toBeNull();
    expect(followerViralBadge(100_000, null)).toBeNull();
    expect(followerViralBadge(null, 1_000)).toBeNull();
  });
});
