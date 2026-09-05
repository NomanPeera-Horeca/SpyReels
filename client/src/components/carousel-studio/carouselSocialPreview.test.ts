import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  previewCaptionFromSlots,
  previewDisplayName,
  previewHandleLabel,
  socialPreviewTitle,
} from "./socialPreviewCopy";

const here = dirname(fileURLToPath(import.meta.url));

describe("carousel social preview", () => {
  it("uses real slot copy for the caption when present", () => {
    expect(previewCaptionFromSlots({ headline: "Cut the menu" })).toBe(
      "Cut the menu"
    );
    expect(previewCaptionFromSlots({})).toBe("");
    expect(previewHandleLabel("@horeca", "Noman")).toBe("horeca");
    expect(previewDisplayName("Noman Peera", "horeca")).toBe("Noman Peera");
    expect(socialPreviewTitle("instagram")).toBe("Instagram preview");
    expect(socialPreviewTitle("linkedin")).toBe("LinkedIn preview");
  });

  it("uses real icons and LinkedIn document controls, not fake engagement counts", () => {
    const preview = readFileSync(join(here, "CarouselSocialPreview.tsx"), "utf8");
    expect(preview).toContain("<Heart");
    expect(preview).toContain("<MessageCircle");
    expect(preview).toContain("<Send");
    expect(preview).toContain("<Bookmark");
    expect(preview).toContain("li-nav-pos");
    expect(preview).toContain("Previous slide");
    expect(preview).toContain("Next slide");
    expect(preview).not.toMatch(/312/);
    expect(preview).not.toMatch(/likes/);
    expect(preview).not.toMatch(/impressions/);
    expect(preview).not.toContain('className="btn small ghost"');
  });

  it("keeps Preview separate from the download package modal", () => {
    const studioApp = readFileSync(join(here, "CarouselStudioApp.tsx"), "utf8");
    expect(studioApp).toContain("CarouselSocialPreview");
    expect(studioApp).toContain("setSocialPreviewOpen(true)");
    expect(studioApp).not.toMatch(/openPackageModal\(false\)/);
    expect(studioApp).toContain("openPackageModal(true)");
    expect(studioApp).not.toMatch(/312/);
    expect(studioApp).not.toMatch(/2\.8%/);
    expect(studioApp).not.toMatch(/Performance score/);
    expect(studioApp).not.toMatch(/Save brand profile/);
    expect(studioApp).not.toMatch(/STUDIO_NAV_ITEMS/);
    expect(studioApp).toContain("studio-slide-fit");
    expect(studioApp).toContain("editor-content");
  });

  it("sizes the editor slide from the canvas, not a small fixed preview", () => {
    const css = readFileSync(join(here, "carouselStudio.css"), "utf8");
    expect(css).toContain("studio-slide-fit");
    expect(css).toContain("64vh");
    expect(css).not.toContain("min(46vh,470px)");
    expect(css).not.toContain("padding:12px 80px 16px 16px");
    expect(css).toContain("social-preview-modal.instagram");
    expect(css).toContain("social-slide-fill");
    expect(css).toContain("max-width:none!important");
    expect(css).toContain("li-nav-btn");
  });

  it("fills the social preview frame instead of leaving a 360px side strip", () => {
    const preview = readFileSync(join(here, "CarouselSocialPreview.tsx"), "utf8");
    const css = readFileSync(join(here, "carouselStudio.css"), "utf8");
    expect(preview).toContain("social-slide-fill");
    expect(preview).toContain('platform === "linkedin" ? "1 / 1" : "4 / 5"');
    expect(css).toContain(".cs .social-preview-modal.linkedin{width:min(540px,94vw)}");
    expect(css).toContain("[data-carousel-slide-id] > * > *");
    expect(css).toContain("flex:0 0 100%!important");
    expect(css).not.toContain(".cs .export-stage [data-carousel-slide-id] > * > *");
  });
});
