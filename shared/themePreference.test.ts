import { describe, expect, it } from "vitest";
import { NEW_ACCOUNT_THEME, parseAccountTheme, THEME_PREFERENCE_VALUES } from "./themePreference";

describe("account theme preference", () => {
  it("defaults new accounts to Light", () => {
    expect(NEW_ACCOUNT_THEME).toBe("light");
  });

  it("offers Light, Dark and optional System only", () => {
    expect([...THEME_PREFERENCE_VALUES]).toEqual(["light", "dark", "system"]);
  });

  it("keeps legacy accounts unset (null), so their behavior does not change", () => {
    expect(parseAccountTheme(null)).toBeNull();
    expect(parseAccountTheme(undefined)).toBeNull();
    expect(parseAccountTheme("")).toBeNull();
  });

  it("accepts saved explicit choices and rejects unknown values", () => {
    expect(parseAccountTheme("light")).toBe("light");
    expect(parseAccountTheme("dark")).toBe("dark");
    expect(parseAccountTheme("system")).toBe("system");
    expect(parseAccountTheme("sepia")).toBeNull();
    expect(parseAccountTheme(1)).toBeNull();
  });
});
