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
    expect(css).toContain(
      '.cs .studio-slide-stage [data-carousel-image-selected="true"]'
    );
    expect(css).not.toContain(".cs .export-stage [data-carousel-slot-selected");
    expect(css).not.toContain(".cs .social-slide-fill [data-carousel-slot-selected");
    expect(css).not.toContain(".cs .export-stage [data-carousel-image-selected");
    expect(css).not.toContain(".cs .social-slide-fill [data-carousel-image-selected");
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
    const framework = read("../CarouselFrameworkPremiumFamily.tsx");
    expect(breakdown).toContain("selectOnly");
    expect(breakdown).toContain('slotId={support ? "support" : "body"}');
    expect(roadmap).toContain("selectOnly");
    expect(roadmap).toContain('slotId="body"');
    expect(roadmap).not.toContain("editable && index === 0");
    expect(comparison).toContain("selectOnly");
    expect(framework).toContain("selectOnly");
    expect(framework).toContain("partLabelSlotId");
    expect(framework).toContain("quadrantSourceSlotId");
    expect(framework).not.toContain("{line ?? \"\"}");
    expect(framework).not.toContain("{extra[index] ?? String(index + 1)}");
  });

  it("does not reserve the inspector when nothing is selected", () => {
    const app = read("CarouselStudioApp.tsx");
    expect(app).toContain("textSelection || imageSelection ? \" has-inspector\"");
    expect(app).toContain("textSelection && currentSlideSpec");
    expect(app).toContain("imageSelection && currentSlideSpec");
    expect(app).toContain("CarouselImageInspector");
    expect(app).not.toContain("imageEditsV2");
  });

  it("selects images by slot id and reuses the remake image URL map", () => {
    const app = read("CarouselStudioApp.tsx");
    const image = read("../CarouselEditableImage.tsx");
    expect(image).toContain("data-carousel-image-slot-id");
    expect(image).toContain("onSelectImage");
    expect(app).toContain("carouselRemake.uploadSlideImage");
    expect(app).toContain("carouselRemake.updateImageUrls");
    expect(app).toContain("carouselRemake.updateImageFrame");
    expect(app).not.toContain("carouselRemake.regenerateSlideImage");
    expect(app).not.toContain("onRegenerate");
    expect(app).toContain("replaceImageUrls");
    expect(app).toContain("replaceImageFrames");
    expect(app).toContain("carouselRemake.manageSlides");
    expect(app).toContain("carouselRemake.replaceEditorState");
    expect(app).toContain("CarouselSlideRail");
    expect(app).not.toContain("slideEditsV2");
    const inspector = read("CarouselImageInspector.tsx");
    expect(inspector).toContain("onRegenerate?");
    expect(inspector).toContain("Regenerate with AI");
    const router = readFileSync(
      join(here, "../../../../server/routers/carouselRemakeRouter.ts"),
      "utf8"
    );
    expect(router).toContain("regenerateSlideImage:");
    expect(router).toContain("manageSlides:");
    expect(router).toContain("replaceEditorState:");
    expect(router).toContain("slideStructureJson: state.slideStructure");
    expect(router).toContain("slotValuesJson: state.slotValues");
    expect(router).toContain("slotStyleOverridesJson: state.slotStyles");
    expect(router).toContain("imageUrlsJson: state.imageUrls");
    expect(router).toContain("imageFrameOverridesJson: state.imageFrames");
    expect(router).toContain("Does not mutate templates");
  });

  it("wraps image-bearing premium families with real image slots", () => {
    const familyFiles = [
      "../CarouselStoryPremiumFamily.tsx",
      "../CarouselComparisonPremiumFamily.tsx",
      "../CarouselFrameworkPremiumFamily.tsx",
      "../CarouselRoadmapPremiumFamily.tsx",
      "../CarouselBreakdownPremiumFamily.tsx",
    ];
    for (const file of familyFiles) {
      const source = read(file);
      expect(source).toContain("CarouselEditableImage");
      expect(source).toContain('slotId="photo"');
    }
    const comparison = read("../CarouselComparisonPremiumFamily.tsx");
    expect(comparison).toContain('slotId="photo_b"');
  });
});
