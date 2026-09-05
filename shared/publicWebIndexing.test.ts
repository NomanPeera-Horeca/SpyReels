import { describe, expect, it } from "vitest";
import {
  publicWebIndexingEnabled,
  publicWebIndexingPolicy,
  publicWebRobotsMetadata,
  publicWebRobotsTxtRules,
} from "./publicWebIndexing";

describe("public web indexing policy", () => {
  it("keeps Render preview and localhost noindex when the flag is off", () => {
    expect(
      publicWebIndexingPolicy({ host: "spyreels-public-web.onrender.com", indexingEnabled: false })
    ).toMatchObject({
      index: false,
      follow: false,
      reason: "preview-or-unapproved-host",
    });
    expect(publicWebIndexingPolicy({ host: "localhost:3100" })).toMatchObject({
      index: false,
      follow: false,
    });
    expect(publicWebIndexingPolicy({ host: "127.0.0.1:3100" })).toMatchObject({
      index: false,
      follow: false,
    });
    expect(publicWebIndexingPolicy({})).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("keeps preview noindex even if the production indexing flag is on", () => {
    expect(
      publicWebIndexingPolicy({
        host: "spyreels-public-web.onrender.com",
        indexingEnabled: true,
      })
    ).toMatchObject({
      index: false,
      follow: false,
      reason: "preview-or-unapproved-host",
    });
  });

  it("keeps spyreels.ai noindex until the production indexing flag is on", () => {
    expect(publicWebIndexingPolicy({ host: "spyreels.ai", indexingEnabled: false })).toEqual({
      index: false,
      follow: false,
      reason: "indexing-flag-disabled",
      host: "spyreels.ai",
    });
    expect(publicWebIndexingPolicy({ host: "www.spyreels.ai" })).toMatchObject({
      index: false,
      follow: false,
      reason: "indexing-flag-disabled",
    });
  });

  it("indexes only when the host is approved and the flag is on", () => {
    expect(
      publicWebIndexingPolicy({ host: "spyreels.ai", indexingEnabled: true })
    ).toEqual({
      index: true,
      follow: true,
      reason: "approved-production-host",
      host: "spyreels.ai",
    });
    expect(
      publicWebIndexingPolicy({ host: "www.spyreels.ai", indexingEnabled: true })
    ).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("uses the visitor host from Express x-forwarded-host, not the Next Render host", () => {
    expect(
      publicWebIndexingPolicy({
        host: "spyreels-public-web.onrender.com",
        forwardedHost: "spyreels.ai",
        indexingEnabled: true,
      })
    ).toMatchObject({
      index: true,
      follow: true,
      host: "spyreels.ai",
    });
    expect(
      publicWebIndexingPolicy({
        host: "spyreels-public-web.onrender.com",
        forwardedHost: "spyreels.ai",
        indexingEnabled: false,
      })
    ).toMatchObject({
      index: false,
      follow: false,
      reason: "indexing-flag-disabled",
    });
    expect(
      publicWebIndexingPolicy({
        host: "spyreels-public-web.onrender.com",
        forwardedHost: "spyreels-public-web.onrender.com",
        indexingEnabled: true,
      })
    ).toMatchObject({
      index: false,
      follow: false,
    });
  });

  it("reads only the explicit server-side approval flag", () => {
    expect(publicWebIndexingEnabled({})).toBe(false);
    expect(publicWebIndexingEnabled({ SPYREELS_PUBLIC_WEB_INDEXING_ENABLED: "false" })).toBe(false);
    expect(publicWebIndexingEnabled({ SPYREELS_PUBLIC_WEB_INDEXING_ENABLED: "true" })).toBe(true);
  });

  it("emits noindex metadata and a full robots disallow on preview", () => {
    const policy = publicWebIndexingPolicy({ host: "spyreels-public-web.onrender.com" });
    expect(publicWebRobotsMetadata(policy)).toEqual({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    });
    expect(publicWebRobotsTxtRules(policy)).toEqual({
      userAgent: "*",
      disallow: ["/"],
    });
  });

  it("emits index/follow metadata and allows only the finder page in production", () => {
    const policy = publicWebIndexingPolicy({
      forwardedHost: "spyreels.ai",
      indexingEnabled: true,
    });
    expect(publicWebRobotsMetadata(policy)).toEqual({
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    });
    const robots = publicWebRobotsTxtRules(policy);
    expect(robots.allow).toContain("/features/viral-reel-finder");
    expect(robots.disallow).toContain("/");
  });
});
