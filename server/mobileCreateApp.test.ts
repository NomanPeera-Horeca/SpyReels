import { describe, expect, it } from "vitest";
import {
  isMobileCreateAllowedPath,
  mobileCreateTabForPath,
} from "@shared/mobileCreateApp";

describe("mobileCreateApp", () => {
  it("maps paths to tabs", () => {
    expect(mobileCreateTabForPath("/plan")).toBe("today");
    expect(mobileCreateTabForPath("/studio")).toBe("write");
    expect(mobileCreateTabForPath("/scripts")).toBe("scripts");
    expect(mobileCreateTabForPath("/scripts/42")).toBe("scripts");
    expect(mobileCreateTabForPath("/settings")).toBe("more");
  });

  it("allows create routes only", () => {
    expect(isMobileCreateAllowedPath("/plan")).toBe(true);
    expect(isMobileCreateAllowedPath("/scripts/1")).toBe(true);
    expect(isMobileCreateAllowedPath("/dashboard")).toBe(false);
    expect(isMobileCreateAllowedPath("/research")).toBe(false);
  });
});
