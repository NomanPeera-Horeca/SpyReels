import { describe, expect, it } from "vitest";
import {
  legacyHomepageAuthMode,
  publicAuthHandoffPath,
} from "./publicAuthHandoff";

describe("legacyHomepageAuthMode", () => {
  it("maps signup=1 and login=1", () => {
    expect(legacyHomepageAuthMode({ signup: "1" })).toBe("signup");
    expect(legacyHomepageAuthMode({ login: "1" })).toBe("login");
  });

  it("prefers signup when both are present", () => {
    expect(legacyHomepageAuthMode({ signup: "1", login: "1" })).toBe("signup");
  });

  it("ignores unrelated query", () => {
    expect(legacyHomepageAuthMode({ utm_source: "x" })).toBeNull();
  });
});

describe("publicAuthHandoffPath", () => {
  it("builds pricing auth handoff with returnTo", () => {
    expect(publicAuthHandoffPath("login")).toBe(
      "/pricing?auth=login&returnTo=%2Fresearch"
    );
    expect(publicAuthHandoffPath("signup")).toBe(
      "/pricing?auth=signup&returnTo=%2Fresearch"
    );
  });
});
