import { describe, expect, it } from "vitest";
import {
  appAbsoluteUrl,
  appOrigin,
  isApexPublicTrpcPath,
  isAppHostSplitEnabled,
  isSpyReelsAppHost,
  isSpyReelsApexHost,
  shouldRedirectApexPathToApp,
  shouldRedirectAppPathToSite,
  siteOrigin,
  SPYREELS_APP_ORIGIN_DEFAULT,
  SPYREELS_SITE_ORIGIN,
} from "./spyreelsOrigins";

describe("spyreelsOrigins", () => {
  it("defaults split off", () => {
    expect(isAppHostSplitEnabled({})).toBe(false);
    expect(isAppHostSplitEnabled({ SPYREELS_APP_HOST_SPLIT: "true" })).toBe(true);
  });

  it("keeps both origins on apex when split is off", () => {
    const env = { SPYREELS_APP_HOST_SPLIT: "false" };
    expect(siteOrigin(env)).toBe(SPYREELS_SITE_ORIGIN);
    expect(appOrigin(env)).toBe(SPYREELS_SITE_ORIGIN);
  });

  it("uses app.spyreels.ai for product when split is on", () => {
    const env = { SPYREELS_APP_HOST_SPLIT: "true" };
    expect(siteOrigin(env)).toBe(SPYREELS_SITE_ORIGIN);
    expect(appOrigin(env)).toBe(SPYREELS_APP_ORIGIN_DEFAULT);
    expect(appAbsoluteUrl("/research", env)).toBe(
      `${SPYREELS_APP_ORIGIN_DEFAULT}/research`
    );
  });

  it("recognizes hosts", () => {
    expect(isSpyReelsApexHost("spyreels.ai")).toBe(true);
    expect(isSpyReelsApexHost("www.spyreels.ai")).toBe(true);
    expect(isSpyReelsAppHost("app.spyreels.ai")).toBe(true);
    expect(isSpyReelsAppHost("spyreels.ai")).toBe(false);
  });

  it("redirects product paths from apex but keeps marketing auth on apex", () => {
    expect(shouldRedirectApexPathToApp("/research")).toBe(true);
    expect(shouldRedirectApexPathToApp("/studio")).toBe(true);
    expect(shouldRedirectApexPathToApp("/viral-posts")).toBe(true);
    expect(shouldRedirectApexPathToApp("/api/telegram/webhook")).toBe(false);
    expect(shouldRedirectApexPathToApp("/api/stripe/webhook")).toBe(false);
    expect(shouldRedirectApexPathToApp("/api/trpc")).toBe(true);
    expect(
      shouldRedirectApexPathToApp("/api/trpc/featured.publicProfilePreview")
    ).toBe(false);
    expect(
      shouldRedirectApexPathToApp("/api/trpc/tiktokScrape.publicProfilePreview")
    ).toBe(false);
    expect(
      shouldRedirectApexPathToApp("/api/trpc/youtubeScrape.publicProfilePreview")
    ).toBe(false);
    expect(shouldRedirectApexPathToApp("/api/trpc/blog.published")).toBe(false);
    expect(shouldRedirectApexPathToApp("/api/trpc/blog.bySlug")).toBe(false);
    expect(
      shouldRedirectApexPathToApp("/api/trpc/blog.bySlug,blog.published")
    ).toBe(false);
    // Mixed public + private batch must still move to the app host.
    expect(
      shouldRedirectApexPathToApp("/api/trpc/blog.published,blog.all")
    ).toBe(true);
    expect(shouldRedirectApexPathToApp("/api/trpc/blog.all")).toBe(true);
    expect(shouldRedirectApexPathToApp("/api/auth/login")).toBe(false);
    expect(shouldRedirectApexPathToApp("/api/oauth/callback")).toBe(false);
    expect(shouldRedirectApexPathToApp("/", "?auth=signup&returnTo=%2Fresearch")).toBe(
      false
    );
    expect(shouldRedirectApexPathToApp("/")).toBe(false);
    expect(shouldRedirectApexPathToApp("/pricing")).toBe(false);
    expect(shouldRedirectApexPathToApp("/blog")).toBe(false);
    expect(shouldRedirectApexPathToApp("/features/viral-reel-finder")).toBe(false);
  });

  it("classifies apex-public tRPC paths including batches", () => {
    expect(isApexPublicTrpcPath("/api/trpc/blog.published")).toBe(true);
    expect(isApexPublicTrpcPath("/api/trpc/blog.bySlug,blog.published")).toBe(
      true
    );
    expect(isApexPublicTrpcPath("/api/trpc/blog.published,blog.all")).toBe(
      false
    );
    expect(isApexPublicTrpcPath("/api/trpc")).toBe(false);
  });

  it("redirects marketing paths from app host to apex", () => {
    expect(shouldRedirectAppPathToSite("/pricing")).toBe(true);
    expect(shouldRedirectAppPathToSite("/blog")).toBe(true);
    expect(shouldRedirectAppPathToSite("/blog/some-post")).toBe(true);
    expect(shouldRedirectAppPathToSite("/free-tools/viral-hooks")).toBe(true);
    expect(shouldRedirectAppPathToSite("/features/viral-reel-finder")).toBe(true);
    expect(shouldRedirectAppPathToSite("/affiliate")).toBe(true);
    expect(shouldRedirectAppPathToSite("/research")).toBe(false);
    expect(shouldRedirectAppPathToSite("/studio")).toBe(false);
    expect(shouldRedirectAppPathToSite("/")).toBe(false);
  });
});
