import { describe, expect, it } from "vitest";
import { parseResearchIntent, researchReturnTo } from "./researchIntent";

describe("research links for one creator", () => {
  it("builds and reads back a link for each platform", () => {
    for (const [handle, platform] of [
      ["@Chef.Mike", "instagram"],
      ["restaurantboss", "tiktok"],
      ["@RestaurantOwnersPodcast", "youtube"],
    ] as const) {
      const url = researchReturnTo(handle, platform);
      const parsed = parseResearchIntent(url.slice(url.indexOf("?")));
      expect(parsed).toMatchObject({ platform, autostart: true });
      expect(parsed?.handle).toBe(handle.replace(/^@/, "").toLowerCase());
    }
  });

  it("keeps the old Instagram and TikTok link shapes", () => {
    expect(researchReturnTo("chef.mike")).toBe("/research?creator=chef.mike&start=1");
    expect(researchReturnTo("boss", "tiktok")).toBe("/research?platform=tiktok&creator=boss&start=1");
    expect(researchReturnTo("boss", "youtube")).toBe("/research?platform=youtube&creator=boss&start=1");
  });

  it("keeps YouTube channel ids as written", () => {
    const id = "UCabcdefghijklmnopqrstuv";
    expect(parseResearchIntent(`?platform=youtube&creator=${id}&start=1`)?.handle).toBe(id);
  });

  it("rejects an invalid handle", () => {
    expect(() => researchReturnTo("not a handle!", "instagram")).toThrow();
    expect(parseResearchIntent("?creator=bad%20handle")).toBeNull();
  });
});
