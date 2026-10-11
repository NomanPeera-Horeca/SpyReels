import { describe, expect, it } from "vitest";
import {
  parseResearchIntent,
  researchReturnTo,
  signupHeadlineForCreator,
} from "./researchIntent";

describe("parseResearchIntent", () => {
  it("parses instagram, tiktok, and youtube creators", () => {
    expect(parseResearchIntent("?creator=garyvee&start=1")).toEqual({
      handle: "garyvee",
      autostart: true,
      platform: "instagram",
    });
    expect(parseResearchIntent("?platform=tiktok&creator=charlidamelio&start=1")?.platform).toBe(
      "tiktok"
    );
    expect(parseResearchIntent("?platform=youtube&creator=mrbeast&start=1")).toEqual({
      handle: "mrbeast",
      autostart: true,
      platform: "youtube",
    });
  });
});

describe("researchReturnTo", () => {
  it("builds instagram and tiktok return paths", () => {
    expect(researchReturnTo("GaryVee")).toBe("/research?creator=garyvee&start=1");
    expect(researchReturnTo("charlidamelio", "tiktok")).toBe(
      "/research?platform=tiktok&creator=charlidamelio&start=1"
    );
  });
});

describe("signupHeadlineForCreator", () => {
  it("uses platform wording and a generic fallback", () => {
    expect(signupHeadlineForCreator("garyvee", "instagram")).toBe(
      "Create your free account to remake @garyvee's best Reel"
    );
    expect(signupHeadlineForCreator("x", "tiktok")).toContain("best TikTok");
    expect(signupHeadlineForCreator("x", "youtube")).toContain("best Short");
    expect(signupHeadlineForCreator(null, null)).toBe("Create your free account");
  });
});
