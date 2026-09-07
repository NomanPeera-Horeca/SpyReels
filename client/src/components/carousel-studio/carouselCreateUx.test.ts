import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

describe("carousel create UX reuse", () => {
  it("uses one shared source detector and real progress mapping", () => {
    const landing = read("CarouselLanding.tsx");
    const loading = read("CarouselLoading.tsx");
    const studio = read("CarouselStudioApp.tsx");
    const hub = read("../../pages/Carousels.tsx");
    expect(landing).toContain("detectCarouselSource");
    expect(landing).toContain("looksLikeCarouselSourceUrl");
    expect(loading).toContain("resolveCarouselLoadingView");
    expect(studio).toContain("CarouselLanding");
    expect(studio).toContain("CarouselLoading");
    expect(studio).toContain("CAROUSEL_EDITOR_HANDOFF_MS");
    expect(studio).toContain("shouldWatchCarouselRemakeStatus");
    expect(studio).toContain("shouldOpenEditorFromRemakeStatus");
    expect(studio).toContain("shouldResumeCarouselLoading");
    expect(studio).toContain("abandonGenerateRun");
    expect(studio).toContain("pickRealSlideTitle");
    expect(studio).toContain("resolveCarouselLaunchReplay");
    expect(studio).toContain("trackCarouselCreateEvent");
    expect(hub).toContain("createCarouselLaunchId");
    expect(hub).toContain("trackCarouselCreateEvent");
    expect(studio).not.toContain("PROGRESS_STAGE_ROWS");
    expect(hub).toContain("CarouselLanding");
    expect(hub).toContain("buildCarouselGenerateHref");
    expect(hub).toContain("slideStructure");
    expect(hub).toContain("slotValues");
    expect(landing).toContain("CarouselRecentThumb");
    const recentThumb = read("CarouselRecentThumb.tsx");
    expect(recentThumb).toContain("CarouselRenderer");
    expect(recentThumb).toContain("thumbnailUrl");
  });

  it("does not simulate loading stages with timers", () => {
    const loading = read("CarouselLoading.tsx");
    const progress = read("../../../../shared/carouselLoadingProgress.ts");
    expect(loading).not.toContain("setTimeout");
    expect(loading).not.toContain("setInterval");
    expect(progress).not.toContain("setTimeout");
    expect(progress).toContain("writing_copy");
    expect(progress).toContain("generating_images");
    expect(progress).toContain("saving");
  });
});
