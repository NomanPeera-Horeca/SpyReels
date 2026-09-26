import { describe, expect, it } from "vitest";
import {
  formatCreatorHandle,
  formatEngagementPct,
  formatNicheSignal,
  formatShortPostDate,
  viralPostCreatorProfileUrl,
  whyItWorksBullets,
} from "./format";

describe("viralPosts format helpers (mature card)", () => {
  it("formats engagement as a percent label", () => {
    expect(formatEngagementPct(0.021)).toBe("2.1% eng");
    expect(formatEngagementPct(0.05)).toBe("5% eng");
    expect(formatEngagementPct(null)).toBeNull();
  });

  it("formats reach multiplier as a niche signal", () => {
    expect(formatNicheSignal(1.4)).toBe("1.4x niche avg");
    expect(formatNicheSignal(2)).toBe("2x niche avg");
    expect(formatNicheSignal(0)).toBeNull();
  });

  it("formats short post dates", () => {
    expect(formatShortPostDate("2026-09-12T12:00:00.000Z")).toMatch(/Sep/);
  });

  it("builds creator profile urls", () => {
    expect(
      viralPostCreatorProfileUrl({
        platform: "instagram",
        creatorHandle: "@hub.burritos",
      })
    ).toBe("https://www.instagram.com/hub.burritos/");
    expect(
      viralPostCreatorProfileUrl({
        platform: "tiktok",
        creatorHandle: "shi.creative",
      })
    ).toBe("https://www.tiktok.com/@shi.creative");
  });

  it("normalizes creator handles", () => {
    expect(formatCreatorHandle("captain.t.roll")).toBe("@captain.t.roll");
    expect(formatCreatorHandle("@already")).toBe("@already");
  });

  it("builds why-it-works bullets from available fields", () => {
    const bullets = whyItWorksBullets({
      hookMechanism: "Contrarian hook",
      format: "Educational",
      adaptabilityReason: "Easy remake for operators",
    });
    expect(bullets).toEqual([
      "Contrarian hook",
      "Educational format",
      "Easy remake for operators",
    ]);
  });
});
