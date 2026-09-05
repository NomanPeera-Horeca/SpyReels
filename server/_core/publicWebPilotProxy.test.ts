import { describe, expect, it } from "vitest";
import {
  VIRAL_REEL_FINDER_PILOT_PATH,
  getPublicWebPilotConfig,
  isPublicWebPilotRequest,
} from "./publicWebPilotProxy";

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

  it("only opts the Viral Reel Finder and Next assets into the pilot", () => {
    const config = getPublicWebPilotConfig({
      SPYREELS_PUBLIC_WEB_PILOT: "true",
      SPYREELS_PUBLIC_WEB_ORIGIN: "http://127.0.0.1:3100/",
    });

    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_PILOT_PATH, "GET", config)).toBe(true);
    expect(isPublicWebPilotRequest(`${VIRAL_REEL_FINDER_PILOT_PATH}/`, "HEAD", config)).toBe(true);
    expect(isPublicWebPilotRequest("/_next/static/chunks/app.js", "GET", config)).toBe(true);

    expect(isPublicWebPilotRequest("/", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/pricing", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/research", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest("/api/trpc", "GET", config)).toBe(false);
    expect(isPublicWebPilotRequest(VIRAL_REEL_FINDER_PILOT_PATH, "POST", config)).toBe(false);
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
});
