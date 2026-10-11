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

  it("keeps OAuth server routes out of the SPA/service-worker fallback", () => {
    expect(shouldUseSpaNavigateFallback("/api/ai/oauth/authorize?client_id=test")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/api/ai/oauth/token")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/ai/oauth/continue?request=abc123")).toBe(false);
  });

  it("does not broaden the exclusion to other /features pages", () => {
    expect(shouldUseSpaNavigateFallback("/features/30-day-content-plan")).toBe(true);
    expect(shouldUseSpaNavigateFallback("/features/ai-personal-brand-coach")).toBe(true);
  });

  it("denies exact /free-tools hub only (child free-tool URLs stay on SPA)", () => {
    expect(shouldUseSpaNavigateFallback("/free-tools")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/free-tools/")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/free-tools/viral-hooks")).toBe(true);
    expect(shouldUseSpaNavigateFallback("/free-tools/tiktok-viral-video-finder")).toBe(true);
  });

  it("denies the migrated B-roll generator route", () => {
    expect(shouldUseSpaNavigateFallback("/free-tools/broll-generator")).toBe(false);
    expect(shouldUseSpaNavigateFallback("/free-tools/broll-generator/")).toBe(false);
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
