import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedCarouselZipFilenames } from "@/lib/carouselExportOptions";
import { formatStudioPackageSummary } from "./studioPackage";

const here = dirname(fileURLToPath(import.meta.url));
const studioApp = readFileSync(join(here, "CarouselStudioApp.tsx"), "utf8");
const mockData = readFileSync(join(here, "mockData.ts"), "utf8");

describe("formatStudioPackageSummary", () => {
  it("reports only the real slide image count", () => {
    expect(formatStudioPackageSummary(9)).toBe("9 slide images included.");
    expect(formatStudioPackageSummary(5)).toBe("5 slide images included.");
    expect(formatStudioPackageSummary(1)).toBe("1 slide images included.");
  });

  it("does not mention captions or hashtags", () => {
    const summary = formatStudioPackageSummary(7);
    expect(summary).not.toMatch(/caption/i);
    expect(summary).not.toMatch(/hashtag/i);
  });
});

describe("Download package modal (source)", () => {
  it("does not call mock caption or hashtag helpers", () => {
    expect(studioApp).not.toContain("getPackageCaption");
    expect(studioApp).not.toContain("getPackageHashtags");
  });

  it("does not render Caption or Hashtags sections", () => {
    expect(studioApp).not.toMatch(/<h3>Caption<\/h3>/);
    expect(studioApp).not.toMatch(/<h3>Hashtags<\/h3>/);
    expect(studioApp).not.toContain("caption-preview");
    expect(studioApp).not.toContain("hashtag-preview");
  });

  it("does not show restaurant caption copy for any carousel", () => {
    expect(studioApp).not.toMatch(/packed dining room/i);
    expect(studioApp).not.toMatch(/restaurants lose profit/i);
    expect(studioApp).not.toMatch(/#RestaurantBusiness/);
    expect(studioApp).not.toMatch(/#RestaurantOwner/);
    expect(mockData).not.toContain("export function getPackageCaption");
    expect(mockData).not.toContain("export function getPackageHashtags");
  });

  it("uses the package summary helper for download only", () => {
    const uses = studioApp.match(/formatStudioPackageSummary\(/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
    expect(studioApp).toContain("CarouselSocialPreview");
    expect(studioApp).not.toMatch(/images, 1 caption, hashtags included/);
    expect(studioApp).not.toMatch(/adding the caption/);
    expect(studioApp).not.toMatch(/including hashtags/);
  });
});

describe("ZIP export filenames (unchanged)", () => {
  it("still lists every slide PNG the ZIP helper writes", () => {
    expect(expectedCarouselZipFilenames(9)).toEqual([
      "slide-01.png",
      "slide-02.png",
      "slide-03.png",
      "slide-04.png",
      "slide-05.png",
      "slide-06.png",
      "slide-07.png",
      "slide-08.png",
      "slide-09.png",
    ]);
  });
});
