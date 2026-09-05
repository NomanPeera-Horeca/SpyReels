import { describe, expect, it } from "vitest";
import { shouldUseSpaNavigateFallback } from "./spaNavigateFallback";

describe("SPA navigate fallback denylist", () => {
  it("does not let the Vite service worker claim the Next Viral Reel Finder route", () => {
    expect(shouldUseSpaNavigateFallback("/features/viral-reel-finder")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/features/viral-reel-finder/")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/features/viral-reel-finder?utm_source=test")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/features/viral-reel-finder/demo")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/features/viral-reel-finder/profile")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/_next/static/chunks/app.js")).toBe(false);
  });

  it("still lets the existing SPA own product and unknown app routes", () => {
    expect(shouldUseSpaNavigateFallback("/research")).toBe(true);
    expect(shouldUseSpaNavigateFallback("/studio")).toBe(true);
    expect(shouldUseSpaNavigateFallback("/carousels")).toBe(true);
    expect(shouldUseSpaNavigateFallback("/settings")).toBe(true);
    expect(shouldUseSpaNavigateFallback("/plan")).toBe(true);
  });

  it("does not intercept API traffic", () => {
    expect(shouldUseSpaNavigateFallback("/api/trpc")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/api/oauth/callback")).toBe(false);
  });
});
