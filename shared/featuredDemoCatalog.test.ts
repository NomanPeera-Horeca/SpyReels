import { describe, expect, it } from "vitest";
import {
  FEATURED_DEMO_HANDLES,
  FEATURED_DEMO_ITEM_LIMIT,
  FEATURED_DEMO_REFRESH_PLATFORMS,
  isFeaturedDemoHandle,
  normalizeFeaturedDemoHandle,
} from "./featuredDemoCatalog";

describe("featuredDemoCatalog", () => {
  it("keeps TikTok + YouTube allow-lists and 8-item cap", () => {
    expect([...FEATURED_DEMO_REFRESH_PLATFORMS]).toEqual(["tiktok", "youtube"]);
    expect(FEATURED_DEMO_ITEM_LIMIT).toBe(8);
    expect([...FEATURED_DEMO_HANDLES.tiktok]).toEqual([
      "charlidamelio",
      "khaby.lame",
      "zachking",
      "mrbeast",
    ]);
    expect([...FEATURED_DEMO_HANDLES.youtube]).toEqual([
      "mrbeast",
      "mkbhd",
      "aliabdaal",
      "souravjoshivlogs",
    ]);
  });

  it("normalizes handles and validates allow-list membership", () => {
    expect(normalizeFeaturedDemoHandle("@MrBeast")).toBe("mrbeast");
    expect(isFeaturedDemoHandle("youtube", "@mkbhd")).toBe(true);
    expect(isFeaturedDemoHandle("tiktok", "not-a-demo")).toBe(false);
  });
});
