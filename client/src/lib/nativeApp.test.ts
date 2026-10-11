import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock("@shared/spyreelsOrigins", () => ({
  appOrigin: () => "https://app.spyreels.ai",
}));

import { Capacitor } from "@capacitor/core";
import { getAppOrigin, resolveAppUrl } from "./nativeApp";

describe("nativeApp origin resolution", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.stubEnv("VITE_APP_ORIGIN", "https://app.spyreels.ai");
  });

  it("ignores VITE_APP_ORIGIN in the web browser so marketing stays same-origin", () => {
    expect(getAppOrigin()).toBe("");
    expect(resolveAppUrl("/api/trpc")).toBe("/api/trpc");
  });

  it("uses VITE_APP_ORIGIN inside the native Capacitor shell", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    expect(getAppOrigin()).toBe("https://app.spyreels.ai");
    expect(resolveAppUrl("/api/trpc")).toBe("https://app.spyreels.ai/api/trpc");
  });

  it("falls back to appOrigin() in native when VITE_APP_ORIGIN is unset", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.stubEnv("VITE_APP_ORIGIN", "");
    expect(getAppOrigin()).toBe("https://app.spyreels.ai");
  });
});
