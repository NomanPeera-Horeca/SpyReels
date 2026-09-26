import { describe, expect, it } from "vitest";
import {
  appAbsoluteUrl,
  appOrigin,
  isAppHostSplitEnabled,
  isSpyReelsAppHost,
  isSpyReelsApexHost,
  shouldRedirectApexPathToApp,
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

  it("redirects product and auth handoff paths from apex", () => {
    expect(shouldRedirectApexPathToApp("/research")).toBe(true);
    expect(shouldRedirectApexPathToApp("/studio")).toBe(true);
    expect(shouldRedirectApexPathToApp("/viral-posts")).toBe(true);
    expect(shouldRedirectApexPathToApp("/api/trpc")).toBe(true);
    expect(shouldRedirectApexPathToApp("/", "?auth=signup&returnTo=%2Fresearch")).toBe(
      true
    );
    expect(shouldRedirectApexPathToApp("/")).toBe(false);
    expect(shouldRedirectApexPathToApp("/pricing")).toBe(false);
    expect(shouldRedirectApexPathToApp("/blog")).toBe(false);
    expect(shouldRedirectApexPathToApp("/features/viral-reel-finder")).toBe(false);
  });
});
