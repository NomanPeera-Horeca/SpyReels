import { describe, expect, it } from "vitest";
import {
  publicWebIndexingPolicy,
  publicWebRobotsMetadata,
  publicWebRobotsTxtRules,
} from "./publicWebIndexing";

describe("public web indexing policy", () => {
  it("keeps Render preview and localhost noindex", () => {
    expect(publicWebIndexingPolicy({ host: "spyreels-public-web.onrender.com" })).toMatchObject({
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

  it("indexes only after spyreels.ai production ownership", () => {
    expect(publicWebIndexingPolicy({ host: "spyreels.ai" })).toEqual({
      index: true,
      follow: true,
      reason: "approved-production-host",
      host: "spyreels.ai",
    });
    expect(publicWebIndexingPolicy({ host: "www.spyreels.ai" })).toMatchObject({
      index: true,
      follow: true,
    });
  });

  it("uses the visitor host from Express x-forwarded-host, not the Next Render host", () => {
    expect(
      publicWebIndexingPolicy({
        host: "spyreels-public-web.onrender.com",
        forwardedHost: "spyreels.ai",
      })
    ).toMatchObject({
      index: true,
      follow: true,
      host: "spyreels.ai",
    });
    expect(
      publicWebIndexingPolicy({
        host: "spyreels-public-web.onrender.com",
        forwardedHost: "spyreels-public-web.onrender.com",
      })
    ).toMatchObject({
      index: false,
      follow: false,
    });
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
    const policy = publicWebIndexingPolicy({ forwardedHost: "spyreels.ai" });
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
