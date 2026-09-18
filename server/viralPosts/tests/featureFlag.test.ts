import { describe, expect, it } from "vitest";
import {
  parseExplicitBoolean,
  parseViralPostsInstagramEnabled,
  parseViralPostsLive,
  parseViralPostsPoolRefreshMs,
  parseViralPostsPoolRefresher,
  parseViralPostsTiktokEnabled,
  parseViralPostsYoutubeEnabled,
} from "@shared/viralPosts";

describe("viralPosts feature flags", () => {
  it("defaults live on outside production", () => {
    expect(parseViralPostsLive(undefined, "development")).toBe(true);
    expect(parseViralPostsLive("", "test")).toBe(true);
  });

  it("defaults live off in production when unset", () => {
    expect(parseViralPostsLive(undefined, "production")).toBe(false);
  });

  it("respects explicit true/false", () => {
    expect(parseViralPostsLive("true", "production")).toBe(true);
    expect(parseViralPostsLive("false", "development")).toBe(false);
    expect(parseExplicitBoolean("yes")).toBe(true);
    expect(parseExplicitBoolean("no")).toBe(false);
    expect(parseExplicitBoolean("maybe")).toBe(null);
  });

  it("instagram flag defaults to live flag", () => {
    expect(parseViralPostsInstagramEnabled(undefined, true)).toBe(true);
    expect(parseViralPostsInstagramEnabled(undefined, false)).toBe(false);
    expect(parseViralPostsInstagramEnabled("false", true)).toBe(false);
  });

  it("tiktok follows live; youtube requires an explicit true and live mode", () => {
    expect(parseViralPostsTiktokEnabled(undefined, true)).toBe(true);
    expect(parseViralPostsTiktokEnabled("false", true)).toBe(false);
    expect(parseViralPostsYoutubeEnabled(undefined, true)).toBe(false);
    expect(parseViralPostsYoutubeEnabled("true", true)).toBe(true);
    expect(parseViralPostsYoutubeEnabled("false", true)).toBe(false);
    expect(parseViralPostsYoutubeEnabled("true", false)).toBe(false);
  });

  it("pool refresher is opt-in only", () => {
    expect(parseViralPostsPoolRefresher(undefined)).toBe(false);
    expect(parseViralPostsPoolRefresher("")).toBe(false);
    expect(parseViralPostsPoolRefresher("false")).toBe(false);
    expect(parseViralPostsPoolRefresher("true")).toBe(true);
  });

  it("parses refresh interval with safe floor", () => {
    expect(parseViralPostsPoolRefreshMs(undefined)).toBe(10_800_000);
    expect(parseViralPostsPoolRefreshMs("60000")).toBe(60_000);
    expect(parseViralPostsPoolRefreshMs("100")).toBe(10_800_000);
  });
});
