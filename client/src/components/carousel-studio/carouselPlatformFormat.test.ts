import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAROUSEL_PLATFORM_PRESETS,
  aspectFromPlatform,
  platformFromAspect,
} from "./carouselPlatformFormat";

const here = dirname(fileURLToPath(import.meta.url));

describe("carousel platform format contract", () => {
  it("uses Instagram 4:5 at 1080x1350 and LinkedIn 1:1 at 1080x1080", () => {
    expect(CAROUSEL_PLATFORM_PRESETS.instagram).toMatchObject({
      aspectRatio: "4:5",
      exportWidth: 1080,
      exportHeight: 1350,
    });
    expect(CAROUSEL_PLATFORM_PRESETS.linkedin).toMatchObject({
      aspectRatio: "1:1",
      exportWidth: 1080,
      exportHeight: 1080,
    });
    expect(aspectFromPlatform("instagram")).toBe("4:5");
    expect(aspectFromPlatform("linkedin")).toBe("1:1");
    expect(platformFromAspect("4:5")).toBe("instagram");
    expect(platformFromAspect("1:1")).toBe("linkedin");
    expect(platformFromAspect("9:16")).toBe("instagram");
  });

  it("wires the editor toggle to those presets and export override", () => {
    const studioApp = readFileSync(join(here, "CarouselStudioApp.tsx"), "utf8");
    expect(studioApp).toContain("aspectFromPlatform");
    expect(studioApp).toContain("platformFromAspect");
    expect(studioApp).toContain("updateAspectRatioMutation");
    expect(studioApp).toMatch(/applyPlatform\("instagram"\)/);
    expect(studioApp).toMatch(/applyPlatform\("linkedin"\)/);
    expect(studioApp).not.toMatch(
      /function aspectFromPlatform\(_platform: Platform\)/
    );
    expect(studioApp).not.toContain("LinkedIn 4:5 format applied");
  });
});
