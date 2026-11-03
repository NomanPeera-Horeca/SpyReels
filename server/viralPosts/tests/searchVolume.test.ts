import { describe, expect, it } from "vitest";
import { acceptedByGoogleAds, parseSearchVolumes, volumeDemand, volumeMonthKey } from "../searchVolume";
import { parseTikTokSuggestions, tiktokHarvestKey } from "../keywords";

describe("Google search volume (DataForSEO)", () => {
  it("turns monthly searches into demand on a log scale", () => {
    expect(volumeDemand(null)).toBe(0);
    expect(volumeDemand(0)).toBe(0);
    expect(volumeDemand(10)).toBe(30);
    expect(volumeDemand(1000)).toBe(60);
    expect(volumeDemand(100_000)).toBe(90);
    expect(volumeDemand(50_000_000)).toBe(100);
  });

  it("reads the search_volume response", () => {
    const v = parseSearchVolumes({
      tasks: [{ status_code: 20000, result: [{ keyword: "Meal Prep Ideas", search_volume: 12100 }, { keyword: "rare phrase", search_volume: null }] }],
    });
    expect(v.get("meal prep ideas")).toBe(12100);
    expect(v.get("rare phrase")).toBeNull();
  });

  it("skips phrases Google Ads would reject", () => {
    expect(acceptedByGoogleAds("meal prep for beginners")).toBe(true);
    expect(acceptedByGoogleAds("one two three four five six seven eight nine ten eleven")).toBe(false);
    expect(acceptedByGoogleAds("what? really")).toBe(false);
  });

  it("keys spend per month within 10 characters", () => {
    expect(volumeMonthKey(new Date("2026-11-03T00:00:00Z"))).toBe("df202611");
  });
});

describe("TikTok search suggestions", () => {
  it("keeps English suggestion texts", () => {
    expect(
      parseTikTokSuggestions({
        suggestions: [
          { text: "meal prep ideas", position: 0, language: "en" },
          { text: "meal prep semanal", position: 1, language: "es" },
          { text: "meal prep asmr", position: 2 },
        ],
      })
    ).toEqual(["meal prep ideas", "meal prep asmr"]);
    expect(parseTikTokSuggestions({})).toEqual([]);
  });

  it("marks a topic within 10 characters", () => {
    expect(tiktokHarvestKey("meal-prep")).toMatch(/^tk[0-9a-f]{8}$/);
  });
});
