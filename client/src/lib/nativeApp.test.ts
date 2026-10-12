import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock("@shared/spyreelsOrigins", () => ({
  appOrigin: () => "https://app.spyreels.ai",
  SPYREELS_APP_ORIGIN_DEFAULT: "https://app.spyreels.ai",
}));

import { Capacitor } from "@capacitor/core";
import { getAppOrigin, resolveAppUrl } from "./nativeApp";

describe("nativeApp origin resolution", () => {
  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.stubEnv("VITE_APP_ORIGIN", "");
    vi.stubGlobal("window", {
      location: { origin: "https://spyreels.ai", hostname: "spyreels.ai" },
    });
  });

  it("points apex marketing web clients at the product API host", () => {
    expect(getAppOrigin()).toBe("https://app.spyreels.ai");
    expect(resolveAppUrl("/api/trpc")).toBe("https://app.spyreels.ai/api/trpc");
  });

  it("stays relative when the page is already on the product host", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://app.spyreels.ai",
        hostname: "app.spyreels.ai",
      },
    });
    expect(getAppOrigin()).toBe("");
    expect(resolveAppUrl("/api/trpc")).toBe("/api/trpc");
  });

  it("honors VITE_APP_ORIGIN on web when it differs from the page origin", () => {
    vi.stubEnv("VITE_APP_ORIGIN", "https://app.spyreels.ai");
    vi.stubGlobal("window", {
      location: { origin: "https://spyreels.ai", hostname: "spyreels.ai" },
    });
    expect(getAppOrigin()).toBe("https://app.spyreels.ai");
  });

  it("ignores VITE_APP_ORIGIN when it matches the current page origin", () => {
    vi.stubEnv("VITE_APP_ORIGIN", "https://app.spyreels.ai");
    vi.stubGlobal("window", {
      location: {
        origin: "https://app.spyreels.ai",
        hostname: "app.spyreels.ai",
      },
    });
    expect(getAppOrigin()).toBe("");
  });

  it("uses VITE_APP_ORIGIN inside the native Capacitor shell", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.stubEnv("VITE_APP_ORIGIN", "https://app.spyreels.ai");
    expect(getAppOrigin()).toBe("https://app.spyreels.ai");
    expect(resolveAppUrl("/api/trpc")).toBe("https://app.spyreels.ai/api/trpc");
  });

  it("falls back to appOrigin() in native when VITE_APP_ORIGIN is unset", () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.stubEnv("VITE_APP_ORIGIN", "");
    expect(getAppOrigin()).toBe("https://app.spyreels.ai");
  });
});
