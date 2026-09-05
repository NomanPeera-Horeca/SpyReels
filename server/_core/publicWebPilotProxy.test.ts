import express from "express";
import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  VIRAL_REEL_FINDER_DEMO_PATH,
  VIRAL_REEL_FINDER_PILOT_PATH,
  VIRAL_REEL_FINDER_PROFILE_PATH,
  getPublicWebPilotConfig,
  isPublicWebPilotRequest,
  registerPublicWebPilotProxy,
} from "./publicWebPilotProxy";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        })
    )
  );
});

function listen(server: http.Server): Promise<number> {
  servers.push(server);
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Expected a TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

describe("publicWebPilotProxy", () => {
  it("is disabled by default", () => {
    const config = getPublicWebPilotConfig({});
    expect(config.enabled).toBe(false);
    expect(config.origin).toBeNull();
    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_PILOT_PATH, "GET", config)).toBe(false);
  });

  it("requires both the feature flag and an upstream origin", () => {
    const flagOnly = getPublicWebPilotConfig({ SPYREELS_PUBLIC_WEB_PILOT: "true" });
    expect(flagOnly.enabled).toBe(true);
    expect(flagOnly.origin).toBeNull();
    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_PILOT_PATH, "GET", flagOnly)).toBe(false);
  });

  it("only opts the Viral Reel Finder, its public data routes, and Next assets into the pilot", () => {
    const config = getPublicWebPilotConfig({
      SPYREELS_PUBLIC_WEB_PILOT: "true",
      SPYREELS_PUBLIC_WEB_ORIGIN: "http://127.0.0.1:3100/",
    });

    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_PILOT_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(`${VIRAL_REEL_FINDER_PILOT_PATH}/`, "HEAD", config)).toBe(true);
    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_DEMO_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(`${VIRAL_REEL_FINDER_DEMO_PATH}/`, "HEAD", config)).toBe(true);
    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_PROFILE_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(`${VIRAL_REEL_FINDER_PROFILE_PATH}/`, "HEAD", config)).toBe(true);
    expect(isPublicWebPilotRequest("/_next/static/chunks/app.js", "GET", config)).toBe(true);

    expect(isPublicWebPilotRequest("/", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/pricing", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/research", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/studio", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/carousels", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/settings", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/api/trpc", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/api/oauth/callback", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/robots.txt", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/sitemap.xml", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/features/other", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest(`${VIRAL_REEL_FINDER_PILOT_PATH}/other`, "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_PILOT_PATH, "POST", config)).toBe(false);
    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_DEMO_PATH, "POST", config)).toBe(false);
    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_PROFILE_PATH, "POST", config)).toBe(false);
  });

  it("normalizes the upstream origin and timeout", () => {
    const config = getPublicWebPilotConfig({
      SPYREELS_PUBLIC_WEB_PILOT: "true",
      SPYREELS_PUBLIC_WEB_ORIGIN: "https://public-web.internal/",
      SPYREELS_PUBLIC_WEB_TIMEOUT_MS: "2500",
    });

    expect(config.origin).toBe("https://public-web.internal");
    expect(config.timeoutMs).toBe(2500);
  });

  it("falls back to the safe timeout when the configured value is invalid", () => {
    const config = getPublicWebPilotConfig({
      SPYREELS_PUBLIC_WEB_TIMEOUT_MS: "not-a-number",
    });
    expect(config.timeoutMs).toBe(5000);
  });

  it("fails open to the existing renderer when the Next page is unavailable", async () => {
    const upstream = http.createServer((_req, res) => {
      res.statusCode = 500;
      res.end("next-down");
    });
    const upstreamPort = await listen(upstream);

    const app = express();
    registerPublicWebPilotProxy(app, {
      enabled: true,
      origin: `http://127.0.0.1:${upstreamPort}`,
      timeoutMs: 400,
    });
    app.get(VIRAL_REEL_FINDER_PILOT_PATH, (_req, res) => {
      res.status(200).send("vite-fallback");
    });

    const proxy = http.createServer(app);
    const proxyPort = await listen(proxy);
    const response = await fetch(`http://127.0.0.1:${proxyPort}${VIRAL_REEL_FINDER_PILOT_PATH}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("vite-fallback");
  });
});
