import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function read(rel: string): string {
  return readFileSync(join(here, rel), "utf8");
}

const FAMILY_FILES = [
  "../CarouselStoryPremiumFamily.tsx",
  "../CarouselComparisonPremiumFamily.tsx",
  "../CarouselFrameworkPremiumFamily.tsx",
  "../CarouselRoadmapPremiumFamily.tsx",
  "../CarouselBreakdownPremiumFamily.tsx",
  "../CarouselSlideHookBoldCenter.tsx",
  "../CarouselSlideCtaBoldCenter.tsx",
  "../CarouselSlideListItemNumbered.tsx",
];

describe("carousel text inspector architecture", () => {
  it("reuses slot-value persistence instead of a second text store", () => {
    const app = read("CarouselStudioApp.tsx");
    expect(app).toContain("carouselRemake.updateSlotValues");
    expect(app).toContain("handleSlotChange");
    expect(app).toContain("CarouselTextInspector");
    expect(app).not.toContain("textEditsV2");
  });

  it("keeps selection outlines on the editor stage only", () => {
    const css = read("carouselStudio.css");
    expect(css).toContain(
      '.cs .studio-slide-stage [data-carousel-slot-selected="true"]'
    );
    expect(css).not.toContain(".cs .export-stage [data-carousel-slot-selected");
    expect(css).not.toContain(".cs .social-slide-fill [data-carousel-slot-selected");
    expect(css).toContain(".cs .editor-shell.has-inspector");
  });

  it("forwards editable slot commits in current generated families", () => {
    for (const file of FAMILY_FILES) {
      const source = read(file);
      expect(source).toContain("CarouselEditableText");
      expect(source).toContain("onCommit={onSlotChange}");
    }
  });

  it("selects split visible lines through the real underlying slot", () => {
    const breakdown = read("../CarouselBreakdownPremiumFamily.tsx");
    const roadmap = read("../CarouselRoadmapPremiumFamily.tsx");
    const comparison = read("../CarouselComparisonPremiumFamily.tsx");
    expect(breakdown).toContain("selectOnly");
    expect(breakdown).toContain('slotId={support ? "support" : "body"}');
    expect(roadmap).toContain("selectOnly");
    expect(roadmap).toContain('slotId="body"');
    expect(roadmap).not.toContain("editable && index === 0");
    expect(comparison).toContain("selectOnly");
  });

  it("does not reserve the inspector when nothing is selected", () => {
    const app = read("CarouselStudioApp.tsx");
    expect(app).toContain("textSelection ? \" has-inspector\"");
    expect(app).toContain("textSelection && currentSlideSpec");
  });
});
