import { describe, expect, it } from "vitest";
import {
  MOBILE_CREATE_HOME_PATH,
  isMobileCreateAllowedPath,
  mobileCreateTabForPath,
} from "@shared/mobileCreateApp";

describe("mobileCreateApp: Home v2 tab (installed app)", () => {
  it("legacy users keep Today and unchanged routes", () => {
    expect(mobileCreateTabForPath("/plan")).toBe("today");
    expect(mobileCreateTabForPath("/")).toBe("today");
    expect(isMobileCreateAllowedPath("/")).toBe(false);
    expect(isMobileCreateAllowedPath("/research")).toBe(false);
    expect(mobileCreateTabForPath("/", { homeV2: false })).toBe("today");
    expect(isMobileCreateAllowedPath("/", { homeV2: false })).toBe(false);
  });

  it("Home v2 users get Home at / as the first tab", () => {
    expect(MOBILE_CREATE_HOME_PATH).toBe("/");
    expect(isMobileCreateAllowedPath("/", { homeV2: true })).toBe(true);
    expect(mobileCreateTabForPath("/", { homeV2: true })).toBe("home");
    expect(mobileCreateTabForPath("/plan", { homeV2: true })).toBe("home");
    expect(mobileCreateTabForPath("/studio", { homeV2: true })).toBe("write");
    expect(mobileCreateTabForPath("/scripts/9", { homeV2: true })).toBe("scripts");
    expect(mobileCreateTabForPath("/settings", { homeV2: true })).toBe("more");
  });

  it("Home v2 does not open other desktop routes in the installed app", () => {
    expect(isMobileCreateAllowedPath("/research", { homeV2: true })).toBe(false);
    expect(isMobileCreateAllowedPath("/dashboard", { homeV2: true })).toBe(false);
    expect(isMobileCreateAllowedPath("/viral-posts", { homeV2: true })).toBe(false);
  });
});
