import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  APP_NAV_STACK_KEY,
  getCurrentAppPath,
  navigateAppBack,
  navigateAppReplace,
  recordAppNavigation,
  resolveFromParamFallback,
} from "@shared/appNavigation";

const sessionStore = new Map<string, string>();

describe("appNavigation", () => {
  beforeEach(() => {
    sessionStore.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => sessionStore.get(key) ?? null,
      setItem: (key: string, value: string) => {
        sessionStore.set(key, value);
      },
      removeItem: (key: string) => {
        sessionStore.delete(key);
      },
      clear: () => {
        sessionStore.clear();
      },
    });
    vi.stubGlobal("window", {
      location: { pathname: "/dashboard", search: "" },
      history: { length: 1, replaceState: vi.fn(), back: vi.fn() },
    });
  });

  it("resolves from-param fallbacks", () => {
    expect(resolveFromParamFallback("history")).toBe("/history");
    expect(resolveFromParamFallback("plan")).toBe("/plan");
    expect(resolveFromParamFallback(null)).toBe("/research");
  });

  it("records sequential navigation", () => {
    recordAppNavigation("/plan");
    recordAppNavigation("/studio");
    expect(JSON.parse(sessionStore.get(APP_NAV_STACK_KEY) ?? "[]")).toEqual([
      "/plan",
      "/studio",
    ]);
  });

  it("syncs stack when browser back matches previous entry", () => {
    recordAppNavigation("/plan");
    recordAppNavigation("/studio");
    vi.stubGlobal("window", {
      location: { pathname: "/plan", search: "" },
      history: { length: 2, replaceState: vi.fn(), back: vi.fn() },
    });
    recordAppNavigation(getCurrentAppPath());
    expect(JSON.parse(sessionStore.get(APP_NAV_STACK_KEY) ?? "[]")).toEqual(["/plan"]);
  });

  it("navigates back to previous in-app route", () => {
    const calls: Array<{ path: string; replace?: boolean }> = [];
    const setLocation = (path: string, options?: { replace?: boolean }) => {
      calls.push({ path, replace: options?.replace });
    };

    recordAppNavigation("/plan");
    recordAppNavigation("/studio");
    vi.stubGlobal("window", {
      location: { pathname: "/studio", search: "" },
      history: { length: 2, replaceState: vi.fn(), back: vi.fn() },
    });

    navigateAppBack(setLocation, "/research");

    expect(calls).toEqual([{ path: "/plan", replace: true }]);
  });

  it("uses fallback when stack has only one entry", () => {
    const calls: Array<{ path: string; replace?: boolean }> = [];
    const setLocation = (path: string, options?: { replace?: boolean }) => {
      calls.push({ path, replace: options?.replace });
    };

    recordAppNavigation("/studio");
    vi.stubGlobal("window", {
      location: { pathname: "/studio", search: "" },
      history: { length: 1, replaceState: vi.fn(), back: vi.fn() },
    });

    navigateAppBack(setLocation, "/plan");

    expect(calls).toEqual([{ path: "/plan", replace: true }]);
  });

  it("replace swaps scraping for dashboard so back skips the loading gate", () => {
    const calls: Array<{ path: string; replace?: boolean }> = [];
    const setLocation = (path: string, options?: { replace?: boolean }) => {
      calls.push({ path, replace: options?.replace });
    };

    recordAppNavigation("/research");
    recordAppNavigation("/scraping?jobId=627&from=research");
    navigateAppReplace(setLocation, "/dashboard?jobId=627&from=research");

    expect(JSON.parse(sessionStore.get(APP_NAV_STACK_KEY) ?? "[]")).toEqual([
      "/research",
      "/dashboard?jobId=627&from=research",
    ]);

    vi.stubGlobal("window", {
      location: { pathname: "/dashboard", search: "?jobId=627&from=research" },
      history: { length: 2, replaceState: vi.fn(), back: vi.fn() },
    });

    navigateAppBack(setLocation, "/research");

    expect(calls[calls.length - 1]).toEqual({ path: "/research", replace: true });
  });

  it("skips transient scraping route when stack still contains it", () => {
    const calls: Array<{ path: string; replace?: boolean }> = [];
    const setLocation = (path: string, options?: { replace?: boolean }) => {
      calls.push({ path, replace: options?.replace });
    };

    recordAppNavigation("/research");
    recordAppNavigation("/scraping?jobId=627&from=research");
    recordAppNavigation("/dashboard?jobId=627&from=research");

    vi.stubGlobal("window", {
      location: { pathname: "/dashboard", search: "?jobId=627&from=research" },
      history: { length: 2, replaceState: vi.fn(), back: vi.fn() },
    });

    navigateAppBack(setLocation, "/research");

    expect(calls[calls.length - 1]).toEqual({ path: "/research", replace: true });
  });
});
