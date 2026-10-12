import express from "express";
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sdk } from "./sdk";
import {
  TIKTOK_VIRAL_FINDER_DEMO_PATH,
  TIKTOK_VIRAL_FINDER_PATH,
  FREE_TOOLS_BROLL_GENERATOR_PATH,
  FREE_TOOLS_HUB_PATH,
  VIRAL_HOOKS_PATH,
  VIRAL_REEL_FINDER_DEMO_PATH,
  VIRAL_REEL_FINDER_PILOT_PATH,
  VIRAL_REEL_FINDER_PROFILE_PATH,
  YOUTUBE_SHORTS_FINDER_DEMO_PATH,
  YOUTUBE_SHORTS_FINDER_PATH,
  getPublicWebPilotConfig,
  isPublicWebPilotRequest,
  registerPublicWebPilotProxy,
} from "./publicWebPilotProxy";

const servers: http.Server[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
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
    expect(isPublicWebPilotRequest(TIKTOK_VIRAL_FINDER_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(TIKTOK_VIRAL_FINDER_DEMO_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(YOUTUBE_SHORTS_FINDER_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(YOUTUBE_SHORTS_FINDER_DEMO_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(FREE_TOOLS_HUB_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(`${FREE_TOOLS_HUB_PATH}/`, "HEAD", config)).toBe(true);
    expect(isPublicWebPilotRequest(FREE_TOOLS_BROLL_GENERATOR_PATH, "GET", config)).toBe(
      true
    );
    expect(isPublicWebPilotRequest(`${FREE_TOOLS_BROLL_GENERATOR_PATH}/`, "HEAD", config)).toBe(
      true
    );
    expect(isPublicWebPilotRequest(VIRAL_HOOKS_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(`${VIRAL_HOOKS_PATH}/`, "HEAD", config)).toBe(true);
    expect(isPublicWebPilotRequest("/blog/guide-meedro-alternative", "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest("/blog/guide-meedro-alternative/", "HEAD", config)).toBe(true);
    expect(isPublicWebPilotRequest("/_next/static/chunks/app.js", "GET", config)).toBe(true);

    expect(isPublicWebPilotRequest("/blog", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/blog/new", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/blog/edit/example", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest(`${VIRAL_HOOKS_PATH}/extra`, "GET", config)).toBe(false);
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

  it("opts the homepage and its static media in only with the dedicated flag", () => {
    const env = {
      SPYREELS_PUBLIC_WEB_PILOT: "true",
      SPYREELS_PUBLIC_WEB_ORIGIN: "http://127.0.0.1:3100",
      SPYREELS_PUBLIC_WEB_HOME: "true",
    };
    const config = getPublicWebPilotConfig(env);
    expect(isPublicWebPilotRequest("/", "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest("/marketing/logo.png", "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest("/pricing", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/", "POST", config)).toBe(false);
    expect(isPublicWebPilotRequest("/", "GET", { ...config, homepageEnabled: false })).toBe(false);
  });

  it("redirects legacy signup and login query links to the auth handoff", async () => {
    const upstream = http.createServer((_req, res) => res.end("next-home"));
    const upstreamPort = await listen(upstream);
    const app = express();
    registerPublicWebPilotProxy(app, {
      enabled: true, homepageEnabled: true,
      origin: `http://127.0.0.1:${upstreamPort}`, timeoutMs: 400,
    });
    app.get("/", (_req, res) => res.send("legacy-home"));
    const proxy = http.createServer(app);
    const proxyPort = await listen(proxy);
    expect(await (await fetch(`http://127.0.0.1:${proxyPort}/`)).text()).toBe("next-home");

    const signup = await fetch(`http://127.0.0.1:${proxyPort}/?signup=1`, {
      redirect: "manual",
    });
    expect(signup.status).toBe(302);
    expect(signup.headers.get("location")).toBe(
      "/?auth=signup&returnTo=%2Fresearch"
    );

    const login = await fetch(`http://127.0.0.1:${proxyPort}/?login=1`, {
      redirect: "manual",
    });
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toBe(
      "/?auth=login&returnTo=%2Fresearch"
    );

    const verify = vi.spyOn(sdk, "authenticateRequest").mockRejectedValue(new Error("stale session"));
    expect(await (await fetch(`http://127.0.0.1:${proxyPort}/`, {
      headers: { cookie: "app_session_id=stale-session" },
    })).text()).toBe("next-home");
    verify.mockResolvedValue({ id: 1 } as unknown as Awaited<ReturnType<typeof sdk.authenticateRequest>>);
    expect(await (await fetch(`http://127.0.0.1:${proxyPort}/`, {
      headers: { cookie: "app_session_id=existing-session" },
    })).text()).toBe("legacy-home");
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
